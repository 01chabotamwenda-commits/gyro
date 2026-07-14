# Thesis Working Guide (for any agent continuing this project)

Project: "Improvement of a Motorized Gyroscope" — CBU Bachelor's thesis, group of 4
(Janet Mwaba, Luyando Chiyasa, Chabota Mwenda, Isaac Phiri; supervisor Mr. Bennet Siyingwa).

Read this file before touching anything in `thesis/`.

## 1. Canonical source of truth

- **`convert_to_pdf.py`** is the actual thesis source. It is a Python script (uses `fpdf2`)
  that builds the entire document programmatically, chapter by chapter, and writes
  **`thesis.pdf`**. Editing content means editing the relevant `chapterN(pdf)` function in
  this script, then regenerating the PDF — never hand-edit `thesis.pdf`.
- To regenerate after an edit:
  ```
  python3 thesis/convert_to_pdf.py
  ```
  (Requires the `python-3.11` module and the `fpdf2` pip package — install both via the
  package-management tooling if missing, don't assume they're present.)
- **`draft/thesis.md`** is an older, much shorter outline of the thesis (short paragraphs,
  no calculations). It predates the detailed version in `convert_to_pdf.py` and is **not**
  kept in sync — treat it as a rough historical draft, not a source to edit or trust for
  current content. If in doubt about current content, `convert_to_pdf.py` wins.

## 2. Supervisor-mandated report template

The supervisor requires this exact chapter/section skeleton (see
`Thesis_project_report_template_1782758367198.pdf` in this folder for the original):

```
DECLARATION / ABSTRACT / ACKNOWLEDGEMENTS / DEDICATION / CONTENTS / List of Figures
CHAPTER 1
  1.0 Introduction, 1.1 Background, 1.2 Problem statement, 1.3 Aim,
  1.4 Motivation, 1.5 Objectives, 1.6 Scope and limitations
CHAPTER 2 — Literature review
CHAPTER 3
  3.0 Methodology, 3.1 Component design, 3.2 Component analysis
CHAPTER 4
  4.0 Manufacture and assembly methods, 4.1 Manufacturing methods, 4.2 Assembly methods
CHAPTER 5
  5.1 System testing, 5.2 Conducted tests, 5.3 Results
CHAPTER 6
  6.0 Conclusions, 6.1 Recommendations, 6.2 Proposed future works
7. REFERENCES
APPENDICES — Specifications of components used, Code used for simulation, Data Sheets
```

**Current status:** `convert_to_pdf.py`'s Chapter 3 is much more granular than this template
(it currently numbers sections 3.1 through 3.16 flatly — Design Approach, System
Architecture, Flywheel, Shaft, Bearing, Motor/ESC, Coupling, Frame, Design Calculations,
Bearing Life, Thermal, Structural, Control System, Software Architecture, Simulink, Circuit
Design). All of that content is correct and should be kept — it just needs to be nested
under the template's two required headings:
- **3.1 Component design** → should contain today's Flywheel / Shaft / Bearing / Motor & ESC
  / Coupling / Frame sections as 3.1.1–3.1.6.
- **3.2 Component analysis** → should contain today's Design Calculations / Bearing Life /
  Thermal / Structural / Control System / Software Architecture / Simulink / Circuit Design
  sections as 3.2.1–3.2.8.
- Today's "3.1 Design Approach" and "3.2 System-Level Architecture" content fits as the
  unlabelled lead-in prose under "3.0 Methodology" before 3.1 starts.

This renumbering has not been done yet (it touches many internal cross-references like
"see Section 3.12" throughout the script) — check with the user or do it carefully,
updating every internal `Section 3.x` reference in the same pass, then regenerate and
spot-check the PDF's table of contents and a few cross-references before considering it done.

## 3. House style / rules learned the hard way this session

- **Every component-selection subsection follows: requirement → alternatives considered →
  selected option with justification → forward reference to where it's verified
  (calculation or test).** Don't just state what was chosen — show what was rejected and why.
- **Never invent specs or test data.** All datasheet numbers must come from a real datasheet
  (see `datasheets/`) or a real measurement already elsewhere in the document. If a
  comparison table is a derived/calculated trade-off (e.g. the motor KV alternatives table)
  rather than a measured result, that's fine, but it must be clearly a legitimate physics
  derivation from real constants — never fabricated numbers dressed up as data.
- **The physical prototype's ESC is a commercial off-the-shelf 30A BLDC ESC**
  (`datasheets/ESC_Datasheet_30A_BLDC.pdf`), not a custom-built MOSFET/IR2101 driver. The
  custom driver design only ever existed as a Proteus simulation model (Proteus has no
  commercial-ESC library part) — it was never built into hardware. Keep these two clearly
  separate in the text; don't let simulation-only content read as if it describes the
  physical build.
- The prototype's power source is a multi-tap bench AC–DC adapter (`datasheets/
  Power_Adapter_Photo.jpg`, model HHW-96W, selectable 12/15/16/18/19V@4.5A or 20/24V@5A),
  not a LiPo/NiMH battery pack, set to its 12V tap. The oft-cited "4.84V design supply
  voltage" is the *effective average* voltage at the motor windings after ESC PWM duty-cycle
  modulation of that 12V rail (~40% duty cycle), not the raw supply rail — don't conflate
  the two when writing about voltage.
- If a fact about the actual build (battery/voltage/part number/measured value) is unknown
  or assumed, say so plainly to the user and ask, rather than guessing silently — several
  rounds of this thesis work already caught wrong assumptions this way (custom vs.
  commercial ESC being the big one).

## 4. Folder map

- `convert_to_pdf.py` — the thesis generator (source of truth).
- `thesis.pdf` — generated output, regenerate after every content change.
- `datasheets/` — real component datasheets/photos referenced in the design (motor, ESP32,
  MPU6050, RS608 bearing, the commercial ESC, the power adapter photo).
- `source_material/` — reference documents used while drafting: a friend's related thesis
  (style/structure reference only, never copy content or phrasing from it), an earlier full
  draft, and the original Chapter 3 docx this work started from.
- `draft/thesis.md` — legacy short outline, not authoritative (see §1).
- `THESIS_GUIDE.md` — this file.
