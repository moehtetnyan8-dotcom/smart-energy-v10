const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors());

// Serve your local index.html
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- CONFIGURATION ---
const PORT = 3000;
const SUPABASE_URL = 'https://fjtvytuknssvkfrqcxqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHZ5dHVrbnNzdmtmcnFjeHFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEyODY5OSwiZXhwIjoyMDk5NzA0Njk5fQ.h6cbQwnVrV0etkhUQ20WusTejqIyVXtKwdJT5vEUkQ8'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TELEGRAM_TOKEN = '8895229242:AAE0fKGO4d_pZsxGGnViaEkvnic36BqhmzA';
const CHAT_ID = '5670162975';

// Local Memory (This allows testing without a VPN)
let lastTelemetry = { voltage: 0, current: 0, frequency: 0, power_factor: 0, active_power: 0, max_export_demand: 0 };
let systemMode = "MANUAL";
let states = { led1: "OFF", led2: "OFF", led3: "OFF" };
let vThreshold = 214;
let lastAlertTime = 0;

async function sendTelegram(msg) {
    if (Date.now() - lastAlertTime < 60000) return;
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(msg)}`);
        lastAlertTime = Date.now();
    } catch (e) { console.log("Telegram blocked without VPN"); }
}

// 1. ESP32 DATA INPUT
app.post('/api/energy-data', async (req, res) => {
    const d = req.body;
    lastTelemetry = {
        voltage: parseFloat(d.voltage || 0),
        current: parseFloat(d.current || 0),
        frequency: parseFloat(d.frequency || 0),
        power_factor: parseFloat(d.powerFactor || 0),
        active_power: parseFloat(d.activePower || 0),
        max_export_demand: parseFloat(d.totalDemand || 0)
    };

    // AUTO PROTECTION
    if (systemMode === "AUTO" && lastTelemetry.voltage > vThreshold) {
        states.led1 = "OFF";
        sendTelegram(`🚨 High Voltage: ${lastTelemetry.voltage}V! System shutdown.`);
    }

    // Attempt Cloud Sync (Will fail gracefully if no VPN)
    try {
        await supabase.from('telemetry').insert([lastTelemetry]);
    } catch (e) { console.log("Cloud sync paused (No VPN/Internet)"); }

    res.json({ ...states, mode: systemMode, threshold: vThreshold });
});

// 2. LOCAL FETCH FOR DASHBOARD (Works without VPN)
app.get('/api/get-local', (req, res) => {
    res.json(lastTelemetry);
});

app.post('/api/control-led', (req, res) => {
    const { target, status, mode, newThreshold } = req.body;
    if (mode) systemMode = mode;
    if (target) states[target] = status;
    if (newThreshold) vThreshold = parseFloat(newThreshold);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Local Dashboard: http://localhost:${PORT}`));