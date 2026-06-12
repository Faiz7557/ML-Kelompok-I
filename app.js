document.addEventListener('DOMContentLoaded', () => {
    // 1. Clock Update
    const clockEl = document.getElementById('clock');
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('id-ID');
    }, 1000);

    // 2. View Switching Logic
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const viewTitle = document.getElementById('view-title');

    const titles = {
        'security': 'Live Monitoring',
        'counselor': 'Daily Incident Review',
        'principal': 'Executive Analytics'
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            const targetView = item.getAttribute('data-view');
            views.forEach(view => {
                view.classList.remove('active');
                view.classList.add('hidden');
            });
            document.getElementById(`view-${targetView}`).classList.remove('hidden');
            document.getElementById(`view-${targetView}`).classList.add('active');

            viewTitle.textContent = titles[targetView];

            if(targetView === 'principal' && !window.chartInitialized) {
                initChart();
                window.chartInitialized = true;
            }
        });
    });

    // 3. Variables & Alerts System
    const alertList = document.getElementById('live-alerts');
    const alertCount = document.getElementById('alert-count');
    const emergencyPopup = document.getElementById('emergency-popup');
    const emLocation = document.getElementById('em-location');
    const btnQuickAction = document.getElementById('btn-quick-action');
    const alertSound = document.getElementById('alert-sound');

    let currentAlerts = 0;
    const T_LOW = 0.5;
    const T_HIGH = 0.8;

    function addAlert(message, type, location) {
        const emptyState = alertList.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const alertEl = document.createElement('div');
        alertEl.className = `alert-card ${type}`;
        
        const time = new Date().toLocaleTimeString('id-ID');
        
        alertEl.innerHTML = `
            <strong>${type === 'critical' ? 'CRITICAL DETECTED' : 'REVIEW NEEDED'}</strong>
            <p>${location} - ${time}</p>
            <p>${message}</p>
        `;
        
        alertList.prepend(alertEl);
        currentAlerts++;
        alertCount.textContent = currentAlerts;

        if (alertList.children.length > 10) {
            alertList.removeChild(alertList.lastChild);
        }
    }

    // 4. WEBSOCKET CONNECTION TO PYTHON BACKEND
    let ws = null;
    let isConnected = false;
    let simulationInterval = null;

    function connectWebSocket() {
        console.log("Mencoba menyambungkan ke Backend Python...");
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/detect`);

        ws.onopen = () => {
            console.log("Terhubung ke Backend AI!");
            isConnected = true;
            // Stop local simulation if running
            if(simulationInterval) {
                clearInterval(simulationInterval);
                simulationInterval = null;
            }
            
            // Force reload MJPEG stream to bypass browser cache
            const cam1Img = document.getElementById('cam1-stream');
            if (cam1Img) {
                cam1Img.src = "http://127.0.0.1:8000/video_feed/cam1?t=" + new Date().getTime();
            }
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "video_frame") {
                const streamImg = document.getElementById(data.cam_id + '-stream');
                if (streamImg) {
                    streamImg.src = data.image;
                }
            } else {
                processAIDetection(data.cam_id, data.cam_name, data.prob, data.box, data.clip);
            }
        };

        ws.onclose = () => {
            console.log("Koneksi Backend terputus. Mencoba lagi dalam 5 detik...");
            isConnected = false;
            // Start local fallback simulation if connection lost
            if(!simulationInterval) {
                simulationInterval = setInterval(simulateAILocal, 1500);
            }
            setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (err) => {
            console.error("WebSocket Error: ", err);
            ws.close();
        };
    }

    // 2. AI Detection & Overlay Logic
    function processAIDetection(cam_id, cam_name, prob, box, clipData) {
        const feedEl = document.getElementById(cam_id);
        if (!feedEl) return;
        const overlay = feedEl.querySelector('.ai-overlay');
        const scoreEl = feedEl.querySelector('.score');
        const aiProb = feedEl.querySelector('.ai-prob');
        
        scoreEl.textContent = prob.toFixed(2);
        
        if (prob >= T_HIGH) {
            // Kritis (Red)
            overlay.classList.remove('hidden');
            aiProb.style.background = 'var(--emergency-red)';
            
            if (emergencyPopup.classList.contains('hidden')) {
                emLocation.textContent = cam_name;
                emergencyPopup.classList.remove('hidden');
                addAlert(`Probabilitas tinggi (${prob.toFixed(2)}) terdeteksi!`, 'critical', cam_name);
                alertSound.play().catch(e => console.log('Autoplay blocked', e));
                if (clipData && clipData.length > 0) addToReviewQueue(cam_name, prob, clipData);
            }
        } else if (prob >= T_LOW) {
            // Review (Yellow)
            overlay.classList.remove('hidden');
            aiProb.style.background = 'var(--review-yellow)';
            
            if (clipData && clipData.length > 0) {
                addAlert(`Aktivitas mencurigakan (${prob.toFixed(2)})`, 'review', cam_name);
                addToReviewQueue(cam_name, prob, clipData);
            }
        } else {
            // Normal (Green)
            overlay.classList.remove('hidden');
            aiProb.style.background = 'var(--normal-green)';
        }
    }

    // 5. LOCAL SIMULATION FALLBACK (Runs if Python Backend is offline)
    const cams = [
        { id: 'cam-1', name: 'Lorong Utama', baseProb: 0.1 },
        { id: 'cam-2', name: 'Kantin', baseProb: 0.3 },
        { id: 'cam-3', name: 'Belakang Sekolah', baseProb: 0.2 },
        { id: 'cam-4', name: 'Lapangan Olahraga', baseProb: 0.1 }
    ];

    function simulateAILocal() {
        if(isConnected) return; // Prevent double running
        cams.forEach(cam => {
            const spike = Math.random() > 0.95 ? Math.random() * 0.8 : Math.random() * 0.3;
            let prob = cam.baseProb + spike;
            if (prob > 1) prob = 1.0;

            const w = 20 + Math.random() * 30;
            const h = 40 + Math.random() * 40;
            const x = 10 + Math.random() * (100 - w - 10);
            const y = 10 + Math.random() * (100 - h - 10);
            
            const box = { w, h, x, y };
            processAIDetection(cam.id, cam.name, prob, box);
        });
    }

    // 5.5. WebRTC WEBCAM STREAMING
    const webcamVideo = document.getElementById('webcam-video');
    const webcamCanvas = document.getElementById('webcam-canvas');
    let webcamStreamActive = false;

    if (webcamVideo && webcamCanvas) {
        navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
            .then(stream => {
                webcamVideo.srcObject = stream;
                webcamStreamActive = true;
                console.log("WebRTC Camera Activated!");
            })
            .catch(err => {
                console.error("Gagal membuka kamera laptop:", err);
            });
    }

    function sendWebcamFrame() {
        if (!isConnected || !webcamStreamActive || !ws) return;
        // Hanya kirim jika WebSocket siap (readyState === 1)
        if (ws.readyState !== 1) return;
        
        const ctx = webcamCanvas.getContext('2d');
        ctx.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);
        
        // Ekstrak sebagai Base64 JPEG dengan kualitas 70% (agar ringan di websocket)
        const dataUrl = webcamCanvas.toDataURL('image/jpeg', 0.7);
        
        ws.send(JSON.stringify({
            type: "frame",
            cam_id: "cam-1",
            image: dataUrl
        }));
    }
    
    // Kirim 15-20 frames per second ke backend
    setInterval(sendWebcamFrame, 60);

    // Start connection
    connectWebSocket();
    // Start local immediately, will be cancelled when connected
    simulationInterval = setInterval(simulateAILocal, 1500);


    // 6. Emergency Action
    btnQuickAction.addEventListener('click', () => {
        emergencyPopup.classList.add('hidden');
        alertSound.pause();
        alertSound.currentTime = 0;
        addAlert(`Satpam telah merespon lokasi.`, 'normal', 'Sistem');
    });

    const btnClosePopup = document.getElementById('btn-close-popup');
    if(btnClosePopup) {
        btnClosePopup.addEventListener('click', () => {
            emergencyPopup.classList.add('hidden');
            alertSound.pause();
            alertSound.currentTime = 0;
        });
    }

    // 7. Update Review Queue Table
    const incidentClips = {};
    let clipCounter = 0;

    function addToReviewQueue(location, prob, clipData) {
        const tbody = document.getElementById('review-queue-body');
        const tr = document.createElement('tr');
        const time = new Date().toLocaleTimeString('id-ID');
        const clipId = `clip_${clipCounter++}`;
        incidentClips[clipId] = clipData;
        
        tr.innerHTML = `
            <td>${time}</td>
            <td>${location}</td>
            <td><span class="badge yellow">${prob.toFixed(2)}</span></td>
            <td>Menunggu Review</td>
            <td><button class="btn-play" data-clip-id="${clipId}"><i class="fa-solid fa-play"></i> Putar Klip</button></td>
        `;
        tbody.prepend(tr);
    }

    // Video Playback Logic
    const reviewQueueBody = document.getElementById('review-queue-body');
    const playbackPlayer = document.querySelector('.playback-player');
    const playbackSection = document.querySelector('.playback-section');
    let playbackInterval = null;

    reviewQueueBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-play');
        if (btn) {
            const clipId = btn.getAttribute('data-clip-id');
            const clipData = incidentClips[clipId];
            
            if (clipData && clipData.length > 0) {
                playbackPlayer.innerHTML = `<img id="clip-player-img" src="${clipData[0]}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px; background: #000;">`;
                playbackSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                if (playbackInterval) clearInterval(playbackInterval);
                let frameIdx = 0;
                playbackInterval = setInterval(() => {
                    const img = document.getElementById('clip-player-img');
                    if (img) {
                        frameIdx = (frameIdx + 1) % clipData.length;
                        img.src = clipData[frameIdx];
                    } else {
                        clearInterval(playbackInterval);
                    }
                }, 60);
            }
        }
    });

    // 8. Init Chart.js for Principal
    function initChart() {
        const ctx = document.getElementById('trendChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['07:00', '09:00', '10:00 (Istirahat)', '12:00', '13:00 (Istirahat 2)', '15:00 (Pulang)'],
                datasets: [{
                    label: 'Frekuensi Insiden Terdeteksi',
                    data: [2, 1, 15, 3, 10, 8],
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#94A3B8' }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#94A3B8' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#F8FAFC' } }
                }
            }
        });
    }
});
