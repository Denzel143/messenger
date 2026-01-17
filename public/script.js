let myID = localStorage.getItem('neon_user_id');
let activeFriend = null; // Siapa yang sedang kita chat
let peer = null;

// --- STARTUP ---
async function init() {
    if (!myID) {
        myID = generateID();
        await registerID(); // Register ID baru
    } else {
        await checkID(); // Cek ID lama
    }
    
    document.getElementById('startup-overlay').style.display = 'none';
    document.getElementById('my-id').innerText = myID;
    
    initPeer();     // Nyalakan WebRTC
    loadContacts(); // Ambil daftar kontak
}

function generateID() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = ''; 
    for(let i=0; i<6; i++) res += chars.charAt(Math.floor(Math.random()*chars.length));
    return res;
}

// --- API CALLS ---
async function registerID() {
    localStorage.setItem('neon_user_id', myID);
    await fetch('/api/auth', {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: myID, action: 'register' })
    });
}

async function checkID() {
    const res = await fetch('/api/auth', {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: myID, action: 'check' })
    });
    const data = await res.json();
    if(data.status !== 'exist') {
        localStorage.removeItem('neon_user_id');
        location.reload(); // Reset jika data server hilang
    }
}

// --- LOGIC KONTAK (INTI REQUESTMU) ---
async function promptAddContact() {
    const targetID = prompt("Masukkan ID Teman (Case Sensitive):");
    if(!targetID) return;

    // Panggil Server untuk Cek & Add
    try {
        const res = await fetch('/api/add-friend', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ myId: myID, friendId: targetID })
        });

        const data = await res.json();

        if (res.ok) {
            alert("✅ " + data.message);
            loadContacts(); // Refresh list
        } else {
            // Ini akan muncul jika ID tidak ada di database Private
            alert("❌ GAGAL: " + data.error);
        }
    } catch (e) {
        alert("Server Error");
    }
}

async function loadContacts() {
    const res = await fetch(`/api/friends/${myID}`);
    const data = await res.json();
    renderContacts(data.friends);
}

function renderContacts(friends) {
    const list = document.getElementById('contact-list');
    list.innerHTML = '';

    friends.forEach(fID => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        if(activeFriend === fID) item.classList.add('active');
        
        item.innerHTML = `
            <div class="avatar"><i class="ri-user-line"></i></div>
            <span>${fID}</span>
        `;
        
        // Saat Kontak Diklik
        item.onclick = () => selectContact(fID);
        list.appendChild(item);
    });
}

function selectContact(fID) {
    activeFriend = fID;
    
    // Update UI Header
    document.getElementById('current-chat-name').innerText = "Chatting with: " + fID;
    document.getElementById('current-chat-status').innerText = "Connecting...";
    
    // Aktifkan Input
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    
    // Bersihkan Chat Box (Optional: bisa load history kalau ada)
    document.getElementById('chat-box').innerHTML = '';

    // Update highlight di list
    loadContacts(); 
}

// --- PEER JS ---
function initPeer() {
    peer = new Peer(myID, { host: window.location.hostname, port: 9000, path: '/myapp' });
    
    peer.on('open', () => {
        document.getElementById('status').classList.remove('offline');
        document.getElementById('status').classList.add('online');
    });

    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            // Tampilkan pesan hanya jika dari teman yang sedang dipilih (atau notif)
            if (conn.peer === activeFriend) {
                appendMessage(conn.peer, data, 'friend');
            } else {
                // Bisa tambah notifikasi sederhana
                alert(`Pesan baru dari ${conn.peer}`);
            }
        });
    });
}

// --- CHAT LOGIC ---
function kirimPesan() {
    const input = document.getElementById('msg-input');
    const msg = input.value;
    if(!msg || !activeFriend) return;

    const conn = peer.connect(activeFriend);
    
    conn.on('open', () => {
        conn.send(msg);
        appendMessage("ME", msg, 'me');
        input.value = '';
        document.getElementById('current-chat-status').innerText = "Online";
    });
    
    conn.on('error', () => {
        document.getElementById('current-chat-status').innerText = "Offline / Error";
        alert("Gagal kirim. Teman mungkin offline.");
    });
}

function appendMessage(sender, text, type) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `message msg-${type}`;
    div.innerText = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// Event Enter
document.getElementById('msg-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') kirimPesan();
});

// Start
init();