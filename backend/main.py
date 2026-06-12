import asyncio
import json
import random
import os
import cv2
import numpy as np
import torch
import torch.nn as nn
import base64
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
FRAMES_PER_WINDOW = 16
TARGET_H, TARGET_W = 224, 224

# Model Definition
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

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C, H, W = x.shape
        x = x.view(B * T, C, H, W)
        x = self.features(x)
        x = self.pool(x).flatten(1)
        x = x.view(B, T, -1)
        _, (h_n, _) = self.lstm(x)
        x = h_n[-1]
        logits = self.head(x)
        return logits

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Menggunakan device: {device}")

# Inisialisasi Model
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
        print("Model ML nyata berhasil dimuat!")
    else:
        print(f"File {model_path} tidak ditemukan, akan fallback ke simulasi!")
except Exception as e:
    print(f"Gagal memuat model: {e}")
    model = None

# Helper Video Processing
def preprocess_frame(frame):
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    frame = cv2.resize(frame, (TARGET_W, TARGET_H), interpolation=cv2.INTER_LINEAR)
    frame = frame.astype(np.float32) / 255.0
    frame = np.transpose(frame, (2, 0, 1))
    mean = np.array([0.485, 0.456, 0.406]).reshape(3, 1, 1)
    std = np.array([0.229, 0.224, 0.225]).reshape(3, 1, 1)
    frame = (frame - mean) / std
    return frame


# --- WEBSOCKET STATE ---
dashboard_sockets = set()

# Background task for Cam-3 and Cam-4 (recorded videos)
async def process_video_stream(cam_id: str, cam_name: str, video_file: str):
    video_path = os.path.join("..", "videos", video_file)
    
    if not model or not os.path.exists(video_path):
        while True:
            spike = random.uniform(0.1, 0.9) if random.random() > 0.95 else random.uniform(0, 0.3)
            prob = min(0.1 + spike, 1.0)
            payload = {"cam_id": cam_id, "cam_name": cam_name, "prob": prob, "box": {"w": 0, "h": 0, "x": 0, "y": 0}}
            for ws in list(dashboard_sockets):
                try:
                    await ws.send_text(json.dumps(payload))
                except:
                    pass
            await asyncio.sleep(1.0)
            
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return

    frames_buffer = []
    raw_frames_buffer = []
    while True:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue
            
        processed_frame = preprocess_frame(frame)
        frames_buffer.append(processed_frame)
        
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
        b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
        raw_frames_buffer.append(b64)
        
        if len(frames_buffer) == FRAMES_PER_WINDOW:
            input_tensor = torch.tensor(np.array(frames_buffer), dtype=torch.float32).unsqueeze(0).to(device)
            with torch.no_grad():
                logits = model(input_tensor)
                prob = torch.sigmoid(logits).item()
            
            clip_data = []
            if prob >= 0.5:
                clip_data = list(raw_frames_buffer)
                
            payload = {"cam_id": cam_id, "cam_name": cam_name, "prob": prob, "box": {"w": 0, "h": 0, "x": 0, "y": 0}, "clip": clip_data}
            for ws in list(dashboard_sockets):
                try:
                    await ws.send_text(json.dumps(payload))
                except:
                    pass
            frames_buffer = frames_buffer[8:]
            raw_frames_buffer = raw_frames_buffer[8:]
        await asyncio.sleep(0.05)


@app.on_event("startup")
async def startup_event():
    # Start simulating/playing offline videos for cam-3 and cam-4 in the background
    asyncio.create_task(process_video_stream("cam-3", "Belakang Sekolah", "cam3.mp4"))
    asyncio.create_task(process_video_stream("cam-4", "Lapangan Olahraga", "cam4.mp4"))

