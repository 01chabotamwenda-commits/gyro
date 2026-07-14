# Connecting Your ESP32 to the Gyro Monitor Desktop App

**Copperbelt University — Motorized Gyroscope Project**

---

## Overview

The desktop app can receive real sensor data from your ESP32 over a USB cable (no Wi-Fi, no internet). When the ESP32 is connected, the simulator is automatically suspended and the dashboard shows live readings at 4 Hz.

```
[ESP32 + MPU-6050]
      │  USB cable (COM port / ttyUSB)
      ▼
[Gyro Monitor Desktop App]
      │  Electron serial bridge  (serialport npm package)
      ▼
[Embedded Express API server]  ← POST /api/readings/ingest
      │  WebSocket  ws://127.0.0.1:5000/api/ws
      ▼
[React dashboard]  ← live charts update
```

---

## 1 · Hardware You Need

| Component | Notes |
|---|---|
| ESP32 DevKit v1 (or any variant) | 30-pin or 38-pin both work |
| MPU-6050 IMU breakout | I²C, 3.3 V logic |
| Hall-effect sensor (A3144 / OH090U) | For flywheel RPM measurement |
| Motor driver (L298N / BTS7960 / DRV8833) | Accepts PWM input |
| USB-A to Micro-USB (or USB-C) cable | For programming and serial data |
| 10 kΩ resistor | External pull-up for Hall sensor |
| Jumper wires, breadboard | — |

---

## 2 · Wiring Diagram

```
ESP32              MPU-6050
─────              ────────
3V3  ──────────→  VCC
GND  ──────────→  GND
GPIO21 ─────────→  SDA
GPIO22 ─────────→  SCL
               AD0 → GND  (fixes I²C addr to 0x68)

ESP32              Hall sensor (A3144)
─────              ──────────────────
3V3  ──┬──────→  VCC
       │10kΩ
GPIO34 ─┴──────→  OUT  (signal pin)
GND  ──────────→  GND

ESP32              Motor driver
─────              ────────────
GPIO25 ─────────→  PWM IN (EN / RPWM / ENA — depends on your driver)
GND  ──────────→  GND

(Add direction pins as needed for your specific driver)
```

> **GPIO 34** is input-only on the ESP32. It has **no internal pull-up**, which is why a 10 kΩ resistor from the signal pin to 3V3 is required.

---

## 3 · Firmware Setup

### 3.1 Install Arduino IDE

Download from https://www.arduino.cc/en/software (free, works offline).

### 3.2 Add ESP32 board support

1. Open **File → Preferences**
2. In "Additional boards manager URLs" add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Open **Tools → Board → Boards Manager**, search `esp32`, install the Espressif ESP32 package.

### 3.3 Open the firmware

The firmware lives at:

```
docs/ESP32-FIRMWARE/gyro_monitor/gyro_monitor.ino
```

Open it in Arduino IDE.

### 3.4 Configure for your hardware

At the top of `gyro_monitor.ino`, adjust these constants:

```cpp
#define HALL_PIN       34    // Change if you wired the Hall sensor to a different pin
#define MOTOR_PWM_PIN  25    // Change to match your motor driver PWM input pin
#define HALL_MAGNETS   1     // Number of magnets on your flywheel disc
#define SEND_HZ        4     // Telemetry rate — 4 Hz is recommended
#define TILT_X_OFFSET  0.0f  // Degrees to subtract if the sensor is not perfectly flat
#define TILT_Y_OFFSET  0.0f
```

### 3.5 Upload

1. Select board: **Tools → Board → ESP32 Arduino → ESP32 Dev Module**
2. Select port: **Tools → Port → COM? / /dev/ttyUSB?** (your ESP32 port)
3. Click **Upload** (▶)
4. Open the Serial Monitor (**Tools → Serial Monitor**), set baud rate to **115200**
5. You should see JSON lines like:
   ```json
   {"rpm":0.0,"tiltX":2.34,"tiltY":-1.12,"rotationZ":0.05,"temp":26.1,"pwm":0.0,"vibration":0.01}
   ```

---

## 4 · Connecting to the Desktop App

### 4.1 Open the Settings page

Click the **Settings** link (⚙ icon) in the top-right of the dashboard.

### 4.2 Find the "Serial Device (ESP32)" card

This card only appears in the Electron desktop app. In the browser-based Replit preview it shows a placeholder.

