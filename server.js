/*
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors());

// Serve the website
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://fjtvytuknssvkfrqcxqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHZ5dHVrbnNzdmtmcnFjeHFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEyODY5OSwiZXhwIjoyMDk5NzA0Njk5fQ.h6cbQwnVrV0etkhUQ20WusTejqIyVXtKwdJT5vEUkQ8'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TELEGRAM_TOKEN = '8895229242:AAE0fKGO4d_pZsxGGnViaEkvnic36BqhmzA';
const CHAT_ID = '5670162975';
const API_KEY = "SECRET_KEY_9988";

let states = { led1: "OFF", led2: "OFF", led3: "OFF" };
let systemMode = "MANUAL";
let vLimit = 214;

// 1. LOGIN TUNNEL (Bypasses ISP Block)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json(error);
    res.json(data);
});

// 2. DATA TUNNEL (Bypasses ISP Block)
app.get('/api/get-telemetry', async (req, res) => {
    const { data, error } = await supabase.from('telemetry').select('*').order('created_at', { ascending: false }).limit(1);
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

// 3. ESP32 INPUT
app.post('/api/energy-data', async (req, res) => {
    try {
        if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
        const d = req.body;
        await supabase.from('telemetry').insert([{
            voltage: d.voltage, current: d.current, frequency: d.frequency,
            power_factor: d.power_factor, active_power: d.active_power, max_export_demand: d.max_export_demand
        }]);
        res.json({ ...states, mode: systemMode });
    } catch (e) { res.status(500).send(); }
});

// 4. CONTROL
app.post('/api/control-led', (req, res) => {
    const { target, status, mode, newThreshold } = req.body;
    if (mode) systemMode = mode;
    if (target) states[target] = status;
    if (newThreshold) vLimit = parseFloat(newThreshold);
    res.json({ success: true });
});

module.exports = app;
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v10.5 Tunnel Active`));
*/

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Use built-in fetch if available (Node 18+), otherwise use node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = 'https://fjtvytuknssvkfrqcxqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHZ5dHVrbnNzdmtmcnFjeHFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEyODY5OSwiZXhwIjoyMDk5NzA0Njk5fQ.h6cbQwnVrV0etkhUQ20WusTejqIyVXtKwdJT5vEUkQ8'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TELEGRAM_TOKEN = '8895229242:AAE0fKGO4d_pZsxGGnViaEkvnic36BqhmzA';
const CHAT_ID = '5670162975';
let lastAlertTime = 0; 
const API_KEY = "SECRET_KEY_9988";

let systemMode = "MANUAL";
let states = { led1: "OFF", led2: "OFF", led3: "OFF" };
let vThreshold = 214; 

// Function to send Telegram Alert
async function sendTelegram(msg) {
    const now = Date.now();
    if (now - lastAlertTime < 60000) return; // 1 minute cooldown
    
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(msg)}`;
    
    try {
        const response = await fetch(url);
        const result = await response.json();
        if (result.ok) {
            lastAlertTime = now;
            console.log("✈️ Telegram Alert Sent Successfully");
        } else {
            console.log("❌ Telegram API Error:", result.description);
        }
    } catch (e) {
        console.log("❌ Network Error: Could not reach Telegram.");
    }
}

app.post('/api/energy-data', async (req, res) => {
    try {
        if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
        const d = req.body; 
        const v = parseFloat(d.voltage || 0);

        // --- CRITICAL FIX: ADDED 'AWAIT' HERE ---
        if (v > vThreshold) {
            if (systemMode === "AUTO") {
                states.led1 = "OFF"; 
                await sendTelegram(`🚨 High Voltage Alert!\nVoltage: ${v}V\nThreshold: ${vThreshold}V\nAction: AUTO-SHUTDOWN EXECUTED.`);
            } else {
                await sendTelegram(`⚠️ High Voltage Warning!\nVoltage: ${v}V\nThreshold: ${vThreshold}V\nAction: Manual check required.`);
            }
        }
        // --- AUTO SHUTDOWN LOGIC ---
        if (systemMode === "AUTO" && volt > vThreshold) {
            states.led1 = "OFF"; // This forces the instruction to the ESP32 to be OFF
            console.log("🚨 AUTO SHUTDOWN: Voltage exceeded " + vThreshold + "V");
        }

        // SAVE TO SUPABASE
        await supabase.from('telemetry').insert([{
            voltage: v,
            current: parseFloat(d.current || 0),
            frequency: parseFloat(d.frequency || 0),
            power_factor: parseFloat(d.power_factor || 0),
            active_power: parseFloat(d.active_power || 0),
            max_export_demand: parseFloat(d.max_export_demand || 0)
        }]);

        // Return states to ESP32
        res.json({ led1: states.led1, led2: states.led2, led3: states.led3, mode: systemMode, threshold: vThreshold });
    } catch (e) { 
        console.log("Server Error");
        res.status(500).send();
    }
});

app.get('/api/get-telemetry', async (req, res) => {
    const { data, error } = await supabase.from('telemetry').select('*').order('created_at', { ascending: false }).limit(1);
    res.json(data[0]);
});

app.post('/api/control-led', (req, res) => {
    const { target, status, mode, newThreshold } = req.body;
    if (mode) systemMode = mode;
    if (target) states[target] = status;
    if (newThreshold) vThreshold = parseFloat(newThreshold);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bridge v9.5 Online`));
