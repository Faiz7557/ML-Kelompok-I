================================================================================
                SAFESCHOOL AI - SISTEM MONITORING KEAMANAN SEKOLAH
                         BERBASIS KECERDASAN BUATAN (AI)
================================================================================

SafeSchool AI adalah sistem pemantauan keamanan sekolah real-time berbasis AI yang 
dirancang untuk mendukung kepatuhan terhadap SDG 4 (Pendidikan Berkualitas, 
khususnya dalam menciptakan lingkungan belajar yang aman, inklusif, dan bebas 
dari segala bentuk kekerasan).

Sistem ini memantau feed video kamera di lingkungan sekolah dan secara otomatis 
mendeteksi anomali atau pelanggaran keamanan seperti:
1. Perkelahian (Fighting)
2. Perundungan (Bullying)
3. Penerobosan Pagar (Fence Intrusion)
4. Kerumunan Mencurigakan (Suspicious Crowds)

Dokumen ini berisi penjelasan detail mengenai arsitektur sistem, struktur file, 
integrasi kamera multi-node, panduan instalasi, konfigurasi parameter, dan 
penanganan masalah (troubleshooting).

--------------------------------------------------------------------------------
DAFTAR ISI
--------------------------------------------------------------------------------
1. Arsitektur & Teknologi Sistem
2. Struktur Direktori Proyek
3. Panduan Instalasi & Setup Lingkungan
4. Konfigurasi Sistem (Threshold & AI Parameters)
5. Integrasi Kamera Multi-Node (Webcam, CCTV, File Video, & Smartphone)
6. Panduan Fitur Berdasarkan Peran Pengguna (Views)
7. Catatan Keamanan SSL / HTTPS & Izin Kamera (Sangat Penting)
8. Panduan Troubleshooting & Masalah Umum

================================================================================
1. ARSITEKTUR & TEKNOLOGI SISTEM
================================================================================

Sistem SafeSchool AI dibangun menggunakan arsitektur hybrid modern dengan pembagian 
tanggung jawab berikut:

A. BACKEND (FASTAPI & PYTORCH)
   - FastAPI: Digunakan sebagai server web asinkron berkinerja tinggi untuk melayani 
     REST API dan koneksi WebSocket (WS/WSS) secara real-time.
   - PyTorch: Framework deep learning untuk memuat dan mengeksekusi model ML.
   - Model ML (MobileNetV2 + LSTM):
     * MobileNetV2 digunakan sebagai backbone spasial (CNN) untuk mengekstraksi 
       fitur visual tingkat tinggi dari setiap frame gambar (224x224 piksel).
     * LSTM (Long Short-Term Memory) digunakan sebagai pemroses temporal untuk 
       menganalisis sekuensial (urutan) frame dalam jendela waktu tertentu guna 
       mendeteksi aksi dinamis (misalnya aksi perkelahian yang tidak bisa dideteksi 
       hanya dari satu gambar statis).
   - Pengoptimalan Beban Kerja Backend:
     * ThreadPoolExecutor: Proses decoding JPEG base64, prapemrosesan gambar, 
       ekstraksi fitur CNN, dan klasifikasi LSTM dialihkan ke thread pool terpisah 
       (max 4 workers) menggunakan 'asyncio.run_in_executor' agar tidak memblokir 
       event loop utama FastAPI yang menangani koneksi client.
     * Inference Throttle: Inferensi model AI dioptimalkan dengan hanya memproses 
       satu dari setiap N frame (default N=2). Ini mengurangi konsumsi CPU hingga 
       50% dengan penurunan akurasi yang minimal.
     * Sliding Window: Pemrosesan temporal menggunakan sliding window berukuran 
       16 frame dengan langkah geser (step) sebanyak 4 frame untuk respons yang 
       cepat dan latensi yang minimal.
     * Fallback Simulasi: Jika server tidak mendeteksi file model latih PyTorch 
       (model.pt), sistem akan otomatis masuk ke mode simulasi data anomali agar 
       dasbor tetap berfungsi secara interaktif untuk kebutuhan demo.