### 4.3 Scan for ports

Click **Scan** (↻ button). The dropdown will list all available serial ports. Look for:
- **Windows:** `COM3`, `COM4`, … (the number varies per machine)
- **Linux:** `/dev/ttyUSB0`, `/dev/ttyACM0`
- **macOS:** `/dev/cu.usbserial-…`, `/dev/cu.SLAB_USBtoUART`

> If your ESP32 doesn't appear, install the CP210x or CH340 USB driver (see section 5).

### 4.4 Select baud rate

The default is **115 200** — this must match `Serial.begin(115200)` in the firmware. If you changed it in the sketch, change it here too.

### 4.5 Click "Connect to ESP32"

- The connection indicator turns green: **Hardware mode active**
- The terminal panel shows: `[HARDWARE] ESP32 connected on COM3 — live sensor data active, simulator suspended`
- All charts now update with real sensor data
- The simulator is paused (no synthetic data is generated)

### 4.6 Disconnecting

Click **Disconnect** in the Serial Device card, or simply unplug the USB cable. The app will automatically detect the port closure and resume the simulator.

---

## 5 · USB Drivers

Most ESP32 boards use one of two USB-to-serial chips. Install the driver for yours:

| Chip | Board label | Driver |
|---|---|---|
| CP2102 / CP2104 | "Silicon Labs" | https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers |
| CH340 / CH341 | "Wemos", many clones | https://www.wch-ic.com/downloads/CH341SER_ZIP.html |
| FTDI FT232R | Sparkfun, Adafruit | https://ftdichip.com/drivers/vcp-drivers/ |

After installing, unplug and replug the ESP32. It should appear in Device Manager (Windows) or `ls /dev/tty*` (Linux/macOS).

**Linux extra step:** Add your user to the `dialout` group so you can access serial ports without `sudo`:
```bash
sudo usermod -aG dialout $USER
# Log out and back in for the group to take effect
```

---

## 6 · JSON Telemetry Protocol

The firmware sends one JSON object per newline at 4 Hz. The desktop app parses these and posts them to `POST /api/readings/ingest`.

### Fields emitted by the firmware

| JSON key | Type | Units | Description |
|---|---|---|---|
| `rpm` | float | rev/min | Flywheel speed from Hall sensor |
| `tiltX` | float | degrees | Tilt around X axis (from accelerometer) |
| `tiltY` | float | degrees | Tilt around Y axis (from accelerometer) |
| `rotationZ` | float | deg/s | Gyro Z-axis rotation rate |
| `temp` | float | °C | MPU-6050 internal temperature |
| `pwm` | float | % (0–100) | Current motor PWM duty cycle |
| `vibration` | float | mm/s (est.) | Estimated vibration from gyro variance |

### Field aliases accepted by the ingest endpoint

The serial bridge accepts both camelCase and snake_case variants so you can adapt the firmware freely:

| Accepted key | Maps to |
|---|---|
| `tiltX` **or** `tilt_x` | tiltX |
| `tiltY` **or** `tilt_y` | tiltY |
| `rotationZ` **or** `rotation_z` | rotationZ |
| `temp` **or** `temperature` | temperature |
| `pwm` **or** `motorPwm` **or** `motor_pwm` | motorPwm |
| `vibration` **or** `vibr` | vibration |

### Sending commands to the ESP32

The desktop app can send JSON commands back to the ESP32 via the same serial port:

```json
// Set motor PWM (0–255 integer)
{"cmd":"motor","pwm":128}

// Stop motor
{"cmd":"stop"}
```

The firmware responds with an acknowledgement:
```json
{"ack":"motor","pwm":128}
{"ack":"stop"}
```

---

## 7 · Calibration Guide

### Tilt offset calibration

1. Place the gyroscope on a level surface with the ESP32 mounted as it will be in operation.
2. Connect to the desktop app and watch the **Tilt X** and **Tilt Y** gauges.
3. Note the offset (e.g. Tilt X reads 3.2° at rest instead of 0°).
4. Set `#define TILT_X_OFFSET 3.2f` in the firmware and re-upload.

### RPM calibration

1. Use a known reference (e.g. a strobe light or another tachometer) to verify the RPM reading.
2. If your flywheel has **N magnets**, set `#define HALL_MAGNETS N` — this divides the pulse rate correctly.
3. Example: 2 magnets, sensor reads 3000 RPM → actual RPM = 1500. Set `HALL_MAGNETS 2`.

