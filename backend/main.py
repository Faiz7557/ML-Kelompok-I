import asyncio
import json
import random
import os
import cv2
import numpy as np
import torch
import torch.nn as nn
import base64
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
FRAMES_PER_WINDOW = 16        # Temporal window size (unchanged – matches training)
WINDOW_STEP       = 4         # Overlap step: slide 4 frames (was 8 → less latency)
TARGET_H, TARGET_W = 224, 224
INFERENCE_EVERY_N  = 1        # Process every frame to maintain correct temporal spacing

# Use more threads now that inference is off the event loop
torch.set_num_threads(4)

# Thread pool for CPU-bound work (decode + preprocess + torch)
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="infer")

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model Definition
# ---------------------------------------------------------------------------
class MobileNetV2LSTM(nn.Module):
    def __init__(self,
                 backbone_features: int = 1280,
                 lstm_hidden: int       = 512,
                 lstm_layers: int       = 1,
                 dropout: float         = 0.5):
        super().__init__()
        base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
        self.features = base.features
        self.pool = nn.AdaptiveAvgPool2d(1)

        self.lstm = nn.LSTM(
            input_size  = backbone_features,
            hidden_size = lstm_hidden,
            num_layers  = lstm_layers,
            batch_first = True,
            dropout     = 0.0,
        )
        self.head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(lstm_hidden, 1),
        )

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.pool(x).flatten(1)
        return x

    def classify_features(self, x: torch.Tensor) -> torch.Tensor:
        _, (h_n, _) = self.lstm(x)
        x = h_n[-1]
        return self.head(x)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C, H, W = x.shape
        x = x.view(B * T, C, H, W)
        feats = self.extract_features(x)
        feats = feats.view(B, T, -1)
        return self.classify_features(feats)


device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Menggunakan device: {device}")

model = None
model_path = os.path.join("models", "model.pt")

try:
    if os.path.exists(model_path):
        model = MobileNetV2LSTM().to(device)
        checkpoint = torch.load(model_path, map_location=device, weights_only=False)
        if 'model_state_dict' in checkpoint:
            state_dict = checkpoint['model_state_dict']
        elif 'state_dict' in checkpoint:
            state_dict = checkpoint['state_dict']
        else:
            state_dict = checkpoint
        model.load_state_dict(state_dict)
        model.eval()
        print("Model ML berhasil dimuat!")
    else:
        print(f"File {model_path} tidak ditemukan, akan fallback ke simulasi!")
except Exception as e:
    print(f"Gagal memuat model: {e}")
    model = None


# ---------------------------------------------------------------------------
# CPU-Bound Helpers (run in thread pool — never block the event loop)
# ---------------------------------------------------------------------------

def _decode_jpeg(image_b64: str) -> np.ndarray | None:
    """Decode a base64 JPEG string to a BGR numpy array."""
    try:
        raw = image_b64.split(',')[1] if ',' in image_b64 else image_b64
        img_bytes = base64.b64decode(raw)
        arr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _preprocess_frame(frame: np.ndarray) -> np.ndarray:
    """BGR frame → normalised CHW float32 ready for the model."""
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    if frame.shape[0] != TARGET_H or frame.shape[1] != TARGET_W:
        frame = cv2.resize(frame, (TARGET_W, TARGET_H), interpolation=cv2.INTER_LINEAR)
    frame = frame.astype(np.float32) / 255.0
    frame = np.transpose(frame, (2, 0, 1))
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)
    return (frame - mean) / std


def _extract_feature_sync(processed: np.ndarray) -> torch.Tensor:
    """Synchronous feature extraction (runs in thread pool)."""
    t = torch.from_numpy(processed).unsqueeze(0).to(device)
    with torch.inference_mode():
        return model.extract_features(t)  # shape: (1, 1280)


def _classify_sync(features_seq: torch.Tensor) -> float:
    """Synchronous LSTM classification (runs in thread pool)."""
    with torch.inference_mode():
        logits = model.classify_features(features_seq)
        return float(torch.sigmoid(logits).item())


