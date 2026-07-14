#!/usr/bin/env python3
"""
Simple serial reader - just print raw data from ESP32 to terminal
"""
import serial
import sys

port = "COM6"
baud = 115200

try:
    ser = serial.Serial(port, baud, timeout=1)
    print(f"[*] Connected to {port} at {baud} baud")
    print("[*] Reading raw data... (Ctrl+C to stop)\n")
    
    while True:
        if ser.in_waiting:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if line:
                print(line)
except KeyboardInterrupt:
    print("\n[*] Stopped")
except Exception as e:
    print(f"[!] Error: {e}")
finally:
    if 'ser' in locals():
        ser.close()
