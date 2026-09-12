
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fetch = require('node-fetch');

const app = express();

app.use(express.json());
app.use(cors());

// ==========================================
// SERVE WEBSITE
// ==========================================

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// ==========================================
// CONFIGURATION
// ==========================================

// Replace these with your NEW credentials
const SUPABASE_URL = 'https://fjtvytuknssvkfrqcxqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHZ5dHVrbnNzdmtmcnFjeHFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEyODY5OSwiZXhwIjoyMDk5NzA0Njk5fQ.h6cbQwnVrV0etkhUQ20WusTejqIyVXtKwdJT5vEUkQ8';

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
// ==========================================
// CONTROL STATE HELPERS
// ==========================================

async function getControlState() {

    const { data, error } = await supabase
        .from('control_state')
        .select('*')
        .eq('id', 1)
        .single();

    if (error) {
        throw error;
    }

    return data;
}


async function updateControlState(updates) {

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('control_state')
        .update(updates)
        .eq('id', 1)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

// Telegram
const TELEGRAM_TOKEN = '8895229242:AAE0fKGO4d_pZsxGGnViaEkvnic36BqhmzA';
const CHAT_ID = '5670162975';


// ESP32 API Key
const API_KEY = "SECRET_KEY_9988";


// ==========================================
// SYSTEM VARIABLES
// ==========================================

let states = {
    led1: "OFF",
    led2: "OFF",
    led3: "OFF"
};

let systemMode = "MANUAL";

// Voltage protection threshold
let vLimit = 220;


// ==========================================
// TELEGRAM COOLDOWN
// ==========================================

let lastAlertTime = 0;

// 60 seconds
const alertCooldown = 60000;


// ==========================================
// TELEGRAM NOTIFICATION
// ==========================================

async function sendTelegram(msg) {

    const now = Date.now();

    // Prevent notification spam
    if (now - lastAlertTime < alertCooldown) {
        return;
    }

    const url =
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}` +
        `/sendMessage?chat_id=${CHAT_ID}` +
        `&text=${encodeURIComponent(msg)}`;

    try {

        const response = await fetch(url);

        if (response.ok) {

            lastAlertTime = now;

            console.log("✈️ Telegram Notification Sent");

        } else {

            console.log(
                "❌ Telegram HTTP Error:",
                response.status
            );
        }

    } catch (error) {

        console.log(
            "❌ Telegram Error:",
            error.message
        );
    }
}


// ==========================================
// 1. LOGIN TUNNEL
// ==========================================

app.post('/api/auth/login', async (req, res) => {

    try {

        const { email, password } = req.body;

        const { data, error } =
            await supabase.auth.signInWithPassword({
                email,
                password
            });

        if (error) {

            console.error(
                "Login Error:",
                error
            );

            return res.status(401).json({
                error: error.message
            });
        }

        res.json(data);

    } catch (error) {

        console.error(
            "Login Server Error:",
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});


// ==========================================
// 2. GET LATEST TELEMETRY
// ==========================================

app.get('/api/get-telemetry', async (req, res) => {

    try {

        const { data, error } =
            await supabase
                .from('telemetry')
                .select('*')
                .order(
                    'created_at',
                    { ascending: false }
                )
                .limit(1);

        if (error) {

            console.error(
                "Supabase Read Error:",
                error
            );

            return res.status(500).json({
                error: error.message
            });
        }

        if (!data || data.length === 0) {

            return res.json({
                message: "No telemetry data"
            });
        }

        res.json(data[0]);

    } catch (error) {

        console.error(
            "Get Telemetry Error:",
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});


// ==========================================
// 3. ESP32 ENERGY DATA INPUT
// ==========================================

app.post('/api/energy-data', async (req, res) => {

    try {

        // ----------------------------------
        // CHECK ESP32 API KEY
        // ----------------------------------

        if (req.headers['x-api-key'] !== API_KEY) {

            console.log("❌ Invalid ESP32 API Key");

            return res.status(401).json({
                error: "Unauthorized"
            });
        }


        // ----------------------------------
        // RECEIVE ESP32 DATA
        // ----------------------------------

        const d = req.body;

        console.log("\n==============================");
        console.log("📡 ESP32 Data Received");
        console.log("==============================");

        console.log(d);


        // ----------------------------------
        // GET VOLTAGE
        // ----------------------------------

        const v = parseFloat(d.voltage);

        if (Number.isNaN(v)) {

            console.log("❌ Invalid Voltage");

            return res.status(400).json({
                error: "Invalid voltage value"
            });
        }


        console.log("Voltage:", v);
        console.log("Threshold:", vLimit);
        console.log("Mode:", systemMode);


        // ==================================
        // HIGH VOLTAGE PROTECTION
        // ==================================

        if (v > vLimit) {

            console.log("⚠️ HIGH VOLTAGE DETECTED");


            // ------------------------------
            // AUTO MODE
            // ------------------------------

            if (systemMode === "AUTO") {

                states.led1 = "OFF";
                states.led2 = "OFF";
                states.led3 = "OFF";

                console.log(
                    "🛑 AUTO SHUTDOWN EXECUTED"
                );


                sendTelegram(

                    `🚨 HIGH VOLTAGE ALERT!\n\n` +

                    `Voltage: ${v} V\n` +

                    `Threshold: ${vLimit} V\n\n` +

                    `Mode: AUTO\n` +

                    `Action: AUTO-SHUTDOWN EXECUTED.`

                );

            }


            // ------------------------------
            // MANUAL MODE
            // ------------------------------

            else {

                console.log(
                    "⚠️ MANUAL MODE - ALERT ONLY"
                );


                await sendTelegram(

                    `⚠️ HIGH VOLTAGE WARNING!\n\n` +

                    `Voltage: ${v} V\n` +

                    `Threshold: ${vLimit} V\n\n` +

                    `Mode: MANUAL\n` +

                    `Action: Manual check required.`

                );

            }

        }


        // ==================================
        // SAVE DATA TO SUPABASE
        // ==================================

        const { data, error } =
            await supabase
                .from('telemetry')
                .insert([
                    {
                        voltage:
                            d.voltage,

                        current:
                            d.current,

                        frequency:
                            d.frequency,

                        power_factor:
                            d.power_factor,

                        active_power:
                            d.active_power,

                        max_export_demand:
                            d.max_export_demand
                    }
                ])
                .select();


        // ----------------------------------
        // CHECK SUPABASE ERROR
        // ----------------------------------

        if (error) {

            console.error(
                "❌ Supabase Insert Error:"
            );

            console.error(error);

            return res.status(500).json({

                error:
                    "Supabase insert failed",

                details:
                    error.message
            });
        }


        console.log(
            "✅ Data saved to Supabase"
        );


        // ==================================
        // SEND RESPONSE TO ESP32
        // ==================================

        return res.status(200).json({

            success: true,

            message:
                "Energy data received",

            voltage: v,

            voltageLimit:
                vLimit,

            mode:
                systemMode,

            ...states

        });


    } catch (error) {

        // ==================================
        // SERVER ERROR
        // ==================================

        console.error(
            "❌ ENERGY DATA SERVER ERROR:"
        );

        console.error(error);


        return res.status(500).json({

            error:
                "Internal Server Error",

            details:
                error.message
        });
    }
});
// ==========================================
// GET CONTROL STATE
// ==========================================

app.get('/api/control-state', async (req, res) => {

    try {

        const state = await getControlState();

        res.json({
            success: true,
            mode: state.mode,
            led1: state.led1,
            led2: state.led2,
            led3: state.led3,
            voltageLimit: Number(state.voltage_limit)
        });

    } catch (error) {

        console.error(
            "Control State Error:",
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==========================================
// WEBSITE CONTROL
// ==========================================

app.post('/api/control-led', async (req, res) => {

    try {

        const {
            target,
            status,
            mode,
            newThreshold
        } = req.body;


        // Get current state from Supabase
        const current =
            await getControlState();


        const updates = {};


        // ==================================
        // CHANGE MODE
        // ==================================

        if (mode) {

            const newMode =
                mode.toUpperCase();

            if (
                newMode !== "MANUAL" &&
                newMode !== "AUTO"
            ) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "Invalid mode"
                    });
            }

            updates.mode =
                newMode;

            console.log(
                "Mode changed:",
                newMode
            );
        }


        // ==================================
        // MANUAL LOAD CONTROL
        // ==================================

        if (
            target &&
            status
        ) {

            const validTargets = [
                "led1",
                "led2",
                "led3"
            ];

            if (
                !validTargets.includes(target)
            ) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "Invalid target"
                    });
            }


            const newStatus =
                status.toUpperCase();

            if (
                newStatus !== "ON" &&
                newStatus !== "OFF"
            ) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "Invalid status"
                    });
            }


            updates[target] =
                newStatus;

            console.log(
                target,
                "->",
                newStatus
            );
        }


        // ==================================
        // CHANGE VOLTAGE LIMIT
        // ==================================

        if (
            newThreshold !== undefined &&
            newThreshold !== null &&
            newThreshold !== ""
        ) {

            const threshold =
                parseFloat(newThreshold);


            if (
                Number.isNaN(threshold)
            ) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "Invalid threshold"
                    });
            }


            updates.voltage_limit =
                threshold;

            console.log(
                "Voltage Limit:",
                threshold
            );
        }


        // ==================================
        // SAVE TO SUPABASE
        // ==================================

        let finalState =
            current;


        if (
            Object.keys(updates).length > 0
        ) {

            finalState =
                await updateControlState(
                    updates
                );
        }


        // ==================================
        // RESPONSE
        // ==================================

        res.json({
            success: true,
            mode: finalState.mode,
            led1: finalState.led1,
            led2: finalState.led2,
            led3: finalState.led3,
            voltageLimit:
                Number(
                    finalState.voltage_limit
                )
        });


    } catch (error) {

        console.error(
            "Control Error:",
            error
        );


        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ==========================================
// GET CURRENT CONTROL STATE FOR ESP32
// ==========================================

app.get('/api/control-state', (req, res) => {

    res.json({
        success: true,
        mode: systemMode,
        led1: states.led1,
        led2: states.led2,
        led3: states.led3,
        voltageLimit: vLimit
    });

});

// ==========================================
// START SERVER
// ==========================================

module.exports = app;


const PORT =
    process.env.PORT || 3000;


app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            `🚀 Energy Monitoring Server Running`
        );

        console.log(
            `📡 Port: ${PORT}`
        );

        console.log(
            `⚡ Voltage Threshold: ${vLimit} V`
        );

        console.log(
            `🔧 System Mode: ${systemMode}`
        );
    }
);