B. FRONTEND (HTML5, VANILLA CSS3, & JAVASCRIPT)
   - Tampilan UI Premium: Menggunakan desain dark theme dengan efek glassmorphism 
     berbasis CSS variables yang sangat responsif di berbagai perangkat.
   - Chart.js: Digunakan untuk memvisualisasikan data analitik interaktif bagi Kepala 
     Sekolah (doughnut chart, line chart, radar chart, dan grafik hotspots).
   - Multi-View Switcher: Mengatur navigasi tampilan berdasarkan peran pengguna 
     tanpa memerlukan reload halaman (Single Page Application feel).
   - Fallback Simulasi Lokal: Jika backend Python terputus atau tidak berjalan, 
     JavaScript di frontend akan mendeteksi offline state dan secara otomatis 
     mengaktifkan simulator internal sehingga visual dasbor tetap berjalan dinamis.

C. TRANSMISI DATA
   - Real-time Frame Broadcast: Pengiriman data frame video dari client kamera 
     (CCTV/HP/Webcam) ke server menggunakan koneksi WebSocket dalam format pesan 
     JSON yang melampirkan frame gambar terkompresi berformat JPEG base64.

================================================================================
2. STRUKTUR DIREKTORI PROYEK
================================================================================

Berikut adalah struktur file dan folder utama dalam workspace ini beserta fungsinya:

UAS/
│
├── README.txt                <-- Dokumen panduan teknis lengkap ini
├── index.html                <-- Dasbor utama pemantauan (Security, BK, & Kepsek)
├── cctv.html                 <-- Transmitter CCTV Legacy (Kamera 2)
├── join.html                 <-- Registrasi & Transmitter Kamera HP/Dynamic Node
├── app.js                    <-- Script logika frontend dasbor & komunikasi WS
├── style.css                 <-- File stylesheet dasbor utama dengan tema gelap
├── requirements.txt          <-- Dependensi pustaka Python yang dibutuhkan backend
├── cert.pem                  <-- Sertifikat SSL root (untuk HTTPS/WSS)
├── key.pem                   <-- Kunci privat sertifikat SSL root
│
├── backend/
│   ├── main.py               <-- Server FastAPI utama, websocket, & pipeline AI
│   ├── generate_cert.py      <-- Script pembuat sertifikat SSL self-signed
│   ├── cert.pem              <-- Duplikat sertifikat SSL untuk backend
│   ├── key.pem               <-- Duplikat kunci privat SSL untuk backend
│   └── models/               <-- [BUAT FOLDER INI] Folder penyimpanan model ML
│       └── model.pt          <-- File model latih PyTorch (MobileNetV2-LSTM)
│
├── videos/                   <-- [BUAT FOLDER INI] Folder video simulasi kamera
│   ├── cam3.mp4              <-- Video simulasi Kamera 3 (Area Belakang Sekolah)
│   └── cam4.mp4              <-- Video simulasi Kamera 4 (Area Lapangan Olahraga)
│
└── venv/                     <-- Lingkungan virtual Python (virtual environment)

================================================================================
3. PANDUAN INSTALASI & SETUP LINGKUNGAN
================================================================================

Ikuti langkah-langkah di bawah ini untuk memasang dan menjalankan sistem di 
komputer Anda:

LANGKAH 1: Persiapan Lingkungan Python
1. Buka PowerShell atau CMD, lalu arahkan ke direktori proyek ini.
2. Buat virtual environment baru untuk mengisolasi dependensi:
   python -m venv venv
3. Aktifkan virtual environment tersebut:
   - Windows PowerShell:  .\venv\Scripts\Activate.ps1
   - Windows CMD:         .\venv\Scripts\activate.bat
   - Linux/MacOS Terminal: source venv/bin/activate

LANGKAH 2: Instalasi Dependensi Pustaka
Instal seluruh dependensi Python yang tercantum di requirements.txt dengan perintah:
   pip install -r requirements.txt

LANGKAH 3: Pembuatan Sertifikat SSL Self-Signed (Wajib untuk HTTPS)
Untuk mengakses kamera di perangkat HP/smartphone melalui jaringan Wi-Fi lokal, 
koneksi server Anda harus menggunakan HTTPS. Buat sertifikat SSL dengan langkah:
1. Masuk ke folder backend:
   cd backend
2. Jalankan script pembuat sertifikat:
   python generate_cert.py
3. Script ini akan mendeteksi IP lokal komputer Anda secara otomatis dan membuat 
   file 'cert.pem' serta 'key.pem'. Kembali ke direktori root setelah selesai:
   cd ..