### Vibration scaling

The vibration estimate (`vibration` field) is derived from the high-frequency variation of the gyro Z-axis and scaled to approximate mm/s RMS. The formula is:
```
vibration_mm_s ≈ gyro_z_delta_smoothed × 0.04
```
This is a rough approximation. For accurate vibration measurement, an ADXL345 or similar accelerometer mounted on the motor housing is preferred. Adjust the scaling factor in the firmware to match a calibrated reference.

---

## 8 · Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Port not listed after Scan | No USB driver, or ESP32 not connected | Install CP210x / CH340 driver; replug |
| "Connection failed" error | Wrong baud rate, or port in use by Arduino IDE | Match baud rate; close Arduino Serial Monitor first |
| `rpm` always reads 0 | Hall sensor not triggering, or no magnet | Check wiring; use a multimeter to verify OUT pin goes low when magnet passes |
| Tilt values wrong at rest | Sensor not level, or needs offset calibration | Apply `TILT_X_OFFSET` / `TILT_Y_OFFSET` in firmware |
| Dashboard shows no data after connect | API server not running | Check Settings → Desktop App Server (green = running) |
| Linux: "Permission denied" on /dev/ttyUSB0 | User not in `dialout` group | Run `sudo usermod -aG dialout $USER` then log out/in |
| Port disconnects randomly | USB cable issue, or 5 V supply sagging | Use a quality USB cable; add a 100 µF capacitor on the ESP32 5 V rail |

---

## 9 · How It Was Implemented

This section explains the technical implementation for developers who want to understand or extend the system.

### Architecture

```
desktop/src/
├── main.js           — Electron main process
│                       • Spawns API server child process (Node.js)
│                       • Manages serial port via serial-manager.js
│                       • IPC handlers: serial:list, serial:connect, serial:disconnect,
│                         serial:status, serial:send
├── preload.js        — Electron preload (context bridge)
│                       • Exposes window.serialBridge to React
│                         (listPorts, connect, disconnect, status, send, onClosed, onError)
└── serial-manager.js — Serial port manager (serialport v12)
                        • SerialPort.list() → available ports
                        • ReadlineParser parses JSON lines
                        • Each line → POST /api/readings/ingest

artifacts/api-server/src/
├── lib/
│   ├── mem-store.ts      — In-memory readings/sessions/alerts (10k circular buffer)
│   ├── hardware-mode.ts  — Tracks hardware connection; broadcastToClients()
│   └── simulator.ts      — Added suspendSimulator() / resumeSimulator()
│                           Skips ticks when _suspended || isHardwareConnected()
│                           Falls back to mem-store when db is null
└── routes/
    └── ingest.ts         — POST /api/readings/ingest
                            POST /api/serial/connect  → suspendSimulator()
                            POST /api/serial/disconnect → resumeSimulator()
                            GET  /api/serial/status

lib/db/src/index.ts       — DATABASE_URL now optional; db = null when absent
                            (all routes fall back to mem-store automatically)
```

### Data flow when ESP32 is connected

```
1. User clicks "Connect to ESP32" in Settings
2. serialBridge.connect("COM3", 115200) → IPC → main.js
3. main.js opens SerialPort → serial-manager.js
4. Port opens → POST /api/serial/connect → simulator suspended
5. ESP32 sends JSON line every 250 ms
6. ReadlineParser fires "data" event
7. serial-manager.js normalises field names
8. POST /api/readings/ingest with sensor values
9. ingest.ts saves to DB (or mem-store if offline) + calls broadcastToClients()
10. WebSocket message → React dashboard updates all charts in real time
```

### Offline mode (no DATABASE_URL)

When the desktop app starts, it intentionally does NOT pass `DATABASE_URL` to the API server child process. This means:
- `lib/db/src/index.ts` creates a null `db` export instead of throwing
- Every route checks `if (!db)` or wraps DB calls in try/catch
- Falls back to `mem-store.ts` (in-process memory, survives until app is closed)
- All features work: sessions, readings, alerts, analytics, CSV export

Data is **not persisted between app restarts** in this mode. If you want persistence, set `DATABASE_URL` to a local PostgreSQL or SQLite connection string in your OS environment before launching the app.