@app.websocket("/ws/detect")
async def websocket_dashboard(websocket: WebSocket):
    """Endpoint for the main dashboard (Laptop 1)"""
    await websocket.accept()
    dashboard_sockets.add(websocket)
    frames_buffer = []
    raw_frames_buffer = []
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            if payload.get("type") == "frame" and payload.get("cam_id") == "cam-1":
                img_b64 = payload["image"].split(',')[1] if ',' in payload["image"] else payload["image"]
                img_data = base64.b64decode(img_b64)
                np_arr = np.frombuffer(img_data, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                
                if frame is not None and model is not None:
                    processed_frame = preprocess_frame(frame)
                    frames_buffer.append(processed_frame)
                    raw_frames_buffer.append(payload["image"])
                    if len(frames_buffer) == FRAMES_PER_WINDOW:
                        input_tensor = torch.tensor(np.array(frames_buffer), dtype=torch.float32).unsqueeze(0).to(device)
                        with torch.no_grad():
                            logits = model(input_tensor)
                            prob = torch.sigmoid(logits).item()
                            
                        clip_data = []
                        if prob >= 0.5:
                            clip_data = list(raw_frames_buffer)
                            
                        response = {
                            "cam_id": "cam-1",
                            "cam_name": "Lorong Utama (Webcam)",
                            "prob": prob,
                            "box": {"w": 0, "h": 0, "x": 0, "y": 0},
                            "clip": clip_data
                        }
                        await websocket.send_text(json.dumps(response))
                        frames_buffer = frames_buffer[8:]
                        raw_frames_buffer = raw_frames_buffer[8:]
    except WebSocketDisconnect:
        dashboard_sockets.remove(websocket)


@app.websocket("/ws/cctv/{cam_id}")
async def websocket_cctv(websocket: WebSocket, cam_id: str):
    """Endpoint for remote CCTV clients (Laptop 2)"""
    await websocket.accept()
    frames_buffer = []
    raw_frames_buffer = []
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            if payload.get("type") == "frame":
                # 1. Broadcast the raw video frame to the Dashboard so they can watch the live CCTV
                broadcast_msg = {
                    "type": "video_frame",
                    "cam_id": cam_id,
                    "image": payload["image"]
                }
                for ws in list(dashboard_sockets):
                    try:
                        await ws.send_text(json.dumps(broadcast_msg))
                    except:
                        pass
                
                # 2. Process AI Inference
                img_b64 = payload["image"].split(',')[1] if ',' in payload["image"] else payload["image"]
                img_data = base64.b64decode(img_b64)
                np_arr = np.frombuffer(img_data, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                
                if frame is not None and model is not None:
                    processed_frame = preprocess_frame(frame)
                    frames_buffer.append(processed_frame)
                    raw_frames_buffer.append(payload["image"])
                    if len(frames_buffer) == FRAMES_PER_WINDOW:
                        input_tensor = torch.tensor(np.array(frames_buffer), dtype=torch.float32).unsqueeze(0).to(device)
                        with torch.no_grad():
                            logits = model(input_tensor)
                            prob = torch.sigmoid(logits).item()
                            
                        clip_data = []
                        if prob >= 0.5:
                            clip_data = list(raw_frames_buffer)
                            
                        response = {
                            "cam_id": cam_id,
                            "cam_name": "Kamera 2 (CCTV Eksternal)",
                            "prob": prob,
                            "box": {"w": 0, "h": 0, "x": 0, "y": 0},
                            "clip": clip_data
                        }
                        for ws in list(dashboard_sockets):
                            try:
                                await ws.send_text(json.dumps(response))
                            except:
                                pass
                        frames_buffer = frames_buffer[8:]
                        raw_frames_buffer = raw_frames_buffer[8:]
    except WebSocketDisconnect:
        pass


# Serving Static Frontend HTML/JS/CSS
app.mount("/static", StaticFiles(directory=".."), name="static")

@app.get("/")
async def serve_index():
    return FileResponse("../index.html")

@app.get("/cctv")
async def serve_cctv():
    return FileResponse("../cctv.html")

@app.get("/{file_path:path}")
async def serve_file(file_path: str):
    full_path = os.path.join("..", file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return FileResponse(full_path)
    return {"error": "File not found"}
