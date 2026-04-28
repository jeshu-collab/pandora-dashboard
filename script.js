// 1. CONFIG
const RENDER_URL = "wss://pandora-router.onrender.com";
let ws;

// 2. LOGIN (The most important part)
function checkLogin(e) {
    if (e.key === "Enter") {
        const pass = document.getElementById('passcode').value;
        if (pass === "admin") {
            document.getElementById('login-overlay').style.display = 'none';
            connectWS();
        } else {
            alert("WRONG KEY");
        }
    }
}

// 3. CONNECTION
function connectWS() {
    ws = new WebSocket(RENDER_URL);
    ws.onopen = () => {
        document.getElementById('conn-status').innerText = "[ UPLINK: ONLINE ]";
        document.getElementById('conn-status').style.color = "#0f0";
    };
    ws.onclose = () => {
        document.getElementById('conn-status').innerText = "[ UPLINK: OFFLINE ]";
        document.getElementById('conn-status').style.color = "red";
        setTimeout(connectWS, 3000);
    };
}

// 4. COMMANDS
function sendCameraCommand() {
    const url = document.getElementById('ip-cam-url').value;
    if (!url) return alert("ENTER URL");
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ "command": "START", "url": url }));
        alert("SIGNAL SENT");
    } else {
        alert("ROUTER OFFLINE");
    }
}

// 5. UI CONTROLS
function triggerLockdown() {
    document.body.classList.toggle('lockdown-mode');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
}

function toggleMute() {
    console.log("Mute toggled");
}

function acknowledge(dept) {
    console.log("Ack: " + dept);
}

function resolve(dept) {
    document.getElementById(dept + '-alert').style.display = 'none';
}
