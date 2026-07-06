---
title: SafeSchool AI
emoji: 🏫
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# SafeSchool AI - Hugging Face Deployment

Sistem pemantauan keamanan sekolah berbasis AI yang dideploy menggunakan Docker di Hugging Face Spaces.

## Struktur Folder yang Diharapkan
Untuk memastikan model AI dan video simulasi berjalan, pastikan struktur folder Anda sebelum di-push seperti ini:
```text
UAS/
├── backend/
│   ├── main.py
│   └── models/
│       └── model.pt      <-- Taruh model PyTorch Anda di sini
├── videos/
│   ├── cam3.mp4          <-- Video simulasi Kamera 3
│   └── cam4.mp4          <-- Video simulasi Kamera 4
├── index.html
├── join.html
├── cctv.html
├── style.css
├── app.js
└── Dockerfile
```

## Panduan Menghubungkan Perangkat Kamera Lain (Smartphone)
1. Buka halaman `/join` pada HP Anda (misal: `https://huggingface.co/spaces/username/space-name/join` atau url langsung `https://username-space-name.hf.space/join`).
2. Izinkan akses kamera pada HP Anda.
3. Masukkan nama kamera (misal: `Kamera Lapangan`) lalu ketuk **Mulai Transmisi**.
4. Buka URL utama Space Anda di Laptop/PC untuk melihat feed kamera HP masuk secara otomatis ke dalam dasbor utama SafeSchool AI.
