const express = require('express');
const http = require('http'); // Server Native Node.js
const { ExpressPeerServer } = require('peer'); // PeerJS versi Express
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Izin akses silang domain

const app = express();
const server = http.createServer(app); // Bungkus Express dengan HTTP Server

// --- KONFIGURASI ---
const PORT = process.env.PORT || 3000; // Port otomatis (Cloud) atau 3000 (Local)
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors()); // Izinkan akses dari mana saja (Penting untuk Mobile Data)
app.use(express.json());
app.use(express.static('public'));

// --- 1. SISTEM DATABASE (JSON) ---
function readDB() {
    // Inisialisasi Database jika file belum ada
    if (!fs.existsSync(DB_FILE)) {
        const initialData = { 
            users: {},   // "private" root (Data User)
            saved: {},   // "saved" root (Data Teman)
            api_keys: {  // Root API Key
                "NEON-SECRET-KEY-2024": { "owner": "Admin", "active": true }
            }
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- 2. MIDDLEWARE SECURITY (SATPAM API KEY) ---
const checkApiKey = (req, res, next) => {
    // Lewati cek key untuk akses file statis (HTML/CSS) dan PeerJS signaling
    if (req.path.startsWith('/peerjs') || req.method === 'GET' && !req.path.startsWith('/api')) {
        return next();
    }

    const clientKey = req.headers['x-api-key'];
    const db = readDB();

    if (!clientKey || !db.api_keys[clientKey] || !db.api_keys[clientKey].active) {
        console.log(`⛔ Akses ditolak dari IP: ${req.ip} (Key Invalid)`);
        return res.status(403).json({ error: "Access Denied: Invalid API Key" });
    }

    next(); // Lanjut jika Key Valid
};

// Pasang Satpam di seluruh aplikasi
app.use(checkApiKey);


// --- 3. API ENDPOINTS ---

// [POST] Auth / Register / Check ID
app.post('/api/auth', (req, res) => {
    const { id, action } = req.body;
    const db = readDB();

    if (action === 'check') {
        if (db.users[id]) return res.json({ status: 'exist', user: db.users[id] });
        return res.json({ status: 'not_found' });
    }

    if (action === 'register') {
        // Register User Baru
        db.users[id] = { id: id, joinedAt: new Date().toISOString() };
        if (!db.saved[id]) db.saved[id] = []; // Siapkan slot teman
        
        writeDB(db);
        console.log(`🆕 User Baru Terdaftar: ${id}`);
        return res.json({ status: 'success' });
    }
});

// [POST] Add Friend (Dengan Validasi Ketat)
app.post('/api/add-friend', (req, res) => {
    const { myId, friendId } = req.body;
    const db = readDB();

    // Validasi 1: Input tidak boleh kosong
    if (!friendId || !myId) return res.status(400).json({ error: "Data tidak lengkap" });

    // Validasi 2: Tidak boleh add diri sendiri
    if (friendId === myId) return res.status(400).json({ error: "Tidak bisa add diri sendiri" });

    // Validasi 3: Cek apakah ID Teman ada di Database USER?
    if (!db.users[friendId]) {
        return res.status(404).json({ error: "User ID tidak ditemukan dalam sistem database kami." });
    }

    // Logic Simpan
    const currentList = db.saved[myId] || [];
    if (!currentList.includes(friendId)) {
        currentList.push(friendId);
        db.saved[myId] = currentList;
        writeDB(db);
        console.log(`🤝 ${myId} menambahkan ${friendId}`);
    }

    res.json({ success: true, message: "Kontak berhasil disimpan" });
});

// [GET] Get Friends (Dengan Auto Cleanup)
app.get('/api/friends/:id', (req, res) => {
    const myId = req.params.id;
    const db = readDB();

    if (!db.users[myId]) return res.json({ friends: [] });

    let mySaved = db.saved[myId] || [];
    const originalCount = mySaved.length;

    // Filter: Hanya ambil teman yang MASIH ADA di database users
    const validFriends = mySaved.filter(friendId => db.users[friendId]);

    // Jika ada teman yang akunnya sudah dihapus, update DB saved
    if (validFriends.length !== originalCount) {
        db.saved[myId] = validFriends;
        writeDB(db);
        console.log(`🧹 Auto-cleanup daftar teman user ${myId}`);
    }

    res.json({ friends: validFriends });
});


// --- 4. PEERJS SERVER (Disatukan dengan Express) ---
// Ini penting agar bisa jalan di Glitch/Render yang hanya kasih 1 Port
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp', // Client akan akses ke /peerjs/myapp
    allow_discovery: true,
    proxied: true // Wajib true jika di belakang proxy (Cloud Load Balancer)
});

app.use('/peerjs', peerServer);


// --- 5. START SERVER ---
server.listen(PORT, () => {
    console.log(`🚀 SERVER APPS READY!`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🔑 Default API Key: NEON-SECRET-KEY-2024`);
});