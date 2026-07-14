#!/usr/bin/env python3
"""
ESP32 Serial Bridge — Standalone Python script

Reads your ESP32 over USB serial and forwards the JSON telemetry to the
Gyro Monitor API server (or serves it directly on its own HTTP port).

This is useful when:
  • The Electron serial bridge is not working
  • You want to verify the ESP32 is actually sending data
  • You want to run the bridge on a different machine from the dashboard

Usage:
    python esp32-bridge.py --port COM6 --baud 115200

Requirements:
    pip install pyserial requests

Architecture:
    ESP32 (USB) ←→ Python script (reads serial, parses JSON)
                    ↓
           POST http://127.0.0.1:5000/api/readings/ingest
           POST http://127.0.0.1:5000/api/serial/connect
                    ↓
           Gyro Monitor API server → WebSocket → Dashboard
"""

import argparse
import json
import serial
import requests
import sys
import time
from datetime import datetime

# ─── Configuration ─────────────────────────────────────────────────────────────────────────

DEFAULT_API_BASE = "http://127.0.0.1:5000"


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] {msg}")


# ─── Normalise ESP32 JSON (same logic as serial-manager.js) ──────────────────────────
def normalise(raw: dict) -> dict:
    return {
        "rpm": float(raw.get("rpm", 0)),
        "tiltX": float(raw.get("tiltX", raw.get("tilt_x", 0))),
        "tiltY": float(raw.get("tiltY", raw.get("tilt_y", 0))),
        "rotationZ": float(raw.get("rotationZ", raw.get("rotation_z", 0))),
        "temperature": float(raw.get("temperature", raw.get("temp", 25))),
        "motorPwm": float(raw.get("motorPwm", raw.get("motor_pwm", raw.get("pwm", 0)))),
        "vibration": float(raw.get("vibration", raw.get("vibr", 0))),
    }


# ─── HTTP helpers ──────────────────────────────────────────────────────────────────────────
def post_json(api_base: str, path: str, body: dict) -> dict | None:
    url = f"{api_base}{path}"
    try:
        r = requests.post(url, json=body, timeout=3)
        if r.ok:
            return r.json()
        log(f"POST {url} → HTTP {r.status_code}: {r.text[:200]}")
        return None
    except Exception as e:
        log(f"POST {url} → FAILED: {e}")
        return None


# ─── Main bridge ────────────────────────────────────────────────────────────────────────────────
def run_bridge(port_path: str, baud_rate: int, api_base: str):
    log(f"Opening {port_path} @ {baud_rate} baud...")
    try:
        ser = serial.Serial(port_path, baud_rate, timeout=1)
    except serial.SerialException as e:
        log(f"Could not open serial port: {e}")
        log("Common fixes:")
        log("  • Install the USB driver (CP210x or CH340)")
        log("  • Check the port name with Device Manager or ls /dev/tty*")
        log("  • Close any other program using the port (Arduino IDE, PuTTY)")
        sys.exit(1)

    log(f"Port opened: {ser.name}")

    # Tell the API server that hardware is connected
    result = post_json(api_base, "/api/serial/connect", {"port": port_path})
    if result:
        log(f"API server acknowledged connection: {result}")
    else:
        log(f"WARNING: could not reach API server at {api_base}")
        log("  → Is the Gyro Monitor app running?")
        log("  → Did the API server start? Check the app console.")

    log("Waiting for ESP32 data (press Ctrl+C to stop)...")
    log("")

    line_count = 0
    error_count = 0
    last_status = time.time()

    try:
        while True:
            raw = ser.readline()
            if not raw:
                continue

            try:
                line = raw.decode("utf-8", errors="replace").strip()
            except Exception:
                continue

            if not line:
                continue

            # Status / boot messages from firmware
            if line.startswith("{") and '"status"' in line and '"rpm"' not in line:
                log(f"[ESP32] {line}")
                continue

            # Handshake lines (if your firmware sends them)
            if line.startswith("DEVICE_INFO:") or line.startswith("HEALTH:"):
                log(f"[ESP32] {line}")
                continue

            # IR remote / PID command lines from firmware.
            # Firmware prints e.g. "CMD:IR_CH", "CMD:IR_EMERGENCY_STOP", or
            # "PID_LIVE:Kp:0.123" when an IR button is pressed. Forward them
            # to the API so the dashboard IR feed updates in real time
            # (mirrors desktop/src/serial-manager.js and web-serial-bridge.ts).
            if line.startswith("CMD:") or line.startswith("PID_"):
                log(f"[ESP32] IR/CMD line: {line}")
                post_json(api_base, "/api/ir/command", {"line": line})
                continue

            # Parse JSON telemetry
            try:
                raw_dict = json.loads(line)
            except json.JSONDecodeError:
                if line_count < 10:
                    log(f"[skip] Not JSON: {line[:80]}")
                error_count += 1
                continue

            # Normalise and post
            reading = normalise(raw_dict)
            result = post_json(api_base, "/api/readings/ingest", reading)

            line_count += 1
            if result:
                if line_count <= 5:
                    log(f"[{line_count}] → {reading}")
                elif line_count == 6:
                    log("... (suppressing further per-line logs, Ctrl+C to stop)")
            else:
                error_count += 1

            # Periodic status
            now = time.time()
            if now - last_status >= 5:
                log(f"Status: {line_count} lines sent, {error_count} errors")
                last_status = now

    except KeyboardInterrupt:
        log("")
        log("Stopped by user.")
    finally:
        ser.close()
        log(f"Port closed. Total lines: {line_count}, errors: {error_count}")
        log("Disconnecting from API server...")
        post_json(api_base, "/api/serial/disconnect", {})


# ─── Entry point ────────────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Read ESP32 serial data and forward to the Gyro Monitor API server."
    )
    parser.add_argument(
        "--port",
        "-p",
        required=True,
        help="Serial port, e.g. COM6 (Windows) or /dev/ttyUSB0 (Linux)",
    )
    parser.add_argument(
        "--baud", "-b", type=int, default=115200, help="Baud rate (default: 115200)"
    )
    parser.add_argument(
        "--api",
        "-a",
        default=DEFAULT_API_BASE,
        help=f"Gyro Monitor API server base URL (default: {DEFAULT_API_BASE})",
    )
    args = parser.parse_args()

    log("=" * 60)
    log("ESP32 Serial Bridge — Python debug tool")
    log("=" * 60)
    log(f"Port:     {args.port}")
    log(f"Baud:     {args.baud}")
    log(f"API base: {args.api}")
    log("=" * 60)

    run_bridge(args.port, args.baud, args.api)


if __name__ == "__main__":
    main()