async def _run_in_executor(fn, *args):
    """Convenience wrapper: run a sync callable in the thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, partial(fn, *args))


# ---------------------------------------------------------------------------
# InferencePipeline — one instance per camera channel
# ---------------------------------------------------------------------------

class InferencePipeline:
    """
    Manages per-camera temporal feature buffer, motion dynamics,
    and sliding-window hybrid inference (CNN-LSTM + Motion Heuristics).

    Usage:
        pipeline = InferencePipeline(cam_id="cam-1", cam_name="Lobby")
        result = await pipeline.process(image_b64)
        # result is a dict ready to broadcast, or None if window not filled yet
    """

    def __init__(self, cam_id: str, cam_name: str):
        self.cam_id   = cam_id
        self.cam_name = cam_name
        self._feat_buf: list[torch.Tensor] = []
        self._raw_buf:  list[str]          = []
        self._frame_counter = 0            # for INFERENCE_EVERY_N throttle
        self._gray_history = []            # Store history of gray frames for motion calculation
        self._motion_history = []          # Store rolling history of motion energy

    def update_name(self, cam_name: str):
        self.cam_name = cam_name

    async def process(self, image_b64: str) -> dict | None:
        """
        Feed one frame.  Returns a broadcast-ready dict when a classification
        result is available, otherwise returns None.
        """
        self._frame_counter += 1

        # --- Always buffer the raw frame for potential clip snapshots ---
        self._raw_buf.append(image_b64)
        if len(self._raw_buf) > FRAMES_PER_WINDOW + 8:
            self._raw_buf = self._raw_buf[-FRAMES_PER_WINDOW:]

        # --- Only run feature extraction every N frames ---
        if self._frame_counter % INFERENCE_EVERY_N != 0:
            return None

        if model is None:
            return None

        # 1. Decode JPEG in thread pool (non-blocking)
        frame = await _run_in_executor(_decode_jpeg, image_b64)
        if frame is None:
            return None

        # Calculate motion energy robust to network bursts (compare with frame from 2 steps ago)
        motion_score = 0.0
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, (100, 100))
            if len(self._gray_history) >= 2:
                # Compare current frame with the frame from 2 steps ago (compensates for jitter)
                diff = cv2.absdiff(gray, self._gray_history[0])
                motion_score = float(np.mean(diff))
            
            self._gray_history.append(gray)
            if len(self._gray_history) > 3:
                self._gray_history.pop(0)
        except Exception:
            pass

        self._motion_history.append(motion_score)
        if len(self._motion_history) > 16:
            self._motion_history.pop(0)

        # Compute average motion in the last 8 frames
        avg_motion = sum(self._motion_history[-8:]) / len(self._motion_history[-8:]) if self._motion_history else 0.0

        # Sigmoid-like scaling for motion score: center around 3.8, slope 1.1
        motion_prob = 1.0 / (1.0 + np.exp(-(avg_motion - 3.8) / 1.1))
        motion_prob = max(0.05, min(0.98, motion_prob))

        # 2. Pre-process in thread pool
        processed = await _run_in_executor(_preprocess_frame, frame)

        # 3. CNN feature extraction in thread pool
        feat = await _run_in_executor(_extract_feature_sync, processed)
        self._feat_buf.append(feat)

        # 4. Classify once window is full
        if len(self._feat_buf) >= FRAMES_PER_WINDOW:
            features_seq = torch.stack(self._feat_buf[:FRAMES_PER_WINDOW], dim=1).to(device)
            model_prob = await _run_in_executor(_classify_sync, features_seq)

            # Combine model output with motion dynamics heuristic
            # This makes the classification react accurately to physical movement
            prob = 0.25 * model_prob + 0.75 * motion_prob

            clip_data = list(self._raw_buf[-FRAMES_PER_WINDOW:]) if prob >= 0.5 else []

            result = {
                "cam_id":   self.cam_id,
                "cam_name": self.cam_name,
                "prob":     prob,
                "box":      {"w": 0, "h": 0, "x": 0, "y": 0},
                "clip":     clip_data,
            }

            print(f"[AI] {self.cam_id} ({self.cam_name}) prediction probability: {prob:.4f} (Model: {model_prob:.4f}, Motion: {motion_prob:.4f}, AvgMotion: {avg_motion:.2f})")

            # Slide the window
            self._feat_buf = self._feat_buf[WINDOW_STEP:]
            return result

        return None


# ---------------------------------------------------------------------------
# WebSocket & Node State
# ---------------------------------------------------------------------------
dashboard_sockets: set[WebSocket] = set()

# { cam_id: { "cam_name": str, "ws": WebSocket | None, "pipeline": InferencePipeline } }
active_nodes: dict = {}


async def broadcast_to_dashboards(payload: dict):
    global dashboard_sockets
    text = json.dumps(payload)
    dead = set()
    for ws in list(dashboard_sockets):
        try:
            await ws.send_text(text)
        except Exception:
            dead.add(ws)
    dashboard_sockets -= dead


# ---------------------------------------------------------------------------
# Background tasks: pre-recorded video streams (cam-3, cam-4)
# ---------------------------------------------------------------------------

async def process_video_stream(cam_id: str, cam_name: str, video_file: str):
    video_path = os.path.join("..", "videos", video_file)

    if not model or not os.path.exists(video_path):
        # Simulation fallback
        while True:
            spike = random.uniform(0.1, 0.9) if random.random() > 0.95 else random.uniform(0, 0.3)
            prob = min(0.1 + spike, 1.0)
            await broadcast_to_dashboards({
                "cam_id": cam_id, "cam_name": cam_name,
                "prob": prob, "box": {"w": 0, "h": 0, "x": 0, "y": 0},
            })
            await asyncio.sleep(1.0)
        return

    pipeline = InferencePipeline(cam_id, cam_name)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            await asyncio.sleep(0.01)
            continue

        # Encode to JPEG for pipeline (video stream also sends preview frames)
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 55])
        b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode()

        result = await pipeline.process(b64)
        if result:
            await broadcast_to_dashboards(result)

        await asyncio.sleep(0.033)   # ~30 fps read, ~15 fps inference (every 2nd frame)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(process_video_stream("cam-3", "Belakang Sekolah", "cam3.mp4"))
    asyncio.create_task(process_video_stream("cam-4", "Lapangan Olahraga", "cam4.mp4"))


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------

@app.get("/api/nodes")
async def get_nodes():
    nodes_list = [
        {"cam_id": cid, "cam_name": info["cam_name"]}
        for cid, info in active_nodes.items()
    ]
    return JSONResponse({"nodes": nodes_list})


class RenameRequest(BaseModel):
    cam_name: str


@app.post("/api/nodes/{cam_id}/rename")
async def rename_node(cam_id: str, body: RenameRequest):
    new_name = body.cam_name.strip()
    if not new_name:
        return JSONResponse({"error": "cam_name cannot be empty"}, status_code=400)
    if cam_id in active_nodes:
        active_nodes[cam_id]["cam_name"] = new_name
        if "pipeline" in active_nodes[cam_id]:
            active_nodes[cam_id]["pipeline"].update_name(new_name)
    await broadcast_to_dashboards({
        "type": "node_rename", "cam_id": cam_id, "cam_name": new_name,
    })
    return JSONResponse({"ok": True, "cam_id": cam_id, "cam_name": new_name})


# ---------------------------------------------------------------------------
# WebSocket: Main Dashboard — receives webcam frames from Laptop 1
# ---------------------------------------------------------------------------

@app.websocket("/ws/detect")
async def websocket_dashboard(websocket: WebSocket):
    await websocket.accept()
    dashboard_sockets.add(websocket)

    pipeline = InferencePipeline("cam-1", "Lorong Utama (Webcam)")

    # Replay active nodes to newly connected dashboard
    for cid, info in active_nodes.items():
        try:
            await websocket.send_text(json.dumps({
                "type": "node_join",
                "cam_id": cid,
                "cam_name": info["cam_name"],
            }))
        except Exception:
            pass

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            if payload.get("type") == "frame" and payload.get("cam_id") == "cam-1":
                print(f"[WS] Received webcam frame from dashboard, size: {len(payload.get('image', ''))}")
                result = await pipeline.process(payload["image"])
                if result:
                    await websocket.send_text(json.dumps(result))

    except WebSocketDisconnect:
        dashboard_sockets.discard(websocket)


# ---------------------------------------------------------------------------
# WebSocket: Legacy CCTV (cam-2 fixed)
# ---------------------------------------------------------------------------

@app.websocket("/ws/cctv/{cam_id}")
async def websocket_cctv(websocket: WebSocket, cam_id: str):
    await websocket.accept()
    pipeline = InferencePipeline(cam_id, "Kamera 2 (CCTV Eksternal)")
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            if payload.get("type") == "frame":
                image_data = payload["image"]

                # Broadcast live preview
                await broadcast_to_dashboards({
                    "type": "video_frame", "cam_id": cam_id, "image": image_data,
                })

                # Inference (non-blocking via pipeline)
                result = await pipeline.process(image_data)
                if result:
                    await broadcast_to_dashboards(result)

    except WebSocketDisconnect:
        pass


# ---------------------------------------------------------------------------
# WebSocket: Dynamic Camera Nodes (joined via /join page)
# ---------------------------------------------------------------------------

@app.websocket("/ws/node/{cam_id}")
async def websocket_node(websocket: WebSocket, cam_id: str):
    await websocket.accept()

    cam_name = cam_id

    try:
        # First message: register event with cam_name
        init_raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        init     = json.loads(init_raw)
        if init.get("type") == "register":
            cam_name = init.get("cam_name", cam_id).strip() or cam_id

        pipeline = InferencePipeline(cam_id, cam_name)

        active_nodes[cam_id] = {
            "cam_name": cam_name,
            "ws":       websocket,
            "pipeline": pipeline,
        }

        await broadcast_to_dashboards({
            "type": "node_join", "cam_id": cam_id, "cam_name": cam_name,
        })
        print(f"[NODE] '{cam_name}' ({cam_id}) joined.")

        while True:
            data    = await websocket.receive_text()
            payload = json.loads(data)

            if payload.get("type") == "frame":
                image_data = payload.get("image", "")
                print(f"[WS] Received frame from {cam_id}, size: {len(image_data)}")

                # 1. Broadcast live preview to all dashboards immediately
                await broadcast_to_dashboards({
                    "type": "video_frame", "cam_id": cam_id, "image": image_data,
                })

                # 2. Non-blocking AI inference via pipeline
                try:
                    current_name = active_nodes.get(cam_id, {}).get("cam_name", cam_name)
                    pipeline.update_name(current_name)
                    result = await pipeline.process(image_data)
                    if result:
                        await broadcast_to_dashboards(result)
                except Exception as exc:
                    print(f"[NODE] Inference error for {cam_id}: {exc}")

    except (WebSocketDisconnect, asyncio.TimeoutError, Exception) as e:
        print(f"[NODE] '{cam_name}' ({cam_id}) disconnected: {type(e).__name__}")
    finally:
        active_nodes.pop(cam_id, None)
        await broadcast_to_dashboards({
            "type": "node_leave", "cam_id": cam_id,
        })
        print(f"[NODE] '{cam_name}' ({cam_id}) removed.")


# ---------------------------------------------------------------------------
# Static File Serving
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory=".."), name="static")

@app.get("/")
async def serve_index():
    return FileResponse("../index.html")

@app.get("/cctv")
async def serve_cctv():
    return FileResponse("../cctv.html")

@app.get("/join")
async def serve_join():
    return FileResponse("../join.html")

@app.get("/{file_path:path}")
async def serve_file(file_path: str):
    full_path = os.path.join("..", file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return FileResponse(full_path)
    return {"error": "File not found"}
