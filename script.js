const RENDER_URL = "wss://pandora-router.onrender.com";
let ws;
let maps = { police: null, medical: null, fire: null };

function checkLogin(e) {
    if (e.key === "Enter") {
        const pass = document.getElementById('passcode').value;
        if (pass === "admin") {
            document.getElementById('login-overlay').style.display = 'none';
            initMaps();
            connectWS();
        } else { alert("ACCESS DENIED"); }
    }
}

function connectWS() {
    ws = new WebSocket(RENDER_URL);
    ws.onopen = () => {
        const el = document.getElementById('conn-status');
        el.innerText = "[ UPLINK: ONLINE ]"; el.style.color = "#0f0";
    };
    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.alert_type) {
            let dept = data.alert_type.includes('fire') ? 'fire' : (data.alert_type.includes('medical') ? 'medical' : 'police');
            document.getElementById(dept + '-alert').style.display = 'block';
            document.getElementById(dept + '-img').src = 'data:image/jpeg;base64,' + data.image;
            if (maps[dept]) maps[dept].setView([data.lat, data.lng], 18);
        }
    };
    ws.onclose = () => {
        document.getElementById('conn-status').innerText = "[ UPLINK: OFFLINE ]";
        document.getElementById('conn-status').style.color = "red";
        setTimeout(connectWS, 3000);
    };
}

function sendCameraCommand() {
    const url = document.getElementById('ip-cam-url').value;
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ "command": "START", "url": url }));
        alert("SIGNAL ROUTED TO CLOUD AI");
    }
}

function initMaps() {
    ['police', 'medical', 'fire'].forEach(dept => {
        if (!maps[dept]) {
            maps[dept] = L.map(dept + '-map').setView([16.4961, 80.4994], 17);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(maps[dept]);
        }
    });
}

function triggerLockdown() { document.body.classList.toggle('lockdown-mode'); }
function switchTab(id) {
    document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}
function resolve(dept) { document.getElementById(dept + '-alert').style.display = 'none'; }
function toggleTheme() { document.body.classList.toggle('light-mode'); }
