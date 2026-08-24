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