LANGKAH 4: Penyiapan File Model & Video Simulasi
- Masuk ke folder 'backend', lalu buat folder baru bernama 'models'.
- Pindahkan file model latih PyTorch Anda (dengan ekstensi .pt atau .pth) ke dalam 
  folder tersebut dan ubah namanya menjadi 'model.pt' (sehingga jalurnya adalah 
  backend/models/model.pt).
- Di folder root proyek, buat folder baru bernama 'videos'.
- Letakkan file video simulasi Anda di dalam folder tersebut dan ubah namanya menjadi 
  'cam3.mp4' dan 'cam4.mp4' (sehingga jalurnya adalah videos/cam3.mp4 dan videos/cam4.mp4).
*Catatan: Jika file model.pt atau video simulasi tidak ditemukan, sistem akan tetap 
 berjalan dengan fallback ke simulasi anomali otomatis.*

LANGKAH 5: Menjalankan Server FastAPI
Jalankan server menggunakan uvicorn dengan mengaktifkan parameter SSL:
   cd backend
   uvicorn main:app --host 0.0.0.0 --port 8443 --ssl-keyfile=key.pem --ssl-certfile=cert.pem

Setelah server berjalan, Anda dapat mengakses dasbor utama melalui web browser:
   https://localhost:8443  atau  https://<IP-Lokal-Komputer-Anda>:8443

================================================================================
4. KONFIGURASI SISTEM (THRESHOLD & AI PARAMETERS)
================================================================================

Anda dapat menyesuaikan kinerja dan kepekaan deteksi sistem melalui parameter berikut:

A. PARAMETER BACKEND (di file backend/main.py)
   - FRAMES_PER_WINDOW (Default: 16)
     Jumlah frame berurutan yang disimpan dalam buffer untuk satu kali keputusan. 
     Semakin besar nilainya, semakin banyak konteks aksi yang dinilai, namun 
     memerlukan memori lebih besar.
   - WINDOW_STEP (Default: 4)
     Langkah pergeseran jendela inferensi. Nilai yang lebih kecil membuat pemrosesan 
     lebih sering (menurunkan latensi peringatan), tetapi menambah beban komputasi.
   - INFERENCE_EVERY_N (Default: 2)
     Mengatur rasio frame yang diinferensi. Nilai 2 berarti model hanya memproses 
     1 frame dari setiap 2 frame yang masuk (setengah dari framerate input). Tingkatkan 
     nilai ini jika beban CPU server terlalu berat.
   - max_workers (Default: 4)
     Jumlah utas/thread di ThreadPoolExecutor yang digunakan untuk memproses inferensi.

B. PARAMETER DETEKSI FRONTEND (di file app.js)
   - T_LOW (Default: 0.5)
     Threshold bawah probabilitas anomali. Probabilitas anomali di atas nilai ini 
     (namun di bawah T_HIGH) akan diklasifikasikan sebagai "Mencurigakan" (Orange), 
     memicu alert visual, dan merekam klip untuk dimasukkan ke antrean review Guru BK.
   - T_HIGH (Default: 0.8)
     Threshold atas probabilitas anomali. Probabilitas di atas nilai ini diklasifikasikan 
     sebagai "Kritis" (Red), memicu alarm suara melengking di pos satpam, dan 
     menampilkan pop-up darurat tindakan konfirmasi satpam.

================================================================================
5. INTEGRASI KAMERA MULTI-NODE
================================================================================

SafeSchool AI dirancang untuk memantau beberapa kamera secara simultan dalam satu dasbor:

1. KAMERA 1 (Webcam Utama / Lorong Utama)
   - Merupakan webcam lokal komputer yang membuka dasbor utama 'index.html'.
   - Browser akan memproses feed kamera lokal secara otomatis dan mengirimkannya ke 
     server melalui WebSocket `/ws/detect`.

2. KAMERA 2 (CCTV Legacy / Kamera Tetap)
   - Perangkat PC atau laptop lama dengan kamera terpasang dapat diubah menjadi CCTV 
     transmitter dengan membuka alamat `https://<IP-Server>:8443/cctv` (`cctv.html`).
   - Perangkat ini akan terus memancarkan gambar kamera secara stabil dengan kecepatan 
     10 FPS melalui WebSocket `/ws/cctv/cam-2` ke server untuk dideteksi oleh AI.

