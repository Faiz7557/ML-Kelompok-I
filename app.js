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
        'map': 'Spatial Camera Map',
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

            if(targetView === 'principal') {
                if (!window.chartInitialized) {
                    initChart();
                    window.chartInitialized = true;
                }
                updateViolationDistributionUI();
            }
        });
    });

    // Camera Grid — Auto Layout
    const cameraGrid = document.querySelector('.video-grid');

    /**
     * Recalculate grid columns/rows based on how many
     * .video-card elements are currently in the DOM.
     * Called automatically whenever a card is added or removed.
     */
    function refreshGridLayout() {
        const cards = cameraGrid.querySelectorAll('.video-card');
        const count = cards.length;
        if (count === 0) return;

        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        cameraGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        cameraGrid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
    }

    // Initial layout based on the static cards already in the HTML
    refreshGridLayout();



    // Violation types tracking state
    const violationTypeCounts = {
        'Perkelahian': 6,
        'Perundungan': 4,
        'Penerobosan Pagar': 2,
        'Kerumunan Mencurigakan': 1
    };

    function getViolationBarColor(idx) {
        const colors = [
            'linear-gradient(90deg, #EF4444, #F97316)', // red-orange (Perkelahian)
            'linear-gradient(90deg, #8B5CF6, #EC4899)', // purple-pink (Perundungan)
            'linear-gradient(90deg, #3B82F6, #06B6D4)', // blue-cyan (Penerobosan Pagar)
            'linear-gradient(90deg, #10B981, #34D399)'  // green-mint (Kerumunan Mencurigakan)
        ];
        return colors[idx % colors.length];
    }

    let violationChart = null;
    let trendChart = null;

    function updateViolationDistributionUI() {
        const canvas = document.getElementById('violationPieChart');
        if (!canvas) return;

        const dataValues = [
            violationTypeCounts['Perkelahian'] || 0,
            violationTypeCounts['Perundungan'] || 0,
            violationTypeCounts['Penerobosan Pagar'] || 0,
            violationTypeCounts['Kerumunan Mencurigakan'] || 0
        ];

        if (violationChart) {
            // Update existing chart data and redraw
            violationChart.data.datasets[0].data = dataValues;
            violationChart.update();
            return;
        }

        const ctx = canvas.getContext('2d');
        violationChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Perkelahian', 'Perundungan', 'Penerobosan Pagar', 'Kerumunan Mencurigakan'],
                datasets: [{
                    data: dataValues,
                    backgroundColor: [
                        'rgba(239, 68, 68, 0.8)',   // Red glow
                        'rgba(139, 92, 246, 0.8)',  // Purple glow
                        'rgba(59, 130, 246, 0.8)',   // Blue glow
                        'rgba(16, 185, 129, 0.8)'   // Green glow
                    ],
                    borderColor: 'rgba(8, 10, 17, 0.6)', // Matches dark theme bg
                    borderWidth: 2,
                    borderRadius: 6,
                    spacing: 4,
                    hoverOffset: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const firstElement = elements[0];
                        const index = firstElement.index;
                        const label = violationChart.data.labels[index];
                        const value = violationChart.data.datasets[0].data[index];
                        showDrillDown('category', label, value);
                    }
                },
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#cbd5e1',
                            padding: 18,
                            font: {
                                family: "'Inter', sans-serif",
                                size: 12,
                                weight: '500'
                            },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: '#080a11',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return ` ${label}: ${value} Kasus (${percentage}%)`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'centerText',
                beforeDraw: function(chart) {
                    const width = chart.width,
                        height = chart.height,
                        ctx = chart.ctx;
                    ctx.restore();
                    
                    // Base size calculation
                    const fontSize = (height / 150).toFixed(2);
                    ctx.font = `bold ${fontSize}em 'Inter', sans-serif`;
                    ctx.textBaseline = "middle";
                    const isLight = chart.isLightMode;
                    ctx.fillStyle = isLight ? "#1e3a8a" : "#ffffff";
                    
                    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    const text = total.toString();
                    
                    // Target coordinates (middle of the doughnut)
                    const textX = Math.round((chart.chartArea.left + chart.chartArea.right) / 2);
                    const textY = Math.round((chart.chartArea.top + chart.chartArea.bottom) / 2);
                    
                    // Draw total count
                    ctx.textAlign = "center";
                    ctx.fillText(text, textX, textY - 8);
                    
                    // Draw "KASUS" subtitle
                    ctx.font = `500 ${fontSize * 0.42}em 'Inter', sans-serif`;
                    ctx.fillStyle = isLight ? "#475569" : "#64748b";
                    ctx.fillText("KASUS TOTAL", textX, textY + 14);
                    ctx.save();
                }
            }]
        });
    }

    // Initialize with 4 cameras after variables are loaded
    setCameraCount(4);

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

        // Increment dynamic violation type counts
        if (type === 'critical') {
            const category = Math.random() > 0.5 ? 'Perkelahian' : 'Perundungan';
            violationTypeCounts[category] = (violationTypeCounts[category] || 0) + 1;
        } else {
            const category = Math.random() > 0.5 ? 'Kerumunan Mencurigakan' : 'Penerobosan Pagar';
            violationTypeCounts[category] = (violationTypeCounts[category] || 0) + 1;
        }
        updateViolationDistributionUI();
    }

    // 4. WEBSOCKET CONNECTION TO PYTHON BACKEND
    let ws = null;
    let isConnected = false;
    let simulationInterval = null;

    // Track dynamically-created node camera cards { cam_id → card element }
    const dynamicNodes = {};

    /** Create a new camera card for a dynamic node and insert into the grid */
    function createNodeCameraCard(camId, camName) {
        if (document.getElementById(camId)) {
            // Card already exists — just update its name label
            const nameEl = document.querySelector(`#${camId} .cam-name`);
            if (nameEl) nameEl.textContent = camName;
            return;
        }

        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.nodeId = camId;

        card.innerHTML = `
            <div class="cam-feed" id="${camId}">
                <div class="cam-header-tag">
                    <i class="fa-solid fa-circle-nodes" style="color:#a78bfa;font-size:0.72rem;"></i>
                    <span class="cam-name">${camName}</span>
                    <span class="tag-divider">|</span>
                    <span class="live-status-pill">
                        <span class="live-dot dot-alert-green"></span>
                        <span class="cam-meta">NODE</span>
                    </span>
                    <button class="btn-rename-cam" data-cam-id="${camId}" title="Ganti nama kamera"><i class="fa-solid fa-pen"></i></button>
                </div>
                <div class="ai-overlay hidden">
                    <div class="bounding-box"></div>
                    <div class="ai-prob">Prob: <span class="score">0.0</span></div>
                </div>
                <div class="feed-connection-state" id="${camId}-waiting">
                    <div class="spinner-ring"></div>
                    <i class="fa-solid fa-wifi" style="font-size:1.4rem;color:#a78bfa;"></i>
                    <span>Node terhubung. Menunggu video...</span>
                </div>
                <img id="${camId}-stream" src="" style="width:100%;height:100%;object-fit:cover;background:#0c0f16;display:none;"/>
            </div>
        `;

        cameraGrid.appendChild(card);
        dynamicNodes[camId] = card;

        // Auto-reflow the grid to accommodate the new card
        refreshGridLayout();
    }

    /** Fade out and remove a dynamic node camera card, then reflow the grid */
    function removeNodeCameraCard(camId) {
        const card = dynamicNodes[camId];
        if (!card) return;
        card.style.transition = 'opacity 0.5s, transform 0.5s';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.93)';
        setTimeout(() => {
            card.remove();
            delete dynamicNodes[camId];
            // Reflow the grid after removal
            refreshGridLayout();
        }, 500);
    }

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

            // --- Dynamic node events ---
            if (data.type === "node_join") {
                createNodeCameraCard(data.cam_id, data.cam_name);
                return;
            }
            if (data.type === "node_leave") {
                removeNodeCameraCard(data.cam_id);
                return;
            }
            if (data.type === "node_rename") {
                const nameEl = document.querySelector(`#${data.cam_id} .cam-name`);
                if (nameEl) nameEl.textContent = data.cam_name;
                return;
            }

            // --- Video frame from CCTV / node ---
            if (data.type === "video_frame") {
                const streamImg = document.getElementById(data.cam_id + '-stream');
                if (streamImg) {
                    streamImg.src = data.image;
                    if (streamImg.style.display === 'none') {
                        streamImg.style.display = 'block';
                        const waitingEl = document.getElementById(data.cam_id + '-waiting');
                        if (waitingEl) waitingEl.style.display = 'none';
                    }
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

        // Skip processing if this camera is currently hidden/inactive
        const cardEl = feedEl.closest('.video-card');
        if (cardEl && cardEl.classList.contains('hidden-feed')) {
            return;
        }

        const overlay = feedEl.querySelector('.ai-overlay');
        const scoreEl = feedEl.querySelector('.score');
        const aiProb = feedEl.querySelector('.ai-prob');
        const boxEl = feedEl.querySelector('.bounding-box');
        
        scoreEl.textContent = prob.toFixed(2);
        
        // Map camera id to clean simple name
        const camNumberMap = {
            'cam-1': 'Kamera 1',
            'cam-2': 'Kamera 2',
            'cam-3': 'Kamera 3',
            'cam-4': 'Kamera 4'
        };
        const simplifiedName = camNumberMap[cam_id] || cam_name;
        
        // Update bounding box if data is present and prob is significant
        if (boxEl && box && prob >= 0.2) {
            boxEl.style.width = `${box.w}%`;
            boxEl.style.height = `${box.h}%`;
            boxEl.style.left = `${box.x}%`;
            boxEl.style.top = `${box.y}%`;
            boxEl.style.display = 'block';
        } else if (boxEl) {
            boxEl.style.display = 'none';
        }
        
        const liveDot = cardEl ? cardEl.querySelector('.live-dot') : null;

        if (prob >= T_HIGH) {
            // Kritis (Red)
            overlay.classList.remove('hidden');
            aiProb.style.background = 'rgba(239, 68, 68, 0.8)';
            aiProb.style.borderColor = 'var(--color-red)';
            if (boxEl) {
                boxEl.style.borderColor = 'var(--color-red)';
                boxEl.style.boxShadow = 'var(--glow-red)';
            }
            if (cardEl) {
                cardEl.classList.add('card-alert-red');
                cardEl.classList.remove('card-alert-orange');
            }
            if (liveDot) {
                liveDot.className = 'live-dot dot-alert-red';
            }
            
            if (emergencyPopup.classList.contains('hidden')) {
                emLocation.textContent = simplifiedName;
                emergencyPopup.classList.remove('hidden');
                addAlert(`Probabilitas tinggi (${prob.toFixed(2)}) terdeteksi!`, 'critical', simplifiedName);
                alertSound.play().catch(e => console.log('Autoplay blocked', e));
                if (clipData && clipData.length > 0) addToReviewQueue(simplifiedName, prob, clipData);
            }
        } else if (prob >= T_LOW) {
            // Review (Yellow)
            overlay.classList.remove('hidden');
            aiProb.style.background = 'rgba(249, 115, 22, 0.8)';
            aiProb.style.borderColor = 'var(--color-orange)';
            if (boxEl) {
                boxEl.style.borderColor = 'var(--color-orange)';
                boxEl.style.boxShadow = 'var(--glow-orange)';
            }
            if (cardEl) {
                cardEl.classList.add('card-alert-orange');
                cardEl.classList.remove('card-alert-red');
            }
            if (liveDot) {
                liveDot.className = 'live-dot dot-alert-orange';
            }
            
            if (clipData && clipData.length > 0) {
                addAlert(`Aktivitas mencurigakan (${prob.toFixed(2)})`, 'review', simplifiedName);
                addToReviewQueue(simplifiedName, prob, clipData);
            }
        } else {
            // Normal (Green)
            overlay.classList.remove('hidden');
            aiProb.style.background = 'rgba(16, 185, 129, 0.8)';
            aiProb.style.borderColor = 'var(--color-green)';
            if (boxEl) {
                boxEl.style.borderColor = 'var(--color-green)';
                boxEl.style.boxShadow = 'var(--glow-green)';
            }
            if (cardEl) {
                cardEl.classList.remove('card-alert-red', 'card-alert-orange');
            }
            if (liveDot) {
                liveDot.className = 'live-dot';
            }
        }
    }

    // 5. LOCAL SIMULATION FALLBACK (Runs if Python Backend is offline)
    function simulateAILocal() {
        if(isConnected) return; // Prevent double running

        // Iterate over every visible camera card currently in the DOM
        const cards = cameraGrid.querySelectorAll('.video-card');
        cards.forEach((card, idx) => {
            const feedEl = card.querySelector('.cam-feed');
            if (!feedEl) return;
            const camId   = feedEl.id;
            const nameEl  = feedEl.querySelector('.cam-name');
            const camName = nameEl ? nameEl.textContent : `Kamera ${idx + 1}`;

            const baseProb = 0.1 + (idx % 3) * 0.1;
            const spike = Math.random() > 0.95 ? Math.random() * 0.8 : Math.random() * 0.3;
            let prob = baseProb + spike;
            if (prob > 1) prob = 1.0;

            const w = 20 + Math.random() * 30;
            const h = 40 + Math.random() * 40;
            const x = 10 + Math.random() * (100 - w - 10);
            const y = 10 + Math.random() * (100 - h - 10);

            processAIDetection(camId, camName, prob, { w, h, x, y });
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
        if (ws.readyState !== WebSocket.OPEN) return;

        // Adaptive backpressure: skip frame if send queue is congested
        if (ws.bufferedAmount > 65536) return;

        const ctx = webcamCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);

        // JPEG quality 0.60 — lighter payload, server resizes to 224x224 anyway
        const dataUrl = webcamCanvas.toDataURL('image/jpeg', 0.60);

        ws.send(JSON.stringify({
            type: "frame",
            cam_id: "cam-1",
            image: dataUrl
        }));
    }

    // 5 fps — matches server's INFERENCE_EVERY_N=2 pipeline (effective 2.5 inferences/sec)
    setInterval(sendWebcamFrame, 200);

    // Start connection
    connectWebSocket();
    // Start local immediately, will be cancelled when connected
    simulationInterval = setInterval(simulateAILocal, 1500);


    // -----------------------------------------------------------------------
    // 5.6 RENAME CAMERA MODAL
    // -----------------------------------------------------------------------
    const renameModal   = document.getElementById('rename-modal');
    const renameInput   = document.getElementById('rename-input');
    const btnCloseRename   = document.getElementById('btn-close-rename');
    const btnRenameConfirm = document.getElementById('btn-rename-confirm');
    const btnRenameCancel  = document.getElementById('btn-rename-cancel');
    let renamingCamId = null;

    /** Open rename modal for a given cam_id */
    function openRenameModal(camId) {
        renamingCamId = camId;
        const currentName = document.querySelector(`#${camId} .cam-name`)?.textContent || '';
        renameInput.value = currentName;
        renameModal.classList.remove('hidden');
        setTimeout(() => renameInput.focus(), 50);
    }

    function closeRenameModal() {
        renameModal.classList.add('hidden');
        renamingCamId = null;
    }

    async function confirmRename() {
        if (!renamingCamId) return;
        const newName = renameInput.value.trim();
        if (!newName) return;

        // Optimistic UI update
        const nameEl = document.querySelector(`#${renamingCamId} .cam-name`);
        if (nameEl) nameEl.textContent = newName;
        closeRenameModal();

        // Persist rename via REST API (server will also broadcast to other dashboards)
        try {
            await fetch(`/api/nodes/${renamingCamId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cam_name: newName }),
            });
        } catch (e) {
            console.warn('Rename API call failed (offline mode?):', e);
        }
    }

    // Delegate click events on all .btn-rename-cam buttons (static + dynamic)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-rename-cam');
        if (btn) {
            e.stopPropagation();
            openRenameModal(btn.dataset.camId);
        }
    });

    if (btnCloseRename)  btnCloseRename.addEventListener('click',  closeRenameModal);
    if (btnRenameCancel) btnRenameCancel.addEventListener('click',  closeRenameModal);
    if (btnRenameConfirm) btnRenameConfirm.addEventListener('click', confirmRename);

    // Close rename modal on clicking backdrop
    if (renameModal) {
        renameModal.addEventListener('click', (e) => {
            if (e.target === renameModal) closeRenameModal();
        });
    }

    // Confirm rename with Enter key
    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmRename();
            if (e.key === 'Escape') closeRenameModal();
        });
    }


    // 6. Emergency Action
    btnQuickAction.addEventListener('click', () => {
        emergencyPopup.classList.add('hidden');
        alertSound.pause();
        alertSound.currentTime = 0;
        addAlert(`Satpam telah merespon lokasi.`, 'normal', emLocation.textContent);
        
        // Log to principal table
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID');
        const location = emLocation.textContent;
        logAction(timeStr, location, 'Kritis', 'Respon Cepat Satpam', 'Selesai');
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
    let activeClipLocation = null;

    function updatePendingReviewsCount() {
        const tbody = document.getElementById('review-queue-body');
        const pendingVal = document.getElementById('c-pending-count');
        if (tbody && pendingVal) {
            const count = tbody.querySelectorAll('tr').length;
            pendingVal.textContent = `${count} Kasus`;
        }
    }

    function logAction(time, location, level, satpamAction, bkStatus, notes = '') {
        const tbody = document.getElementById('principal-action-logs');
        if (!tbody) return;
        
        const tr = document.createElement('tr');
        
        let badgeClass = 'yellow';
        let badgeText = 'Tinjauan';
        if (level === 'Kritis') {
            badgeClass = 'red';
            badgeText = 'Kritis (0.85)';
        } else {
            badgeClass = 'yellow';
            badgeText = 'Mencurigakan (0.42)';
        }
        
        let statusClass = 'yellow';
        let statusText = 'Menunggu Review';
        if (bkStatus === 'Selesai') {
            statusClass = 'green';
            statusText = 'Selesai (Aman)';
        } else if (bkStatus === 'Eskalasi') {
            statusClass = 'red';
            statusText = 'Eskalasi Kasus';
        }

        let actionDisplay = satpamAction;
        if (notes) {
            actionDisplay += ` <br><small style="color: #94a3b8; font-style: italic;">Catatan BK: "${notes}"</small>`;
        }
        
        tr.innerHTML = `
            <td>${time}</td>
            <td>${location}</td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            <td>${actionDisplay}</td>
            <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        `;
        tbody.prepend(tr);
        
        if (tbody.children.length > 8) {
            tbody.removeChild(tbody.lastChild);
        }
    }

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
        updatePendingReviewsCount();
    }

    // Video Playback Logic
    const reviewQueueBody = document.getElementById('review-queue-body');
    const playbackPlayer = document.querySelector('.playback-player');
    const playbackSection = document.querySelector('.playback-section');
    let playbackInterval = null;

    reviewQueueBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-play');
        if (btn) {
            const tr = btn.closest('tr');
            if (tr) {
                activeClipLocation = tr.children[1].textContent;
            }
            
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

    // Counselor Action Buttons
    const btnFalseAlarm = playbackSection.querySelector('.btn-outline');
    const btnEscalate = playbackSection.querySelector('.btn-danger');

    function removeActiveClipFromQueue() {
        if (!activeClipLocation) return;
        const rows = reviewQueueBody.querySelectorAll('tr');
        for (let row of rows) {
            if (row.children[1].textContent === activeClipLocation) {
                row.remove();
                break;
            }
        }
        
        playbackPlayer.innerHTML = `
            <div class="placeholder-player">
                <i class="fa-solid fa-film"></i>
                <p>Pilih klip dari antrean untuk memutar</p>
            </div>
        `;
        activeClipLocation = null;
        updatePendingReviewsCount();
    }

    if (btnFalseAlarm) {
        btnFalseAlarm.addEventListener('click', () => {
            if (!activeClipLocation) return;
            const timeStr = new Date().toLocaleTimeString('id-ID');
            const notesEl = document.getElementById('counselor-review-notes');
            const notes = notesEl ? notesEl.value.trim() : '';
            logAction(timeStr, activeClipLocation, 'Tinjauan', 'Patroli Selesai', 'Selesai', notes);
            if (notesEl) notesEl.value = '';
            removeActiveClipFromQueue();
        });
    }

    if (btnEscalate) {
        btnEscalate.addEventListener('click', () => {
            if (!activeClipLocation) return;
            const timeStr = new Date().toLocaleTimeString('id-ID');
            const notesEl = document.getElementById('counselor-review-notes');
            const notes = notesEl ? notesEl.value.trim() : '';
            logAction(timeStr, activeClipLocation, 'Kritis', 'Respon Cepat', 'Eskalasi', notes);
            if (notesEl) notesEl.value = '';
            removeActiveClipFromQueue();
        });
    }

    // Initialize counts
    updatePendingReviewsCount();

    // Fluctuate AI diagnostics stats
    const latencyEl = document.getElementById('diag-latency');
    const cpuEl = document.getElementById('diag-cpu');
    if (latencyEl && cpuEl) {
        setInterval(() => {
            const latency = Math.floor(Math.random() * 8) + 38;
            latencyEl.textContent = `${latency} ms`;
            
            const cpu = Math.floor(Math.random() * 8) + 21;
            cpuEl.textContent = `${cpu}%`;
        }, 2000);
    }

    // 8. Init Chart.js for Principal
    function initChart() {
        const ctx = document.getElementById('trendChart').getContext('2d');
        
        // Create gradients
        const gradientStroke = ctx.createLinearGradient(0, 0, 400, 0);
        gradientStroke.addColorStop(0, '#3B82F6');
        gradientStroke.addColorStop(0.5, '#8B5CF6');
        gradientStroke.addColorStop(1, '#06B6D4');
        
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 300);
        gradientFill.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
        gradientFill.addColorStop(1, 'rgba(139, 92, 246, 0.00)');
        
        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [
                    '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', 
                    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', 
                    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', 
                    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
                ],
                datasets: [{
                    label: 'Frekuensi Insiden Terdeteksi',
                    data: [0, 0, 0, 1, 0, 0, 1, 2, 4, 3, 15, 12, 4, 10, 8, 6, 4, 2, 2, 1, 1, 0, 0, 0],
                    borderColor: gradientStroke,
                    backgroundColor: gradientFill,
                    borderWidth: 3,
                    pointBackgroundColor: '#3B82F6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
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
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.04)',
                            drawBorder: false
                        },
                        ticks: { 
                            color: '#94a3b8',
                            font: {
                                family: "'Inter', sans-serif",
                                size: 12,
                                weight: '500'
                            }
                        }
                    },
                    x: {
                        grid: { 
                            display: false,
                            drawBorder: false
                        },
                        ticks: { 
                            color: '#94a3b8',
                            autoSkip: true,
                            maxTicksLimit: 8,
                            font: {
                                family: "'Inter', sans-serif",
                                size: 11,
                                weight: '500'
                            }
                        }
                    }
                },
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const firstElement = elements[0];
                        const index = firstElement.index;
                        const label = chart.data.labels[index];
                        const value = chart.data.datasets[0].data[index];
                        showDrillDown('temporal', label, value);
                    }
                },
                plugins: {
                    legend: { 
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#080a11',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false
                    }
                }
            }
        });
    }

    // 9. Interactive Drill Down Logic
    function showDrillDown(type, label, value) {
        const modal = document.getElementById('drill-down-modal');
        const titleEl = document.getElementById('drill-modal-title');
        const totalValEl = document.getElementById('drill-total-val');
        const dangerBadge = document.getElementById('drill-danger-badge');
        const locationValEl = document.getElementById('drill-location-val');
        const container = document.getElementById('drill-items-container');
        const iconEl = document.getElementById('drill-header-icon');

        if (!modal || !container) return;

        // Clear previous rows
        container.innerHTML = '';
        totalValEl.textContent = value;

        let dangerText = 'Rendah';
        let dangerClass = 'green';
        let primaryLocation = 'Kantin Sekolah';
        let records = [];

        if (type === 'temporal') {
            titleEl.textContent = `Detail Analisis - Pukul ${label}`;
            iconEl.className = 'fa-solid fa-clock';
            iconEl.style.color = '#3b82f6';

            if (value >= 12) {
                dangerText = 'Tinggi';
                dangerClass = 'red';
                primaryLocation = 'Lapangan Olahraga';
            } else if (value >= 5) {
                dangerText = 'Sedang';
                dangerClass = 'yellow';
                primaryLocation = 'Kantin Sekolah';
            } else {
                dangerText = 'Rendah';
                dangerClass = 'green';
                primaryLocation = 'Koridor Kelas B';
            }

            // Generate hourly mock items
            const incidentTypes = ['Perkelahian', 'Perundungan', 'Penerobosan Pagar', 'Kerumunan Mencurigakan'];
            const locations = ['Lapangan Olahraga', 'Kantin Sekolah', 'Koridor Kelas B', 'Pintu Gerbang Utama'];
            
            for (let i = 0; i < value; i++) {
                const incType = incidentTypes[i % incidentTypes.length];
                const loc = locations[(i + 2) % locations.length];
                const minStr = String(Math.floor(Math.random() * 59)).padStart(2, '0');
                const timeStr = `${label.split(':')[0]}:${minStr}`;
                
                records.push({
                    time: timeStr,
                    type: incType,
                    location: loc,
                    action: incType === 'Perkelahian' ? 'Eskalasi Respon Sirine' : 'Penjadwalan Review BK',
                    status: i % 2 === 0 ? 'Selesai' : 'Eskalasi'
                });
            }
        } else {
            // Category drill down
            titleEl.textContent = `Detail Laporan - Kasus ${label}`;
            iconEl.className = 'fa-solid fa-circle-exclamation';
            iconEl.style.color = '#a855f7';

            if (label === 'Perkelahian') {
                dangerText = 'Tinggi';
                dangerClass = 'red';
                primaryLocation = 'Lapangan Olahraga';
            } else if (label === 'Perundungan') {
                dangerText = 'Tinggi';
                dangerClass = 'red';
                primaryLocation = 'Koridor Kelas B';
            } else if (label === 'Penerobosan Pagar') {
                dangerText = 'Sedang';
                dangerClass = 'yellow';
                primaryLocation = 'Pagar Belakang';
            } else {
                dangerText = 'Rendah';
                dangerClass = 'green';
                primaryLocation = 'Kantin Sekolah';
            }

            const hours = ['08:24', '10:15', '10:42', '13:05', '13:12', '14:50', '15:10'];
            const locations = [primaryLocation, 'Kantin Belakang', 'Gerbang Utama'];
            
            for (let i = 0; i < value; i++) {
                const timeStr = hours[i % hours.length];
                const loc = locations[i % locations.length];
                
                records.push({
                    time: timeStr,
                    type: label,
                    location: loc,
                    action: label === 'Perkelahian' ? 'Alarm Sirine + Bantuan Satpam' : 'Daily Review Konseling BK',
                    status: i % 2 === 0 ? 'Selesai' : 'Eskalasi'
                });
            }
        }

        // Set dynamic danger badge
        dangerBadge.textContent = dangerText;
        dangerBadge.className = `drill-item-badge badge ${dangerClass}`;
        locationValEl.textContent = primaryLocation;

        // Apply interactive border glow class on the modal card
        const cardEl = modal.querySelector('.drill-down-card');
        if (cardEl) {
            cardEl.className = 'drill-down-card';
            cardEl.classList.add(`drill-glow-${dangerClass}`);
        }

        if (records.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary); padding: 30px 0; font-size: 0.85rem;">
                    Tidak ada riwayat insiden terperinci untuk filter ini.
                </div>
            `;
        } else {
            const typeIcons = {
                'Perkelahian': 'fa-solid fa-hand-fist',
                'Perundungan': 'fa-solid fa-user-slash',
                'Penerobosan Pagar': 'fa-solid fa-user-secret',
                'Kerumunan Mencurigakan': 'fa-solid fa-users'
            };
            const typeColors = {
                'Perkelahian': 'var(--color-red)',
                'Perundungan': 'var(--color-purple)',
                'Penerobosan Pagar': 'var(--color-blue)',
                'Kerumunan Mencurigakan': 'var(--color-green)'
            };

            records.forEach(rec => {
                const row = document.createElement('div');
                row.className = 'drill-item-row';
                
                let badgeClass = 'yellow';
                if (rec.status === 'Selesai') badgeClass = 'green';
                if (rec.status === 'Eskalasi') badgeClass = 'red';

                const iconClass = typeIcons[rec.type] || 'fa-solid fa-circle-exclamation';
                const iconColor = typeColors[rec.type] || 'var(--text-secondary)';

                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="${iconClass}" style="color: ${iconColor}; font-size: 1rem; text-shadow: 0 0 8px ${iconColor}40;"></i>
                        </div>
                        <div class="drill-item-meta">
                            <span class="drill-item-title">${rec.type}</span>
                            <span class="drill-item-desc"><i class="fa-regular fa-clock"></i> ${rec.time} | <i class="fa-solid fa-location-dot"></i> ${rec.location}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <span style="font-size: 0.72rem; color: var(--text-secondary); max-width: 165px; text-align: right; font-weight: 500;">${rec.action}</span>
                        <span class="status-pill ${badgeClass}">${rec.status}</span>
                    </div>
                `;
                container.appendChild(row);
            });
        }

        // Dynamic Video Player Preview mapping
        const videoPreview = document.getElementById('drill-video-preview');
        const videoPlayer = document.getElementById('drill-player');
        const videoCamName = document.getElementById('drill-video-cam-name');
        
        if (videoPreview && videoPlayer) {
            // Determine camera source based on values
            let videoSource = '';
            let camLabel = 'Kamera 3';

            if (type === 'temporal') {
                // If it is high-risk hours, play cam4 (playground fight), otherwise play cam3 (hallway crowd/walkway)
                if (value >= 8) {
                    videoSource = 'videos/cam4.mp4';
                    camLabel = 'Kamera 4 (Lapangan Olahraga)';
                } else {
                    videoSource = 'videos/cam3.mp4';
                    camLabel = 'Kamera 3 (Kantin Belakang)';
                }
            } else {
                // Category drill down mapping
                if (label === 'Perkelahian' || label === 'Perundungan') {
                    videoSource = 'videos/cam4.mp4';
                    camLabel = 'Kamera 4 (Lapangan Olahraga)';
                } else {
                    videoSource = 'videos/cam3.mp4';
                    camLabel = 'Kamera 3 (Kantin Belakang)';
                }
            }

            if (value > 0 && videoSource) {
                videoCamName.textContent = camLabel;
                videoPlayer.src = videoSource;
                videoPlayer.load();
                videoPlayer.play().catch(() => {});
                videoPreview.style.display = 'flex';
            } else {
                videoPreview.style.display = 'none';
                videoPlayer.src = '';
            }
        }

        modal.classList.remove('hidden');
    }

    // Bind drill down close event triggers
    const btnCloseDrill = document.getElementById('btn-close-drill');
    const drillDownModal = document.getElementById('drill-down-modal');
    if (btnCloseDrill && drillDownModal) {
        const videoPlayer = document.getElementById('drill-player');
        const stopVideo = () => {
            drillDownModal.classList.add('hidden');
            if (videoPlayer) {
                videoPlayer.pause();
                videoPlayer.src = '';
            }
        };
        btnCloseDrill.addEventListener('click', stopVideo);
        drillDownModal.addEventListener('click', (e) => {
            if (e.target === drillDownModal) {
                stopVideo();
            }
        });
    }

    // Expose showDrillDown globally for cross-calls if needed
    window.showDrillDown = showDrillDown;

    // Helper to dynamically toggle Chart.js text/grid colors based on theme
    function updateChartsTheme(isLight) {
        const tickColor = isLight ? '#475569' : '#94a3b8';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';
        
        if (trendChart) {
            trendChart.options.scales.x.ticks.color = tickColor;
            trendChart.options.scales.y.ticks.color = tickColor;
            trendChart.options.scales.y.grid.color = gridColor;
            trendChart.update();
        }
        
        if (violationChart) {
            violationChart.options.plugins.legend.labels.color = tickColor;
            violationChart.isLightMode = isLight;
            violationChart.update();
        }
    }

    // 10. Theme Toggler Action
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-mode');
            const icon = themeToggleBtn.querySelector('i');
            if (icon) {
                if (isLight) {
                    icon.className = 'fa-regular fa-moon';
                } else {
                    icon.className = 'fa-regular fa-sun';
                }
            }
            updateChartsTheme(isLight);
        });
    }

    // 11. PDF Report Export Action
    const btnExport = document.querySelector('.btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            window.print();
        });
    }
});
