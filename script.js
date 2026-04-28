// --- CONFIGURATION ---
const RENDER_URL = "wss://pandora-router.onrender.com";
const ws = new WebSocket(RENDER_URL);

// --- STATE MANAGEMENT ---
let isMuted = true;
let countdowns = {};
let incidentLogs = [];
let maps = { police: null, medical: null, fire: null };
const colors = { police: "#ff0000", medical: "#00aaff", fire: "#ffaa00" };
let isLockdownActive = false; // Added for lockdown logic
let lockdownOsc = null;      // Added for lockdown logic

// --- AUDIO ENGINE ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const alarms = {
    police: { freq: 900, type: 'square' },
    medical: { freq: 440, type: 'sine' },
    fire: { freq: 600, type: 'sawtooth' }
};
let activeOscillators = {};

// --- AUTHENTICATION ---
function checkLogin(e) {
    if (e.key === "Enter") {
        if (document.getElementById('passcode').value === "admin") {
            document.getElementById('login-overlay').style.display = 'none';
            if (audioCtx.state === 'suspended') audioCtx.resume();
            initMaps();
        } else {
            alert("ACCESS DENIED: INVALID KEY");
        }
    }
}

// --- WEBSOCKET ENGINE ---
ws.onopen = () => {
    document.getElementById('conn-status').innerText = "[ UPLINK STATUS: ONLINE ]";
    document.getElementById('conn-status').style.color = "#0f0";
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.alert_type) {
        handleAlert(data);
    }
};

ws.onclose = () => {
    document.getElementById('conn-status').innerText = "[ UPLINK STATUS: DISCONNECTED ]";
    document.getElementById('conn-status').style.color = "red";
};

// --- NEW LOCKDOWN LOGIC ---
function triggerLockdown() {
    isLockdownActive = !isLockdownActive;
    const btn = document.querySelector('.btn-lockdown');

    if (isLockdownActive) {
        document.body.classList.add('lockdown-mode');
        btn.innerText = "🛑 TERMINATE LOCKDOWN";
        if (!isMuted) startLockdownSiren();
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ "command": "LOCKDOWN", "active": true }));
        }
    } else {
        document.body.classList.remove('lockdown-mode');
        btn.innerText = "🚨 INITIATE GLOBAL LOCKDOWN";
        if (lockdownOsc) { lockdownOsc.stop(); lockdownOsc = null; }
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ "command": "LOCKDOWN", "active": false }));
        }
    }
}

function startLockdownSiren() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    lockdownOsc = osc;
}

// --- CORE LOGIC: THREAT HANDLING ---
function handleAlert(data) {
    const dept = getDept(data.alert_type);
    document.getElementById(`${dept}-alert`).style.display = "block";
    document.getElementById(`${dept}-bldg`).innerText = `${data.building} - ${data.room}`;
    document.getElementById(`${dept}-conf`).innerText = data.confidence;
    document.getElementById(`${dept}-img`).src = `data:image/jpeg;base64,${data.image}`;
    startTimer(dept);
    startAlarm(dept);
    updateMap(dept, data.lat, data.lng);
    addLog(data);
}

function getDept(type) {
    if (type.includes('fire')) return 'fire';
    if (type.includes('medical') || type.includes('collapse')) return 'medical';
    return 'police';
}

function sendCameraCommand() {
    const url = document.getElementById('ip-cam-url').value;

    if (!url) {
        alert("CRITICAL: PLEASE PROVIDE IP STREAM URL");
        return;
    }

    // CHANGE: Changed "CHANGE_CAMERA" to "START" to match the Python backend
    const payload = {
        "command": "START", 
        "url": url
    };

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        alert("COMMAND ROUTED: INITIALIZING CLOUD AI ON STREAM");
    } else {
        alert("ERROR: SERVER OFFLINE");
    }
}

// --- KEEPING ALL YOUR UI FUNCTIONS ---
function startTimer(dept) {
    if (countdowns[dept]) return;
    let time = 180;
    countdowns[dept] = setInterval(() => {
        if (time <= 0) {
            clearInterval(countdowns[dept]);
            document.getElementById(`${dept}-timer`).innerText = "DISPATCHED";
            return;
        }
        time--;
        let m = Math.floor(time / 60).toString().padStart(2, '0');
        let s = (time % 60).toString().padStart(2, '0');
        document.getElementById(`${dept}-timer`).innerText = `${m}:${s}`;
    }, 1000);
}

function acknowledge(dept) {
    clearInterval(countdowns[dept]);
    countdowns[dept] = null;
    stopAlarm(dept);
    document.getElementById(`${dept}-timer`).innerText = "ACK'D";
}

function resolve(dept) {
    clearInterval(countdowns[dept]);
    countdowns[dept] = null;
    stopAlarm(dept);
    document.getElementById(`${dept}-alert`).style.display = "none";
}

function startAlarm(dept) {
    if (isMuted || activeOscillators[dept]) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = alarms[dept].type;
    osc.frequency.setValueAtTime(alarms[dept].freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    activeOscillators[dept] = { osc, gain };
}

function stopAlarm(dept) {
    if (activeOscillators[dept]) {
        activeOscillators[dept].osc.stop();
        delete activeOscillators[dept];
    }
}

function toggleMute() {
    isMuted = !isMuted;
    document.getElementById('mute-btn').innerText = isMuted ? "🔊 Audio On" : "🔇 Mute Alarms";
    if (isMuted) {
        Object.keys(activeOscillators).forEach(stopAlarm);
        if (lockdownOsc) { lockdownOsc.stop(); lockdownOsc = null; }
    }
}

function initMaps() {
    ['police', 'medical', 'fire'].forEach(dept => {
        maps[dept] = L.map(`${dept}-map`).setView([16.4961, 80.4994], 17);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(maps[dept]);
    });
}

function updateMap(dept, lat, lng) {
    if (maps[dept]) {
        maps[dept].setView([lat, lng], 18);
        L.marker([lat, lng]).addTo(maps[dept]).bindPopup(`<b>INCIDENT</b>`).openPopup();
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).style.display = 'flex';
    event.currentTarget.classList.add('active');
    setTimeout(() => { if(maps[tabId]) maps[tabId].invalidateSize(); }, 100);
}

function addLog(data) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<b>${data.alert_type.toUpperCase()}</b><br>${data.building} Sector ${data.room}`;
    logEntry.onclick = () => showModal(data);
    document.getElementById('log-container').prepend(logEntry);
}

function showModal(data) {
    document.getElementById('log-modal').style.display = 'flex';
    document.getElementById('modal-title').innerText = data.alert_type.toUpperCase();
    document.getElementById('modal-info').innerText = `Location: ${data.building} Sector ${data.room}`;
    document.getElementById('modal-img').src = `data:image/jpeg;base64,${data.image}`;
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const themeBtn = document.querySelector('button[onclick="toggleTheme()"]');
    themeBtn.innerText = document.body.classList.contains('light-mode') ? "🌙 Dark Mode" : "🌓 Light Mode";
}