3. KAMERA 3 & 4 (Simulasi Kamera Belakang Sekolah & Lapangan Olahraga)
   - Server FastAPI secara otomatis menjalankan background task asinkron saat startup 
     untuk memutar file `videos/cam3.mp4` dan `videos/cam4.mp4`.
   - AI memproses video ini frame-by-frame untuk mensimulasikan lingkungan multi-CCTV 
     secara real-time tanpa memerlukan hardware fisik tambahan.

4. DYNAMIC NODE (Join via /join / Kamera HP Bergerak)
   - Guru, staf keamanan, atau murid dapat berkontribusi memantau area sekolah secara 
     dinamis. Caranya dengan mengakses link `https://<IP-Server>:8443/join` (`join.html`) 
     dari HP/device mereka atau memindai QR Code yang disediakan di dasbor utama.
   - Pengguna memasukkan nama kamera kustom (misal: "Kantin Atas"), menyetujui izin 
     kamera, lalu ponsel akan bertindak sebagai kamera pemantau nirkabel yang mengirimkan 
     feed video secara asinkron via WebSocket `/ws/node/{cam_id}`.
   - Kamera yang bergabung akan otomatis muncul di grid pemantauan dasbor satpam dan 
     dapat diganti namanya secara dinamis dari server/dasbor.

================================================================================
6. PANDUAN FITUR BERDASARKAN PERAN PENGGUNA (VIEWS)
================================================================================

Aplikasi dasbor utama mengintegrasikan tiga halaman panel berbeda yang disesuaikan 
dengan alur kerja staf sekolah:

A. SECURITY VIEW (TAMPILAN SATPAM - LIVE MONITORING)
   - Layout Grid Adaptif: Grid video secara dinamis memposisikan letak kamera 
     (mendukung penambahan atau pengurangan node kamera secara otomatis tanpa bug layout).
   - AI Overlay: Menampilkan bounding box hijau/oranye/merah secara real-time pada objek 
     terdeteksi beserta nilai probabilitasnya.
   - Alarm Suara & Pop-up Darurat: Jika terjadi anomali kritis (probabilitas >= 0.8), 
     suara alarm sirene berbunyi dan pop-up tindakan darurat muncul memaksa satpam 
     untuk mengklik "Konfirmasi Tindakan" (Satpam merespon dan bergegas ke lokasi).
   - AI Diagnostics: Widget pemantau kesehatan server, menampilkan status engine, 
     FPS kamera, latensi koneksi (ms), dan estimasi beban CPU AI.
   - Manajemen Nama Node: Satpam dapat mengubah nama deskriptif kamera (misal: dari 
     "cam-5" menjadi "Pintu Masuk Gerbang") langsung dengan menekan tombol pensil.

