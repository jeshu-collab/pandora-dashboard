// --- CONFIGURATION ---
const RENDER_URL = "wss://pandora-router.onrender.com";
let ws;

// --- STATE MANAGEMENT ---
let isMuted = true;
let countdowns = {};
let maps = { police: null, medical: null, fire: null };
const colors = { police: "#ff0000", medical: "#00aaff", fire: "#ffaa00" };

// Lockdown State
let isLockdownActive = false;
let lockdownSiren = null;

// --- AUDIO ENGINE ---
// We create this only after a user gesture (Login) to satisfy browser security
let audioCtx;
const alarms = {
    police: { freq: 900, type: 'square' },
    medical: { freq: 440, type: 'sine' },
    fire: { freq: 600, type: 'sawtooth' }
};
let activeOscillators = {};

// --- AUTHENTICATION ---
function checkLogin(e) {
    // This handles the 'onkeyup' event from your HTML
    if (e.key === "Enter") {
        const passValue = document.getElementById('passcode').value;
        if (passValue === "admin") {
            // Hide overlay
            document.getElementById('login-overlay').style.display = 'none';
            
            // Initialize AudioContext on user gesture
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } else if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            connectWS();
            initMaps();
        } else {
            alert("ACCESS DENIED");
            document.getElementById('passcode').value = "";
        }
    }
}

// --- WEBSOCKET ENGINE ---
function connectWS() {
    // FORCE the connection - no extra slashes or paths
    ws = new WebSocket(RENDER_URL);

    ws.onopen = () => {
        console.log("SUCCESS: Cloud Bridge Established");
        const statusEl = document.getElementById('conn-status');
        if (statusEl) {
            statusEl.innerText = "[ UPLINK STATUS: ONLINE ]";
            statusEl.style.color = "#0f0";
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("Data Received:", data);
            if (data.alert_type) handleAlert(data);
        } catch (e) {
            console.log("Ignoring non-JSON heartbeat");
        }
    };

    ws.onclose = (e) => {
        console.log("Connection lost. Reason: ", e.reason);
        const statusEl = document.getElementById('conn-status');
        if (statusEl) {
            statusEl.innerText = "[ UPLINK STATUS: RECONNECTING... ]";
            statusEl.style.color = "orange";
        }
        // This is the most important part: Auto-retry every 2 seconds
        setTimeout(connectWS, 2000);
    };

    ws.onerror = (err) => {
        console.error("Socket Error:", err);
        ws.close(); // Force a close so the onclose retry logic kicks in
    };
}

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.alert_type) handleAlert(data);
        } catch (err) {
            console.error("Payload Error", err);
        }
    };

    ws.onclose = () => {
        const statusEl = document.getElementById('conn-status');
        if (statusEl) {
            statusEl.innerText = "[ UPLINK STATUS: OFFLINE ]";
            statusEl.style.color = "red";
        }
        setTimeout(connectWS, 3000);
    };
}

// --- GLOBAL LOCKDOWN TRIGGER ---
function triggerLockdown() {
    isLockdownActive = !isLockdownActive;
    const btn = document.querySelector('.btn-lockdown');

    if (isLockdownActive) {
        document.body.classList.add('lockdown-mode');
        btn.innerText = "🛑 TERMINATE LOCKDOWN";
        if (!isMuted) startLockdownSiren();
    } else {
        document.body.classList.remove('lockdown-mode');
        btn.innerText = "🚨 INITIATE GLOBAL LOCKDOWN";
        if (lockdownSiren) {
            lockdownSiren.stop();
            lockdownSiren = null;
        }
    }
}

function startLockdownSiren() {
    if (lockdownSiren || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    lockdownSiren = osc;
}

// --- CORE LOGIC: THREAT HANDLING ---
function handleAlert(data) {
    const dept = getDept(data.alert_type);
    const alertEl = document.getElementById(`${dept}-alert`);
    if (alertEl) alertEl.style.display = "block";
    
    document.getElementById(`${dept}-bldg`).innerText = `${data.building || 'SITE'} - ${data.room || 'A1'}`;
    document.getElementById(`${dept}-conf`).innerText = data.confidence || '--';
    document.getElementById(`${dept}-img`).src = `data:image/jpeg;base64,${data.image}`;
    
    startTimer(dept);
    startAlarm(dept);
    updateMap(dept, data.lat || 16.4961, data.lng || 80.4994);
    addLog(data);
}

function getDept(type) {
    if (type.includes('fire')) return 'fire';
    if (type.includes('medical')) return 'medical';
    return 'police';
}

function sendCameraCommand() {
    const url = document.getElementById('ip-cam-url').value;
    if (!url) return alert("URL REQUIRED");

    // Command fix for Render Backend
    const payload = { "command": "START", "url": url };
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        alert("SAAS UPLINK INITIALIZED");
    } else {
        alert("SERVER OFFLINE - RECONNECTING...");
    }
}

