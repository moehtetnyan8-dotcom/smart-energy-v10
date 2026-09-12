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

// ==========================================
// ESP32 ENERGY DATA INPUT
// ==========================================

app.post('/api/energy-data', async (req, res) => {

    try {

        // ==================================
        // CHECK ESP32 API KEY
        // ==================================

        if (
            req.headers['x-api-key'] !== API_KEY
        ) {

            return res
                .status(401)
                .json({
                    success: false,
                    error: "Unauthorized"
                });
        }


        const d = req.body;


        // ==================================
        // READ VALUES
        // ==================================

        const v =
            parseFloat(d.voltage);

        const current =
            parseFloat(d.current || 0);

        const frequency =
            parseFloat(d.frequency || 0);

        const powerFactor =
            parseFloat(d.power_factor || 0);

        const activePower =
            parseFloat(d.active_power || 0);

        const maxExportDemand =
            parseFloat(
                d.max_export_demand || 0
            );


        if (
            Number.isNaN(v)
        ) {

            return res
                .status(400)
                .json({
                    success: false,
                    error: "Invalid voltage"
                });
        }


        // ==================================
        // GET CONTROL STATE FROM SUPABASE
        // ==================================

        const control =
            await getControlState();


        const systemMode =
            control.mode;

        const vLimit =
            Number(
                control.voltage_limit
            );


        console.log(
            "Voltage:",
            v
        );

        console.log(
            "Mode:",
            systemMode
        );

        console.log(
            "Voltage Limit:",
            vLimit
        );


        // ==================================
        // HIGH VOLTAGE LOGIC
        // ==================================

        if (
            v > vLimit
        ) {

            console.log(
                "HIGH VOLTAGE DETECTED"
            );


            // AUTO MODE
            if (
                systemMode === "AUTO"
            ) {

                console.log(
                    "AUTO MODE -> ESP32 WILL TURN RELAY OFF"
                );


                sendTelegram(
                    `🚨 HIGH VOLTAGE ALERT!\n` +
                    `Voltage: ${v} V\n` +
                    `Threshold: ${vLimit} V\n` +
                    `Mode: AUTO\n` +
                    `Action: AUTO SHUTDOWN`
                );
            }


            // MANUAL MODE
            else {

                console.log(
                    "MANUAL MODE -> ALERT ONLY"
                );


                sendTelegram(
                    `⚠️ HIGH VOLTAGE WARNING!\n` +
                    `Voltage: ${v} V\n` +
                    `Threshold: ${vLimit} V\n` +
                    `Mode: MANUAL\n` +
                    `Action: Manual check required`
                );
            }
        }


        // ==================================
        // SAVE TELEMETRY TO SUPABASE
        // ==================================

        const {
            error:
            telemetryError

        } =
            await supabase

                .from(
                    'telemetry'
                )

                .insert([
                    {
                        voltage:
                            v,

                        current:
                            current,

                        frequency:
                            frequency,

                        power_factor:
                            powerFactor,

                        active_power:
                            activePower,

                        max_export_demand:
                            maxExportDemand
                    }
                ]);


        if (
            telemetryError
        ) {

            console.error(
                "Telemetry Error:",
                telemetryError
            );


            return res
                .status(500)
                .json({
                    success: false,
                    error:
                        telemetryError.message
                });
        }


        // ==================================
        // SEND CURRENT CONTROL STATE TO ESP32
        // ==================================

        res.json({

            success:
                true,

            mode:
                control.mode,

            led1:
                control.led1,

            led2:
                control.led2,

            led3:
                control.led3,

            voltageLimit:
                Number(
                    control.voltage_limit
                ),

            voltage:
                v
        });


    } catch (error) {

        console.error(
            "Energy Data Error:",
            error
        );


        res
            .status(500)
            .json({
                success:
                    false,

                error:
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
