#!/usr/bin/env python3
"""
Test serial write to ESP32 - send calibration command and observe response
"""
import serial
import time
import sys

port = "COM6"
baud = 115200

try:
    print(f"[*] Opening {port} at {baud} baud...")
    ser = serial.Serial(port, baud, timeout=1)
    time.sleep(2)  # Wait for ESP32 to settle
    
    print("[*] Connected. Reading startup messages...\n")
    time.sleep(0.5)
    
    # Read any startup messages
    while ser.in_waiting:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if line:
            print(f"[RX] {line}")
    
    print("\n[*] Sending calibration command: 'z'")
    ser.write(b'z\n')
    time.sleep(0.1)
    
    print("[*] Waiting for response (5 seconds)...\n")
    start = time.time()
    response_count = 0
    
    while time.time() - start < 5:
        if ser.in_waiting:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if line:
                response_count += 1
                if "REFERENCE" in line or "REF_" in line:
                    print(f"[CALIB] {line}")
                elif line.startswith("{"):
                    print(f"[DATA] {line}")
                else:
                    print(f"[RX] {line}")
    
    if response_count == 0:
        print("[!] No response received after sending 'z'")
    else:
        print(f"\n[+] Received {response_count} lines after calibration command")
    
    print("\n[*] Sending another 'z' to test again...")
    ser.write(b'z\n')
    time.sleep(0.1)
    
    print("[*] Waiting for second response...\n")
    start = time.time()
    response_count = 0
    
    while time.time() - start < 3:
        if ser.in_waiting:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if line:
                response_count += 1
                if "REFERENCE" in line or "REF_" in line or "errorX" in line or "errorY" in line:
                    print(f"[CALIB] {line}")
                elif line.startswith("{"):
                    # Print just the first one to see errorX/Y values
                    if response_count == 1:
                        print(f"[DATA] {line}")
    
    print(f"\n[+] Test complete. Received {response_count} lines")
    ser.close()
    
except Exception as e:
    print(f"[!] Error: {e}")
    sys.exit(1)