// --- UI UTILITIES ---
function startTimer(dept) {
    if (countdowns[dept]) return;
    let time = 180;
    countdowns[dept] = setInterval(() => {
        const timerEl = document.getElementById(`${dept}-timer`);
        if (time <= 0) {
            clearInterval(countdowns[dept]);
            if (timerEl) timerEl.innerText = "DISPATCHED";
            return;
        }
        time--;
        let m = Math.floor(time / 60).toString().padStart(2, '0');
        let s = (time % 60).toString().padStart(2, '0');
        if (timerEl) timerEl.innerText = `${m}:${s}`;
    }, 1000);
}

function acknowledge(dept) {
    clearInterval(countdowns[dept]);
    countdowns[dept] = null;
    stopAlarm(dept);
    const timerEl = document.getElementById(`${dept}-timer`);
    if (timerEl) timerEl.innerText = "ACK'D";
}

function resolve(dept) {
    clearInterval(countdowns[dept]);
    countdowns[dept] = null;
    stopAlarm(dept);
    const alertEl = document.getElementById(`${dept}-alert`);
    if (alertEl) alertEl.style.display = "none";
}

function startAlarm(dept) {
    if (isMuted || activeOscillators[dept] || !audioCtx) return;
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
        if (lockdownSiren) { lockdownSiren.stop(); lockdownSiren = null; }
    }
}

function initMaps() {
    ['police', 'medical', 'fire'].forEach(dept => {
        const mapEl = document.getElementById(`${dept}-map`);
        if (mapEl && !maps[dept]) {
            maps[dept] = L.map(`${dept}-map`).setView([16.4961, 80.4994], 17);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(maps[dept]);
        }
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
    document.getElementById(tabId).style.display = 'block';
    event.currentTarget.classList.add('active');
    setTimeout(() => { if(maps[tabId]) maps[tabId].invalidateSize(); }, 100);
}

function addLog(data) {
    const container = document.getElementById('log-container');
    if (!container) return;
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.style = "padding:10px; border-bottom:1px solid #222; cursor:pointer;";
    logEntry.innerHTML = `<b>${(data.alert_type || 'THREAT').toUpperCase()}</b><br>${data.building || 'SITE'}`;
    logEntry.onclick = () => showModal(data);
    container.prepend(logEntry);
}

function showModal(data) {
    document.getElementById('log-modal').style.display = 'flex';
    document.getElementById('modal-title').innerText = (data.alert_type || 'ALERT').toUpperCase();
    document.getElementById('modal-img').src = `data:image/jpeg;base64,${data.image}`;
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
}
// ... (The rest of your code above)

function addLog(data) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-item';
    logEntry.style.padding = "10px";
    logEntry.style.borderBottom = "1px solid #222";
    logEntry.style.cursor = "pointer";
    logEntry.innerHTML = `
        <div style="color:${colors[getDept(data.alert_type)]}; font-weight:bold; font-size:11px;">
            ${data.alert_type.toUpperCase()}
        </div>
        <div style="color:#888; font-size:10px;">${new Date().toLocaleTimeString()} | ${data.building}</div>
    `;
    logEntry.onclick = () => showModal(data);
    document.getElementById('log-container').prepend(logEntry);
}

function showModal(data) {
    document.getElementById('log-modal').style.display = 'flex';
    document.getElementById('modal-title').innerText = data.alert_type.toUpperCase();
    document.getElementById('modal-info').innerText = `Location: ${data.building} Sector ${data.room} | Confidence: ${data.confidence}%`;
    document.getElementById('modal-img').src = `data:image/jpeg;base64,${data.image}`;
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const themeBtn = document.querySelector('button[onclick="toggleTheme()"]');
    if (themeBtn) {
        themeBtn.innerText = document.body.classList.contains('light-mode') ? "🌙 Dark Mode" : "🌓 Light Mode";
    }
}
// ENSURE THERE IS NOTHING ELSE BELOW THIS LINE