B. COUNSELOR VIEW (TAMPILAN GURU BK - DAILY INCIDENT REVIEW)
   - Daily Review Queue: Menampilkan tabel daftar kejadian mencurigakan berkategori 
     sedang (probabilitas >= 0.5 hingga < 0.8).
   - Playback Clip Player: Guru BK dapat memutar ulang potongan klip pendek (16 frame 
     rekaman gambar anomali) untuk meninjau kejadian secara visual.
   - Log Catatan BK: Menyediakan kolom input catatan penanganan (misalnya: "Siswa telah 
     dimediasi di ruang BK dan orang tua dipanggil"). Catatan ini langsung disimpan 
     untuk laporan Kepala Sekolah.
   - Aksi Tindak Lanjut: Tombol eskalasi cepat untuk menandai kasus sebagai 
     "False Alarm" atau "Eskalasi Insiden" (Terkonfirmasi).

C. PRINCIPAL VIEW (TAMPILAN KEPALA SEKOLAH - EXECUTIVE ANALYTICS)
   - Ringkasan KPI:
     * SDG 4 Compliance Score: Skor kepatuhan keamanan sekolah (misal: 85%).
     * Total Insiden Bulanan: Jumlah insiden yang terdeteksi dan terkonfirmasi bulan ini.
     * Rata-rata Waktu Respon Satpam: Kecepatan respon satpam menanggapi alarm darurat.
   - Grafik Tren Temporal: Visualisasi grafik tren garis jam-jam rawan terjadinya insiden 
     keamanan di sekolah.
   - Distribusi Pelanggaran: Grafik lingkaran (doughnut chart) interaktif. Mengeklik slice 
     grafik akan memicu drill-down detail data historis.
   - Peta Kerawanan Lokasi (Hotspots): Menampilkan diagram bar lokasi paling sering terjadi 
     pelanggaran (seperti Lapangan Olahraga atau Kantin) lengkap dengan tingkat kerawanan.
   - Log Tindakan Keamanan: Log gabungan yang melacak histori tindakan yang diambil oleh 
     satpam dan catatan penanganan oleh Guru BK.
   - Ekspor Laporan: Tombol "Export PDF" untuk mencetak rangkuman analitik dasbor 
     menjadi format dokumen fisik yang siap dilaporkan ke dinas terkait.

================================================================================
7. CATATAN KEAMANAN SSL / HTTPS & IZIN KAMERA (SANGAT PENTING)
================================================================================

Karena browser modern menerapkan aturan privasi yang ketat, akses hardware kamera 
melalui API 'navigator.mediaDevices.getUserMedia' HANYA BISA berjalan pada origin aman:
1. Protokol 'localhost' atau '127.0.0.1'.
2. Protokol terenkripsi HTTPS (misalnya `https://192.168.1.5:8443`).

Jika Anda mengakses server menggunakan alamat IP Wi-Fi lokal biasa lewat HTTP biasa 
(misal: `http://192.168.1.5:8443/join`), browser akan MEMBLOKIR kamera dan menampilkan 
pesan error "Error: Kamera diblokir/tidak ada!".

SOLUSI UNTUK PENGGUNAAN HP/SMARTPHONE:
1. Pastikan server dijalankan dengan HTTPS (menggunakan parameter SSL uvicorn).
2. Di HP Anda, akses server menggunakan HTTPS, contoh: `https://<IP-Komputer-Server>:8443/join`
3. Browser HP Anda akan menampilkan halaman peringatan keamanan merah ("Your connection is 
   not private" atau "Situs tidak aman"). Ini wajar karena sertifikat SSL yang digunakan 
   bersifat self-signed (dibuat secara mandiri, bukan oleh otoritas sertifikat resmi).
4. Lewati peringatan tersebut dengan mengklik tombol "Lanjutan" (Advanced) lalu klik 
   "Lanjutkan ke <IP-Address> (tidak aman)" atau "Proceed to <IP-Address> (unsafe)".
5. Berikan izin akses kamera saat diminta oleh browser HP Anda. Feed video sekarang 
   akan berhasil dipancarkan ke server secara nirkabel melalui WebSocket WSS (`wss://`).

================================================================================
8. PANDUAN TROUBLESHOOTING & MASALAH UMUM
================================================================================

* MASALAH: Pesan "Kamera diblokir/tidak ada" muncul di halaman cctv.html atau join.html.
  * Solusi: Pastikan Anda membuka halaman tersebut melalui alamat 'https://' dan bukan 'http://'. 
    Periksa juga izin kamera pada setelan situs browser Anda.

* MASALAH: Node kamera (HP/Laptop lain) gagal terhubung ke server (Connection Failed).
  * Solusi: 
    1. Pastikan HP dan komputer server terhubung ke satu jaringan Wi-Fi/sub-net yang sama.
    2. Periksa apakah Windows Firewall di komputer server memblokir port 8443. Tambahkan 
       aturan "Inbound Rules" (Aturan Masuk) di Windows Firewall untuk port TCP 8443 agar 
       koneksi dari luar diizinkan masuk.

* MASALAH: Gambar video simulator Kamera 3 & 4 tidak berjalan di dasbor.
  * Solusi: Pastikan folder 'videos' telah dibuat di direktori root proyek dan berisi file 
    video 'cam3.mp4' serta 'cam4.mp4'. Jika model ML atau file video tidak lengkap, pastikan 
    tidak ada pesan kesalahan (exception) pada konsol uvicorn backend.

* MASALAH: Penggunaan CPU komputer server terlalu tinggi saat memproses inferensi AI.
  * Solusi:
    1. Naikkan nilai parameter 'INFERENCE_EVERY_N' pada file 'backend/main.py' (misalnya 
       menjadi 3 atau 4) untuk membatasi jumlah frame yang dievaluasi per detik.
    2. Kurangi jumlah utas pada 'torch.set_num_threads(4)' menjadi 2 di file main.py.
    3. Hentikan pemrosesan video simulasi Kamera 3 & 4 jika Anda hanya ingin menguji kamera live.

================================================================================
                    SafeSchool AI - Menjaga Sekolah Tetap Aman
================================================================================
