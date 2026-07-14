---
name: Thesis spec corrections
description: Hardware spec changes applied to convert_to_pdf.py and draft/thesis.md; canonical values for all recalculated quantities.
---

## Corrected specs (applied July 2026)

| Parameter | Old | New |
|---|---|---|
| Motor | 2200 KV BLDC | 950 KV x2212 BLDC |
| Flywheel mass | 0.8606 kg | 0.5 kg |
| Target RPM | 8000 | 3000 |
| Supply voltage | 12 V (unclear) | 12 V raw rail |
| Effective motor voltage | 4.84 V | 4.36 V (36.3% PWM duty) |
| k_e | 0.00434 V.s/rad | 0.01005 V.s/rad |
| I_disk | 0.005006 kg.m² | 0.002910 kg.m² |
| I_total (disk+bolts) | 0.006667 kg.m² | 0.004571 kg.m² |
| ω_s | 837.76 rad/s | 314.16 rad/s |
| Angular momentum L | 4.194 kg.m²/s | 0.9142 kg.m²/s |
| Gyroscopic torque T_g | 2.097 N.m | 0.4571 N.m |
| Gravity torque (5°) | 0.0368 N.m | 0.0214 N.m |
| Stability factor | 57 | 21 |
| Min stable speed | 1060 RPM | 655 RPM |
| Kinetic energy | 1756.7 J (0.488 Wh) | 143.6 J (0.040 Wh) |
| Electrical power (max) | 48.4 W | 43.6 W |
| Electrical efficiency (SS) | 86.6% | 91.6% |
| Bearing radial load | 4.22 N | 2.45 N |
| Bearing L10 life | 2371 hours | 85,900 hours |
| Hoop stress (overspeed) | 41.3 MPa @ 10000 RPM | 5.81 MPa @ 3750 RPM |
| Safety factor (hoop) | 9.7 | 68.8 |

## 24-hour requirement removal
- Title subtitle changed to "Improved Design for Automated, Sustained Operation"
- Abstract, aim, objectives, conclusions, future work all updated
- Test 5 changed from "24-hour endurance run" → "Extended Stability Run (2 Hours)"
- Checkpoint table now 15-min intervals, 9 rows, all at ~2985 RPM
- Figures 9.0–9.3 captions updated to "extended stability run"

## How to regenerate PDF
```
cd /home/runner/workspace
uv run python thesis/convert_to_pdf.py
```
Output: `thesis/thesis.pdf` (~141 KB, 88 pages)

## Files changed
- `thesis/convert_to_pdf.py` — canonical source; all edits here
- `thesis/draft/thesis.md` — secondary; broad str.replace pass applied

## Known intentional remaining reference
- Line 1274: `"vs. 0.00434 for a 2200 KV motor"` — this is the rejected-alternative comparison in the KV selection table. Keep it.

## Images still needed from user
See conversation — 29 figures total grouped as: SOLIDWORKS (8), Simulink (5), Proteus (2), Dashboard screenshots (2), Diagrams (3), Physical photos (7), Data charts (4). Save as JPEG/PNG named by figure number.
