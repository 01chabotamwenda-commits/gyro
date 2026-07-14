---
name: Firmware organization plan
description: User's intent to organize firmware into a proper ESP32 project structure
---

## Goal
Move the v3.0 firmware from `attached_assets/` (pasted .txt/.ino files) into a proper `firmware/` directory as a real ESP32 Arduino project.

**Why:** The firmware currently lives as raw text dumps, not as an uploadable/buildable project. A proper structure enables PlatformIO or Arduino IDE workflows and makes the firmware a first-class part of the repo.

## Key constraints
- This is an **ESP32** project (not Arduino Uno/Mega). Target board: ESP32 Dev Module (or similar).
- Use **PlatformIO** structure (`platformio.ini` + `src/`) rather than bare Arduino IDE layout — better for CI, dependency management, and ESP32 support.
- The two v3.0 source files in `attached_assets/` are the source of truth:
  - `Pasted--gyro-controller-ino-...-178_1783276075154.txt` — testing variant (HAS_MPU6050=0, HAS_ESC=0, HAS_RPM_SENSOR=1)
  - `Pasted--gyro-controller-ino-...-178_1783276098886.txt` — full hardware variant (HAS_MPU6050=1, HAS_ESC=1)
- The older `gyrowifi_1782984367143.ino` is v1 and superseded.

## How to apply
When user says to proceed: create `firmware/` with `platformio.ini` targeting ESP32, `src/gyro_controller.ino` (or `.cpp`), and any needed `lib/` or `include/` directories. Consolidate the two HAS_* variants into one file with a documented build flags section in `platformio.ini` (two build environments: `[env:testing]` and `[env:full]`).

## Status
Firmware is already in a proper PlatformIO project structure at `hardware/firmware/gyro_controller/` (`gyro_controller.ino` + `platformio.ini`). This was missed in the original clone — now copied. No scaffolding needed; structure already exists in the repo.

Also copied from the repo (were missing):
- `desktop/` — Electron desktop app (serial-manager, main, preload)
- `docs/` — ESP32-CONNECTION.md + older `gyro_monitor.ino` reference firmware
