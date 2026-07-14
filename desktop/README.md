# Gyro Monitor — Desktop App

Native Windows desktop app for the Copperbelt University Gyroscope Monitoring System.  
Runs **fully offline** — no internet or Replit needed.

---

## How to install on your PC (end-user)

1. Go to the **Actions** tab of this GitHub repository.
2. Open the latest **"Build Desktop App (Electron)"** workflow run.
3. Scroll to the bottom and download **GyroMonitor-Windows-Installer**.
4. Unzip the downloaded file — you will find `Gyro Monitor Setup X.X.X.exe` inside.
5. Double-click the installer and follow the prompts (it will ask where to install and create a desktop shortcut).
6. Launch **Gyro Monitor** from the desktop or Start menu.

> **Windows SmartScreen warning?** Click "More info" then "Run anyway". This is expected for apps that are not code-signed.

---

## Connecting your ESP32

1. Plug the ESP32 into your PC via USB.
2. Install the USB-to-serial driver if Windows does not auto-detect the device:
   - **CP210x** (most common): https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
   - **CH340**: https://www.wch-ic.com/downloads/CH341SER_EXE.html
3. Open the app and click **Settings** (gear icon) in the sidebar.
4. Scroll to the **Serial Device (ESP32)** section.
5. Click **Scan ports** — your ESP32 will appear (e.g. `COM3`).
6. Select the port, set baud rate to **115200**, and click **Connect**.
7. The dashboard switches to live hardware data. The simulator pauses automatically.

See `docs/ESP32-CONNECTION.md` for full wiring, firmware, and troubleshooting details.

---

## Building the installer yourself

### Prerequisites
- Node.js 20 or newer
- pnpm (`npm install -g pnpm`)

### Steps (Windows Command Prompt)

```bat
REM 1. Install all workspace dependencies
pnpm install --no-frozen-lockfile

REM 2. Build the API server bundle
pnpm --filter @workspace/api-server run build

REM 3. Build the React frontend
REM    BASE_PATH must be "./" (relative) so assets load correctly over file://
set BASE_PATH=./
set PORT=21211
set NODE_ENV=production
pnpm --filter @workspace/gyro-dashboard run build

REM 4. Install Electron and electron-builder
cd desktop
npm install

REM 5. Build the Windows installer
npm run dist:win
```

The `.exe` installer appears in `desktop\dist\`.

---

## Running in development (no installer)

```bat
REM Build both bundles first (same steps 1-3 above), then:
cd desktop
npm install
npm start
```

The Electron window opens and loads the built frontend from `artifacts/gyro-dashboard/dist/public/`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App opens but shows a blank / white screen | The frontend was built with the wrong base path. Rebuild using `BASE_PATH=./` as shown above. |
| "Gyro Monitor — Build Required" screen | Run the build steps above before launching. |
| ESP32 not appearing in port scan | Install the CP210x or CH340 driver. Try a different USB cable. |
| Cannot connect to COM port | Close any other program that may be using it (Arduino IDE, PuTTY, serial monitor). |
| Readings show 0 or no data | Confirm the firmware is running on the ESP32 and the baud rate matches `Serial.begin()`. |
| Windows SmartScreen blocks the installer | Click "More info" then "Run anyway". |
