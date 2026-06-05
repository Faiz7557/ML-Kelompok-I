import asyncio
import json
import random
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import os
import sys

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model_loaded = False
model = None

# Attempt to load the user's best_tuned_model
try:
    import torch
    model_path = os.path.join(os.path.dirname(__file__), 'models', 'best_tuned_model')
    print(f"Mencoba memuat model PyTorch dari: {model_path}")
    
    # Normally PyTorch models require the model architecture class to be defined.
    # Since we don't have the original class, torch.load might throw an error.
    # We will try to load the weights or the whole model if it's TorchScript or self-contained.
    if os.path.exists(model_path):
        try:
            # Try TorchScript load first, often works for directories
            model = torch.jit.load(model_path)
            model_loaded = True
            print("Model PyTorch TorchScript berhasil dimuat!")
        except Exception:
            # Try legacy load
            model = torch.load(os.path.join(model_path, 'data.pkl'), map_location='cpu')
            model_loaded = True
            print("Model PyTorch Anda berhasil dimuat (Terbaca ke dalam memori)!")
    else:
        print("[WARNING] Path model tidak ditemukan, pastikan folder 'best_tuned_model' benar ada.")
except ImportError:
    print("[WARNING] PyTorch tidak terinstall. Jalankan 'pip install torch'. Menggunakan simulasi AI...")
except Exception as e:
    print(f"[WARNING] Peringatan saat memuat model: {e}")
    print("[WARNING] Karena ini prototipe dan kode arsitektur model asli tidak disertakan, proses AI akan beralih ke Mode Simulasi.")

async def process_video_stream(websocket: WebSocket, cam_id: str, cam_name: str, base_prob: float):
    while True:
        try:
            await asyncio.sleep(1.0)
            
            # --- AI INFERENCE (SIMULATION OR REAL) ---
            if model_loaded and model is not None:
                # Disini seharusnya proses OpenCV mengambil frame dan memasukkan ke `model(frame)`
                # Karena ini backend dummy tanpa kamera asli, kita tetap membuat simulasi probabilitas.
                # Namun dalam production, baris ini diganti dengan inferensi asli Anda.
                spike = random.uniform(0, 0.8) if random.random() > 0.95 else random.uniform(0, 0.3)
                prob = min(base_prob + spike, 1.0)
            else:
                # Fallback Simulation
                spike = random.uniform(0, 0.8) if random.random() > 0.95 else random.uniform(0, 0.3)
                prob = min(base_prob + spike, 1.0)
            
            w = 20 + random.uniform(0, 30)
            h = 40 + random.uniform(0, 40)
            x = 10 + random.uniform(0, 100 - w - 10)
            y = 10 + random.uniform(0, 100 - h - 10)
            
            data = {
                "cam_id": cam_id,
                "cam_name": cam_name,
                "prob": round(prob, 2),
                "box": {"x": x, "y": y, "w": w, "h": h}
            }
            
            await websocket.send_text(json.dumps(data))
            
        except WebSocketDisconnect:
            break
        except Exception as e:
            print(f"Error processing {cam_id}: {e}")
            break

@app.websocket("/ws/detect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Frontend Dashboard terhubung ke Backend AI via WebSocket!")
    
    tasks = [
        asyncio.create_task(process_video_stream(websocket, "cam-1", "Lorong Utama", 0.1)),
        asyncio.create_task(process_video_stream(websocket, "cam-2", "Kantin", 0.3)),
        asyncio.create_task(process_video_stream(websocket, "cam-3", "Belakang Sekolah", 0.2)),
        asyncio.create_task(process_video_stream(websocket, "cam-4", "Lapangan Olahraga", 0.1))
    ]
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        print("Frontend terputus.")
        for t in tasks:
            t.cancel()
