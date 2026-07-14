# ESP32 Gyro Controller Firmware

Source lives at `hardware/firmware/gyro_controller/gyro_controller.ino`.

## Requirements

| Tool | Version |
|---|---|
| Arduino IDE | 2.x or 1.8.x |
| ESP32 Arduino core | 2.x (`espressif/arduino-esp32`) |
| ESP32Servo library | ≥ 0.13 |
| arduinoFFT | 2.x (search "arduinoFFT" by Enrique Condes in Library Manager) |
| IRremote | 4.x (search "IRremote" by shirriff / z3t0 in Library Manager) |

> **Note:** Use arduinoFFT **v2.x**, not v1.x — the API is different. The code below has been updated for v2.x.

Board: **DOIT ESP32 DevKit v1** (or any 38-pin ESP32).

## Flashing

1. Open `gyro_controller.ino` in Arduino IDE.
2. Select **Tools → Board → ESP32 Arduino → ESP32 Dev Module**.
3. Set **Upload Speed: 921600**, **Flash Size: 4MB**, **Partition Scheme: Default**.
4. Select the correct COM / `/dev/tty` port.
5. Click **Upload**.

## Wiring

| Signal | ESP32 GPIO |
|---|---|
| MPU-6050 SDA | 21 |
| MPU-6050 SCL | 22 |
| ESC PWM signal | 4 |
| Hardware reset button | 23 (INPUT_PULLUP, active-LOW) |
| VS1838B IR receiver OUT | 17 (signal) |
| VS1838B IR receiver VCC | 3.3 V |
| VS1838B IR receiver GND | GND |

Power the ESC from the main battery, **not** from the ESP32 3.3 V rail.

## Command Protocol (app → ESP32 via serial)

The Electron serial bridge polls `GET /api/serial/pending-write` and writes each
queued string as a newline-terminated line to the ESP32 serial port.

| Command | Effect |
|---|---|
| `CMD:MOTOR_START` | Ramp motor up (only runs if session active on server side) |
| `CMD:MOTOR_STOP` | Gracefully stop motor |
| `CMD:EMERGENCY_STOP` | **Dev mode:** degraded to graceful `stopMotor()` — hard estop disabled from app to prevent unexpected stops during testing |
| `CMD:SPEED_UP` | Throttle + 2 |
| `CMD:SPEED_DOWN` | Throttle − 2 |
| `CMD:RESET_REF` | Reset IMU reference angles |

## Status replies (ESP32 → app via serial)

The Electron bridge forwards all serial output back as `reading` / `alert`
WebSocket messages.

| Line | Meaning |
|---|---|
| `STATUS:MOTOR=ON` | Motor started successfully |
| `STATUS:MOTOR=OFF` | Motor stopped |
| `STATUS:MOTOR=ESTOP` | Emergency stop executed |
| `STATUS:REF_RESET=OK` | IMU reference angles reset |
| `STATUS:CMD_UNKNOWN=…` | Unrecognised CMD: value |

## Keyboard overrides (serial terminal)

These work at any time and override any app-side guard:

| Key | Action |
|---|---|
| `S` | Start motor (bypasses session check) |
| `X` | Stop motor (graceful) |
| `E` | **Emergency stop** — only serial-terminal path; instant ESC arm, no ramp-down |
| `H` | Increase throttle |
| `L` | Decrease throttle |
| `Z` | Reset IMU reference angles |
| `W` | Force WiFi reconnect |

Type the character and press Enter in any serial terminal at 115200 baud.

> **Emergency stop policy (development mode):** `CMD:EMERGENCY_STOP` from the dashboard app is intentionally disabled. Emergency stop can only be triggered by:
> 1. Pressing **`E`** in the serial terminal
> 2. Pressing **Escape** on the local HTTP control page (`http://<esp32-ip>/`)

## Telemetry (250 ms interval)

Each interval the firmware sends a JSON line over USB serial and WiFi TCP:

```json
{"rpm":0,"angleX":1.23,"angleY":-0.45,"angleZ":88.91,"tiltX":0.05,"tiltY":-0.12,"tiltZ":0.00,"rotationZ":-2.28,"avgTiltMag":0.13,"temp":0.0,"pwm":0.00,"throttle":1000,"vibration":0.0032,"vibrationFreq":14.28,"mpuFault":false,"mode":"manual","pidOutput":0.0,"pidTilt":0.00,"irCommand":"none"}
```

| Field | Description |
|---|---|
| `angleX` | **Absolute pitch angle** (degrees) from the accelerometer, smoothed with a simple moving average — 0° when flat, changes when tilted along X axis |
| `angleY` | **Absolute roll angle** (degrees) from the accelerometer, smoothed with a simple moving average — 0° when flat, changes when tilted along Y axis |
| `angleZ` | **Absolute Z-axis angle** (degrees) — ~90° when flat (gravity aligned with Z) |
| `tiltX` | Pitch **error** relative to the saved reference position (Reset Ref). 0 when at reference. |
| `tiltY` | Roll **error** relative to the saved reference position. 0 when at reference. |
| `tiltZ` | Z-axis **error** relative to the saved reference position. |
| `rotationZ` | Raw gyro Z angular rate (°/s) — non-zero even when stationary due to sensor drift |
| `avgTiltMag` | Combined tilt magnitude √(tiltX²+tiltY²) in degrees |
| `rpm` | Estimated RPM from IR pulse sensor (0 when motor off or sensor not triggered) |
| `vibration` | RMS dynamic acceleration (g), gravity component removed |
| `vibrationFreq` | Dominant vibration frequency (Hz) from 64-point FFT at 500 Hz |
| `pwm` | Motor throttle as percentage of full range |
| `throttle` | Raw ESC pulse width (µs) — 1000 = armed/off, 1800 = full throttle |
| `mpuFault` | `true` if IMU has had 5+ consecutive I²C failures |
| `mode` | `"auto"` = PID tilt-stabilisation active, `"manual"` = direct throttle control |
| `pidOutput` | PID's last commanded throttle offset above MIN_THROTTLE (µs, auto mode only) |
| `pidTilt` | Tilt magnitude fed into the PID on the last tick (degrees) |
| `irCommand` | Last IR remote button decoded (consumed after one broadcast, then `"none"`) |
| `temp` | Temperature °C — 0.0 when `HAS_TEMP_SENSOR=0` |

> **Why does tiltX/Y/Z read 0.0 when the board is flat?**
> `tiltX/Y/Z` are *error* values — the deviation from the saved reference position (set by pressing Z or the Reset Ref button). When the board is at its reference position these are correctly 0. Use `angleX/Y` to see absolute pitch and roll at any time.
