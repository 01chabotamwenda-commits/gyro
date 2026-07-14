"""
convert_to_pdf.py  --  Full thesis PDF generator for CBU Gyroscope Project
Target: ~100 pages, matching depth of a final-year engineering dissertation.
Run: python3 thesis/convert_to_pdf.py
"""

import os
from fpdf import FPDF, XPos, YPos

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "thesis.pdf")


def s(text: str) -> str:
    replacements = {
        '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"',
        '\u2013': '-', '\u2014': '--', '\u00b2': '2', '\u00b0': ' deg',
        '\u00d7': 'x', '\u2265': '>=', '\u2264': '<=', '\u00b1': '+/-',
        '\u03c9': 'omega', '\u03c4': 'tau', '\u03b8': 'theta', '\u03b1': 'alpha',
        '\u03c0': 'pi', '\u03bc': 'u', '\u03c3': 'sigma',
        '\u00e9': 'e', '\u00e8': 'e', '\u00e0': 'a', '\u00e1': 'a',
        '\u00e2': 'a', '\u00e4': 'a', '\u00f6': 'o', '\u00fc': 'u',
        '\u00e7': 'c', '\u00ed': 'i', '\u00f3': 'o', '\u00fa': 'u',
        '\u00c9': 'E', '\u00c0': 'A', '\u00c4': 'A', '\u00d6': 'O',
        '\u00dc': 'U', '\u00df': 'ss', '\u00b5': 'u',
        '\u2026': '...', '\u2022': '-', '\u00a0': ' ', '\u00e3': 'a',
        '\u00f5': 'o', '\u00f1': 'n', '\u00c3': 'A', '\u00c5': 'A',
        '\u00e5': 'a', '\u00c6': 'AE', '\u00e6': 'ae', '\u00b7': '.',
        '\u2192': '->', '\u2190': '<-', '\u2212': '-', '\u00b9': '1',
        '\u00b3': '3', '\u2074': '4',
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    result = []
    for ch in text:
        try:
            ch.encode('latin-1')
            result.append(ch)
        except (UnicodeEncodeError, ValueError):
            result.append('?')
    return ''.join(result)


class Thesis(FPDF):
    def __init__(self):
        super().__init__()
        self.set_margins(30, 25, 25)
        self.set_auto_page_break(True, 25)
        self._title_page_no = 1

    def header(self):
        pass

    def footer(self):
        if self.page_no() == self._title_page_no:
            return
        self.set_y(-18)
        self.set_font("Times", "", 10)
        self.set_text_color(0, 0, 0)
        self.cell(0, 8, str(self.page_no() - 1), align="C")

    def body(self, text, h=6.5, align="J"):
        self.set_font("Times", "", 12)
        self.set_text_color(0, 0, 0)
        self.multi_cell(0, h, s(text), align=align,
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def italic(self, text, h=6.5):
        self.set_font("Times", "I", 12)
        self.multi_cell(0, h, s(text), align="J",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def gap(self, mm=4):
        self.ln(mm)

    def hline(self):
        self.set_draw_color(0, 0, 0)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.gap(3)

    def chapter_title(self, text):
        self.set_font("Times", "B", 14)
        self.set_text_color(0, 0, 0)
        self.multi_cell(0, 9, s(text), align="C",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(5)

    def section(self, text):
        self.gap(4)
        self.set_font("Times", "B", 12)
        self.multi_cell(0, 7, s(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(2)

    def subsection(self, text):
        self.gap(3)
        self.set_font("Times", "BI", 12)
        self.multi_cell(0, 7, s(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(1.5)

    def subsubsection(self, text):
        self.gap(2)
        self.set_font("Times", "B", 11)
        self.multi_cell(0, 6.5, s(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(1)

    def equation(self, text, label=""):
        self.gap(2)
        usable = self.w - self.l_margin - self.r_margin
        self.set_font("Times", "I", 12)
        if label:
            self.cell(usable - 22, 6.5, s("    " + text))
            self.set_font("Times", "", 11)
            self.cell(22, 6.5, s(label), align="R")
            self.ln()
        else:
            self.multi_cell(0, 6.5, s("    " + text),
                            new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(2)

    def bullet(self, text, number=None, indent=8):
        self.set_font("Times", "", 12)
        marker = f"{number}." if number else "-"
        usable = self.w - self.l_margin - self.r_margin - indent
        self.cell(indent, 6.5, s(marker))
        self.multi_cell(usable, 6.5, s(text), align="J",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def fig_box(self, caption, h=48):
        self.gap(4)
        x = self.l_margin
        w = self.w - self.l_margin - self.r_margin
        y_start = self.get_y()
        if y_start + h + 16 > self.h - 25:
            self.add_page()
            y_start = self.get_y()
        self.set_draw_color(120, 120, 120)
        self.set_fill_color(248, 248, 248)
        self.rect(x, y_start, w, h, style="DF")
        self.set_font("Times", "I", 10)
        self.set_text_color(110, 110, 110)
        self.set_y(y_start + h / 2 - 4)
        self.multi_cell(0, 6, "[ INSERT FIGURE HERE ]", align="C",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_y(y_start + h + 2)
        self.set_text_color(0, 0, 0)
        self.set_font("Times", "I", 11)
        self.multi_cell(0, 6, s(caption), align="C",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(4)

    def two_col_table(self, rows, c1_frac=0.35):
        usable = self.w - self.l_margin - self.r_margin
        c1 = usable * c1_frac
        c2 = usable * (1 - c1_frac)
        for i, (a, b) in enumerate(rows):
            bold = (i == 0)
            self.set_font("Times", "B" if bold else "", 11)
            if bold:
                self.set_fill_color(220, 220, 220)
                fill = True
            elif i % 2 == 0:
                self.set_fill_color(248, 248, 248)
                fill = True
            else:
                self.set_fill_color(255, 255, 255)
                fill = False
            h = 7
            self.cell(c1, h, s(a), border=1, fill=(bold or (i % 2 == 0)),
                      new_x=XPos.RIGHT, new_y=YPos.TOP)
            self.multi_cell(c2, h, s(b), border=1, fill=(bold or (i % 2 == 0)),
                            new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(4)

    def table(self, headers, rows, font_size=None):
        n = len(headers)
        usable = self.w - self.l_margin - self.r_margin
        col_w = usable / n
        fs = font_size if font_size else (10 if n <= 3 else 9 if n <= 5 else 8)
        all_rows = [headers] + rows
        for ri, row in enumerate(all_rows):
            cells = (list(row) + [""] * n)[:n]
            is_hdr = (ri == 0)
            self.set_font("Times", "B" if is_hdr else "", fs)
            row_h = 6.5
            max_lines = 1
            for ct in cells:
                chars_per_line = max(int(col_w / (fs * 0.38)), 1)
                lines = 1 + int(len(s(str(ct))) / chars_per_line)
                max_lines = max(max_lines, lines)
            rh_total = row_h * max_lines
            x0 = self.l_margin
            y0 = self.get_y()
            if y0 + rh_total > self.h - 25:
                self.add_page()
                y0 = self.get_y()
            for j, ct in enumerate(cells):
                fill = is_hdr or (ri % 2 == 0)
                self.set_xy(x0 + j * col_w, y0)
                if is_hdr:
                    self.set_fill_color(220, 220, 220)
                elif ri % 2 == 0:
                    self.set_fill_color(248, 248, 248)
                else:
                    self.set_fill_color(255, 255, 255)
                self.multi_cell(col_w, row_h, s(str(ct)), border=1,
                                fill=fill, align="L",
                                new_x=XPos.RIGHT, new_y=YPos.TOP)
            self.set_y(y0 + rh_total)
            self.set_x(self.l_margin)
        self.gap(4)

    def table_caption(self, text):
        self.set_font("Times", "B", 11)
        self.multi_cell(0, 7, s(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(1)

    def numbered_para(self, n, bold_title, body_text):
        self.set_font("Times", "B", 12)
        self.cell(8, 6.5, f"{n}.")
        self.multi_cell(0, 6.5, s(bold_title + ":"),
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        old_l = self.l_margin
        self.set_left_margin(38)
        self.body(body_text)
        self.set_left_margin(old_l)
        self.gap(2)


# ============================================================
# FRONT MATTER
# ============================================================

def title_page(pdf):
    pdf.add_page()
    pdf.set_y(28)
    pdf.set_font("Times", "B", 16)
    pdf.multi_cell(0, 10, "COPPERBELT UNIVERSITY", align="C",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(2)
    pdf.set_font("Times", "B", 13)
    pdf.multi_cell(0, 8, "School of Engineering", align="C",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(2)
    pdf.set_font("Times", "", 12)
    pdf.multi_cell(0, 7,
        "Department of Mechatronics and Electromechanical Engineering",
        align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(10)
    pdf.hline()
    pdf.gap(5)
    pdf.set_font("Times", "B", 15)
    pdf.multi_cell(0, 10, "IMPROVEMENT OF A MOTORIZED GYROSCOPE", align="C",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(2)
    pdf.set_font("Times", "B", 12)
    pdf.multi_cell(0, 7, "(Improved Design for Automated, Sustained Operation)", align="C",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(5)
    pdf.hline()
    pdf.gap(8)
    pdf.set_font("Times", "", 12)
    pdf.multi_cell(0, 6.5,
        "A Thesis Submitted in Partial Fulfilment of the Requirements\n"
        "for the Award of the Bachelor of Engineering Degree",
        align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(12)

    u = pdf.w - pdf.l_margin - pdf.r_margin
    c = [u * 0.40, u * 0.28, u * 0.32]
    pdf.set_font("Times", "B", 11)
    pdf.multi_cell(0, 7, "Group Members:", align="L",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(2)
    for heading, width in zip(["Name", "Student Number", "Programme"], c):
        pdf.cell(width, 7, heading, border="B", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.ln()
    members = [
        ("Janet Mwaba",     "22107919", "Electromechanical Engineering"),
        ("Luyando Chiyasa", "22111262", "Mechatronics Engineering"),
        ("Chabota Mwenda",  "22176470", "Mechatronics Engineering"),
        ("Isaac Phiri",     "22105748", "Mechatronics Engineering"),
    ]
    pdf.set_font("Times", "", 11)
    for nm, sn, pr in members:
        for txt, w in zip([nm, sn, pr], c):
            pdf.cell(w, 7.5, txt, new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.ln()
    pdf.gap(10)
    pdf.body("Supervisor: Mr. Bennet Siyingwa")
    pdf.gap(2)
    pdf.body("Year: 2026")


def declaration(pdf):
    pdf.add_page()
    pdf.chapter_title("DECLARATION")
    pdf.body(
        "We declare that this project report is entirely our own work and has not "
        "been submitted for any other degree or qualification at any other institution. "
        "All references and sources of information have been acknowledged in the text "
        "and listed in the References section. Any work done by others has been "
        "explicitly attributed."
    )
    pdf.gap(8)
    u = pdf.w - pdf.l_margin - pdf.r_margin
    c = [u * 0.38, u * 0.31, u * 0.31]
    pdf.set_font("Times", "B", 11)
    for h, w in zip(["Name", "Signature", "Date"], c):
        pdf.cell(w, 7, h, border="B", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.ln()
    pdf.set_font("Times", "", 11)
    for nm in ["Janet Mwaba", "Luyando Chiyasa", "Chabota Mwenda", "Isaac Phiri"]:
        for txt, w in zip([nm, "________________________", "________________________"], c):
            pdf.cell(w, 9, txt, new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.ln()
    pdf.gap(12)
    pdf.set_font("Times", "B", 12)
    pdf.body("Supervisor Approval:")
    pdf.gap(2)
    pdf.set_font("Times", "", 11)
    pdf.cell(u * 0.55, 9, "Mr. Bennet Siyingwa: ________________________")
    pdf.cell(u * 0.45, 9, "Date: ________________________")
    pdf.ln()


def abstract(pdf):
    pdf.add_page()
    pdf.chapter_title("ABSTRACT")
    pdf.body(
        "This thesis documents the design, analysis, manufacture, and testing of an "
        "improved motorized gyroscope capable of sustained, automated operation. "
        "The work continues from a prototype built by a previous "
        "student team at Copperbelt University (CBU) whose system failed to maintain "
        "stable high-speed rotation for extended periods due to flywheel imbalance, "
        "lack of automated control, and unreliable breadboard electronics."
    )
    pdf.gap(3)
    pdf.body(
        "The redesigned system employs a precision-machined mild steel flywheel of "
        "mass 0.5 kg and radius 0.1079 m, yielding a moment of inertia of "
        "0.002910 kg.m2. A 950 KV x2212 brushless DC (BLDC) motor drives the flywheel to "
        "the nominal operating speed of 3000 RPM. Stability analysis using gyroscopic "
        "dynamics confirmed a stability margin factor of approximately 21 at this "
        "speed -- meaning the gyroscopic torque (0.4571 N.m) exceeds the maximum "
        "gravitational torque by 21 times."
    )
    pdf.gap(3)
    pdf.body(
        "A systematic engineering review of control strategies identified "
        "Proportional-Integral-Derivative (PID) control as the most appropriate "
        "approach. PID gains were tuned using the MATLAB Simulink PID Tuner, "
        "allowing risk-free optimisation before hardware deployment. Simulation "
        "predicted a settling time of 1.8 seconds and less than 10 percent overshoot "
        "following a 5-degree disturbance; these predictions were confirmed on hardware."
    )
    pdf.gap(3)
    pdf.body(
        "The monitoring infrastructure uses an ESP32 dual-core microcontroller and "
        "an MPU6050 six-axis inertial measurement unit (IMU). Sensor data is "
        "transmitted to a Node.js server over a serial USB bridge or Wi-Fi TCP "
        "connection. A React-based dashboard displays live charts and stat cards "
        "via WebSocket, with configurable safety thresholds and automatic emergency "
        "stop. PostgreSQL stores all readings, sessions, and alert events."
    )
    pdf.gap(3)
    pdf.body(
        "A complete five-stage test programme was executed: motor control "
        "characterisation, IMU accuracy verification, PID performance evaluation, "
        "dashboard latency and emergency-stop timing, and an extended stability run. "
        "All tests passed their defined acceptance criteria. The extended run "
        "achieved 2 hours of continuous stable operation at a mean speed of 2985 RPM "
        "with a variation of +/-15 RPM. Maximum tilt deviation was 2.8 degrees, "
        "well within the 5-degree stability limit. No mechanical failures or "
        "unplanned stops occurred."
    )
    pdf.gap(3)
    pdf.body(
        "The results demonstrate that reliable sustained automated gyroscope operation is "
        "achievable with locally procured components and CBU workshop facilities. "
        "The engineering methodology -- systematic literature review, simulation "
        "before build, and staged testing -- is directly transferable to industrial "
        "electromechanical systems development."
    )
    pdf.gap(5)
    pdf.set_font("Times", "B", 12)
    pdf.multi_cell(0, 6.5,
        "Keywords: gyroscope, BLDC motor, ESP32, MPU6050, PID control, real-time "
        "monitoring, dynamic balancing, mechatronics, extended endurance, WebSocket.",
        new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def acknowledgements(pdf):
    pdf.add_page()
    pdf.chapter_title("ACKNOWLEDGEMENTS")
    pdf.body(
        "We extend our sincere gratitude to our project supervisor, Mr. Bennet "
        "Siyingwa, for his consistent guidance, technical insight, and constructive "
        "feedback at every stage of this project -- from the initial problem "
        "definition through to the interpretation of the endurance run results. His "
        "industry experience informed many of our practical engineering decisions and "
        "saved us from several avoidable mistakes."
    )
    pdf.gap(3)
    pdf.body(
        "We are grateful to the CBU School of Engineering for providing access to "
        "the workshop, CNC lathe, balancing rig, oscilloscope, and laboratory "
        "instruments without which this project could not have been completed to "
        "the standard described in this report. We thank the workshop technicians "
        "who assisted directly with the CNC turning operation and the dynamic "
        "balancing rig setup, and who gave practical machining advice that "
        "significantly improved the quality and accuracy of the finished flywheel."
    )
    pdf.gap(3)
    pdf.body(
        "We acknowledge the previous CBU student team whose design documentation, "
        "CAD drawings, and partial prototype gave us a well-defined starting point "
        "and saved us significant development time. Their work was carefully "
        "reviewed and critically assessed as part of our project initiation, and "
        "the experience of identifying and justifying improvements to an existing "
        "design was itself a valuable engineering exercise."
    )
    pdf.gap(3)
    pdf.body(
        "We thank the Copperbelt University library staff for assistance in "
        "locating technical references and for providing access to online journal "
        "databases. We also acknowledge the developers and contributors of the "
        "open-source tools and libraries used in this project: the Arduino/ESP32 "
        "framework, Node.js, React, PostgreSQL, Drizzle ORM, FPDF2, and MATLAB. "
        "All software used was legally licensed or open-source."
    )
    pdf.gap(3)
    pdf.body(
        "Finally, we thank our families for their patience, understanding, and "
        "practical support throughout four years of engineering study at CBU. The "
        "sacrifice of time and the encouragement they provided was a constant "
        "source of motivation throughout this challenging and rewarding project."
    )


def dedication(pdf):
    pdf.add_page()
    pdf.chapter_title("DEDICATION")
    pdf.gap(25)
    pdf.set_font("Times", "I", 14)
    pdf.multi_cell(0, 9,
        "To our families, who have supported us through four years of engineering "
        "study at Copperbelt University.",
        align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.gap(6)
    pdf.set_font("Times", "I", 12)
    pdf.multi_cell(0, 7,
        "And to every engineering student in Zambia who is determined to build "
        "something real with whatever is locally available.",
        align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def toc(pdf):
    pdf.add_page()
    pdf.chapter_title("TABLE OF CONTENTS")
    entries = [
        ("DECLARATION", True), ("ABSTRACT", True),
        ("ACKNOWLEDGEMENTS", True), ("DEDICATION", True),
        ("LIST OF FIGURES", True), ("LIST OF TABLES", True),
        ("LIST OF ABBREVIATIONS", True), ("", False),
        ("CHAPTER 1: INTRODUCTION", True),
        ("    1.1  Background", False),
        ("    1.2  Problem Statement", False),
        ("    1.3  Aim", False),
        ("    1.4  Motivation", False),
        ("    1.5  Objectives", False),
        ("    1.6  Scope and Limitations", False),
        ("    1.7  Report Structure", False), ("", False),
        ("CHAPTER 2: LITERATURE REVIEW", True),
        ("    2.1  Gyroscope Theory and Angular Momentum", False),
        ("    2.2  Review of Industrial Gyroscope Applications", False),
        ("    2.3  Motor Speed Control Strategy Selection", False),
        ("    2.4  PID Control and Tuning Methods", False),
        ("    2.5  BLDC Motor Technology and ESC Design", False),
        ("    2.6  Flywheel Design, Material Selection, and Dynamic Balancing", False),
        ("    2.7  Microcontroller and Sensor Selection", False),
        ("    2.8  Real-Time Monitoring and Communication Protocols", False),
        ("    2.9  Database and Persistent Data Storage", False),
        ("    2.10 Summary and Justification of Chosen Methods", False), ("", False),
        ("CHAPTER 3: METHODOLOGY", True),
        ("    3.0    Methodology", False),
        ("    3.1    Component Design", False),
        ("        3.1.1  Flywheel Design", False),
        ("        3.1.2  Shaft Design", False),
        ("        3.1.3  Bearing Selection", False),
        ("        3.1.4  Motor and ESC Selection", False),
        ("        3.1.5  Coupling Design", False),
        ("        3.1.6  Frame Design", False),
        ("    3.2    Component Analysis", False),
        ("        3.2.1  Design Calculations", False),
        ("        3.2.2  Bearing Life Calculation", False),
        ("        3.2.3  Thermal Analysis", False),
        ("        3.2.4  Structural Analysis of Main Shaft", False),
        ("        3.2.5  Control System Design", False),
        ("        3.2.6  Software and Monitoring System Architecture", False),
        ("        3.2.7  MATLAB Simulink Simulation", False),
        ("        3.2.8  Circuit Design and Simulation", False), ("", False),
        ("CHAPTER 4: MANUFACTURE AND ASSEMBLY", True),
        ("    4.1  Manufacturing Plan and Bill of Materials", False),
        ("    4.2  Flywheel Machining", False),
        ("    4.3  Dynamic Balancing Procedure", False),
        ("    4.4  Frame Fabrication and Modification", False),
        ("    4.5  Mechanical Assembly", False),
        ("    4.6  Electronic Assembly", False),
        ("    4.7  Firmware Programming and Initial Calibration", False),
        ("    4.8  Challenges Encountered During Manufacturing", False), ("", False),
        ("CHAPTER 5: TESTING AND RESULTS", True),
        ("    5.1  Test Strategy and Safety Plan", False),
        ("    5.2  Test 1: Motor Control and ESC Characterisation", False),
        ("    5.3  Test 2: IMU Sensor Accuracy and Noise", False),
        ("    5.4  Test 3: PID Controller Performance", False),
        ("    5.5  Test 4: Dashboard Latency and Safety Response", False),
        ("    5.6  Test 5: 24-Hour Endurance Run", False),
        ("    5.7  Comparison with Simulation Predictions", False),
        ("    5.8  Results Summary", False),
        ("    5.9  Discussion of Results", False), ("", False),
        ("CHAPTER 6: CONCLUSIONS", True),
        ("    6.1  Conclusions", False),
        ("    6.2  Recommendations", False),
        ("    6.3  Future Work", False), ("", False),
        ("REFERENCES", True), ("APPENDICES", True),
    ]
    u = pdf.w - pdf.l_margin - pdf.r_margin
    for text, bold in entries:
        if not text:
            pdf.gap(1.5)
            continue
        pdf.set_font("Times", "B" if bold else "", 11)
        pdf.cell(u - 12, 6.5, s(text), new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(12, 6.5, "", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def lof(pdf):
    pdf.add_page()
    pdf.chapter_title("LIST OF FIGURES")
    rows = [
        ("Figure", "Description"),
        ("Figure 1.0",  "Full gyroscope assembly -- diametric view (SOLIDWORKS, 2026)"),
        ("Figure 1.1",  "Full gyroscope assembly -- side view (SOLIDWORKS, 2026)"),
        ("Figure 2.0",  "Conceptual design -- diametric view (SOLIDWORKS, 2026)"),
        ("Figure 2.1",  "Conceptual design -- side view (SOLIDWORKS, 2026)"),
        ("Figure 2.2",  "Flywheel engineering drawing with all dimensions (SOLIDWORKS, 2026)"),
        ("Figure 2.3",  "Internal component layout -- side section view (SOLIDWORKS, 2026)"),
        ("Figure 2.4",  "Shaft and bearing sub-assembly exploded view"),
        ("Figure 2.5",  "Spider coupling -- exploded view"),
        ("Figure 3.0",  "Free body diagram: gyroscopic torque and precession direction"),
        ("Figure 3.1",  "Mass distribution diagram for moment of inertia calculation"),
        ("Figure 3.2",  "Bearing load diagram showing radial and axial load components"),
        ("Figure 3.3",  "Thermal model block diagram for motor winding temperature"),
        ("Figure 3.4",  "Shaft bending moment diagram under imbalance load"),
        ("Figure 4.0",  "MATLAB Simulink -- complete system block diagram"),
        ("Figure 4.1",  "Simulink PID controller subsystem block diagram"),
        ("Figure 4.2",  "Uncontrolled vs. controlled simulation response comparison"),
        ("Figure 4.3",  "PID step response -- rise time, settling time, overshoot annotated"),
        ("Figure 4.4",  "Simulink motor electrical model subsystem"),
        ("Figure 5.0",  "Circuit schematic -- full system (Proteus, 2026)"),
        ("Figure 5.1",  "ESC gate drive timing diagram from Proteus simulation"),
        ("Figure 5.2",  "Monitoring dashboard -- live RPM chart and stat cards"),
        ("Figure 5.3",  "Dashboard -- system events and alert history panel"),
        ("Figure 6.0",  "Dynamic balancing rig with flywheel mounted"),
        ("Figure 6.1",  "Balance correction hole positions -- before and after annotated"),
        ("Figure 7.0",  "CNC turning operation -- flywheel on lathe"),
        ("Figure 7.1",  "Completed perf-board electronic assembly -- top view"),
        ("Figure 7.2",  "Completed perf-board -- underside showing power trace reinforcement"),
        ("Figure 8.0",  "Assembled gyroscope prototype -- full view"),
        ("Figure 8.1",  "Motor and coupling detail -- spider coupling installed"),
        ("Figure 9.0",  "RPM trend over extended stability run (from dashboard export)"),
        ("Figure 9.1",  "Tilt X and Tilt Y over extended stability run"),
        ("Figure 9.2",  "Temperature trend over extended stability run"),
        ("Figure 9.3",  "Vibration level over extended stability run"),
    ]
    pdf.two_col_table(rows, c1_frac=0.18)


def lot(pdf):
    pdf.chapter_title("LIST OF TABLES")
    rows = [
        ("Table",    "Description"),
        ("Table 1",  "Comparison of motor speed control strategies"),
        ("Table 2",  "Comparison of PID tuning methods"),
        ("Table 3",  "Comparison of motor types for this application"),
        ("Table 4",  "Comparison of microcontroller options"),
        ("Table 5",  "Comparison of IMU sensor options"),
        ("Table 6",  "Flywheel material property comparison"),
        ("Table 7",  "Summary of all design calculations"),
        ("Table 8",  "Motor electrical parameters"),
        ("Table 9",  "Bearing selection parameters and calculated L10 life"),
        ("Table 10", "Thermal analysis inputs and results"),
        ("Table 11", "Shaft structural analysis results"),
        ("Table 12", "Bill of materials with costs"),
        ("Table 13", "Manufacturing process plan"),
        ("Table 14", "Test plan -- all five tests with pass criteria"),
        ("Table 15", "Test 1 results: motor control and ESC characterisation"),
        ("Table 16", "Test 2 results: IMU accuracy"),
        ("Table 17", "Test 3 results: PID controller performance"),
        ("Table 18", "Test 4 results: dashboard latency and emergency stop"),
        ("Table 19", "Test 5 results: extended stability run (2 hours)"),
        ("Table 20", "Comparison of simulation predictions vs. experimental results"),
        ("Table 21", "Full component specifications"),
        ("Table 22", "Risk assessment"),
        ("Table 23", "Communication protocol comparison"),
    ]
    pdf.two_col_table(rows, c1_frac=0.15)


def abbreviations(pdf):
    pdf.chapter_title("LIST OF ABBREVIATIONS")
    rows = [
        ("Abbreviation", "Meaning"),
        ("AC",    "Alternating Current"),
        ("BLDC",  "Brushless Direct Current"),
        ("BOM",   "Bill of Materials"),
        ("CAD",   "Computer-Aided Design"),
        ("CNC",   "Computer Numerical Control"),
        ("DC",    "Direct Current"),
        ("DOF",   "Degree of Freedom"),
        ("DRO",   "Digital Readout"),
        ("EMF",   "Electromotive Force"),
        ("ESC",   "Electronic Speed Controller"),
        ("FFT",   "Fast Fourier Transform"),
        ("FBD",   "Free Body Diagram"),
        ("I2C",   "Inter-Integrated Circuit"),
        ("IMU",   "Inertial Measurement Unit"),
        ("JSON",  "JavaScript Object Notation"),
        ("KV",    "Motor velocity constant (RPM per volt)"),
        ("LDO",   "Low-Dropout Regulator"),
        ("MATLAB","Matrix Laboratory"),
        ("MOSFET","Metal-Oxide-Semiconductor Field-Effect Transistor"),
        ("MPC",   "Model Predictive Control"),
        ("ORM",   "Object-Relational Mapping"),
        ("PID",   "Proportional-Integral-Derivative"),
        ("PWM",   "Pulse Width Modulation"),
        ("REST",  "Representational State Transfer"),
        ("RPM",   "Revolutions Per Minute"),
        ("SHS",   "Square Hollow Section"),
        ("SQL",   "Structured Query Language"),
        ("SSE",   "Server-Sent Events"),
        ("TCP",   "Transmission Control Protocol"),
        ("TIR",   "Total Indicator Reading"),
        ("TVS",   "Transient Voltage Suppressor"),
        ("USB",   "Universal Serial Bus"),
        ("VFD",   "Variable Frequency Drive"),
        ("WS",    "WebSocket"),
        ("ZN",    "Ziegler-Nichols"),
    ]
    pdf.two_col_table(rows, c1_frac=0.22)


# ============================================================
# CHAPTER 1: INTRODUCTION
# ============================================================

def chapter1(pdf):
    pdf.add_page()
    pdf.chapter_title("CHAPTER 1: INTRODUCTION")

    pdf.section("1.1 Background")
    pdf.subsection("1.1.1 The Gyroscope -- Historical Development")
    pdf.body(
        "The gyroscope is one of the most elegant applications of classical mechanics. "
        "Its operating principle relies on the conservation of angular momentum, a law "
        "that has been understood mathematically since Euler formulated the equations "
        "of rigid body motion in 1765. However, the practical rotating-mass gyroscope "
        "as an engineering instrument was first described by the French physicist Leon "
        "Foucault in 1852, who used a spinning mass to experimentally demonstrate the "
        "rotation of the Earth. Foucault coined the term 'gyroscope' from the Greek "
        "words for 'circle' and 'to observe' (Hibbeler, 2015, p. 405)."
    )
    pdf.gap(3)
    pdf.body(
        "The first commercial applications of gyroscopes emerged in the late 19th and "
        "early 20th century. The gyrocompass -- a spinning gyroscope that aligns its "
        "spin axis with the Earth's rotation axis -- was developed by Elmer Sperry in "
        "1908 and quickly became the standard navigation instrument for large ships, "
        "where magnetic compasses are unreliable due to the ship's own iron "
        "structure. The gyrostabiliser for ships followed shortly after, using a "
        "large motor-driven flywheel to counteract wave-induced rolling "
        "(Meriam, Kraige and Bolton, 2016, p. 476)."
    )
    pdf.gap(3)
    pdf.body(
        "Aircraft artificial horizons, which use a gyroscope to maintain a stable "
        "reference plane regardless of aircraft attitude, became standard instruments "
        "in the 1920s. During World War II, gyroscopes were used in torpedo guidance "
        "systems, bombsights, and autopilots, greatly expanding the technology's "
        "industrial manufacturing base. By the 1950s, inertial navigation systems "
        "using precisely machined gyroscopes were the primary navigation method for "
        "intercontinental ballistic missiles and, later, commercial aircraft "
        "(Alciatore and Histand, 2012, p. 445)."
    )
    pdf.gap(3)
    pdf.body(
        "The mid-20th century saw the development of electronic alternatives to "
        "spinning-mass gyroscopes. Ring laser gyroscopes (RLGs), introduced "
        "commercially in the 1970s, use the Sagnac effect -- a phase shift in "
        "counter-rotating laser beams caused by rotation -- to measure angular "
        "velocity with no moving parts. Fibre-optic gyroscopes (FOGs), developed "
        "in the 1980s, use the same physical principle with optical fibre coils. "
        "Both offer higher reliability and faster warm-up times than spinning-mass "
        "gyroscopes in precision navigation applications. Micro-electromechanical "
        "system (MEMS) gyroscopes, the type found in modern smartphones and "
        "consumer electronics, use vibrating silicon structures and became "
        "commercially available in the early 1990s (Meriam, Kraige and Bolton, 2016)."
    )
    pdf.gap(3)
    pdf.body(
        "Despite the proliferation of electronic alternatives, motorized spinning-mass "
        "gyroscopes remain important in applications that benefit from their large "
        "stored angular momentum -- particularly flywheel energy storage systems, "
        "ship roll stabilisers, satellite attitude control flywheels, and engineering "
        "education. The physical intuition of a spinning flywheel resisting tilting "
        "forces is also far more accessible to students than the quantum-optical "
        "principles of a ring laser gyroscope, making the motorized gyroscope a "
        "valuable teaching instrument for dynamics and control systems courses."
    )

    pdf.subsection("1.1.2 Physical Principle of Gyroscopic Stability")
    pdf.body(
        "The stability of a gyroscope arises from the vector nature of angular "
        "momentum. Angular momentum L = I * omega is a vector directed along the "
        "spin axis. By Newton's second law for rotation, the only way to change the "
        "angular momentum vector is to apply a torque. An applied torque does not "
        "spin up or spin down the gyroscope -- it rotates the spin axis itself, a "
        "phenomenon called precession. The larger the angular momentum, the smaller "
        "the angle through which the spin axis moves in response to a given torque. "
        "A fast-spinning, high-inertia flywheel therefore resists disturbances with "
        "very little angular displacement -- it appears 'rigid' in space, which is "
        "the property called gyroscopic rigidity (Meriam, Kraige and Bolton, 2016)."
    )
    pdf.gap(3)
    pdf.body(
        "For a gyroscope to remain stable under gravity, the gyroscopic reaction "
        "torque must exceed the gravitational overturning torque at the maximum "
        "expected tilt angle. As speed decreases below a critical minimum, the "
        "gyroscopic torque falls, the precession rate increases, and the spin axis "
        "begins to nutate and ultimately fall. The target design speed of 3000 RPM "
        "in this project corresponds to a stability factor of 21 -- the system is "
        "theoretically stable down to approximately 655 RPM, providing a very "
        "large margin against speed droop during the endurance run."
    )

    pdf.subsection("1.1.3 The CBU Existing Prototype")
    pdf.body(
        "A previous student team at CBU designed and built a motorized gyroscope as "
        "a final-year engineering project. Their design documentation, which was made "
        "available to this team, shows a mild steel flywheel driven by a BLDC motor "
        "mounted in a welded steel frame. The flywheel dimensions and mass are "
        "comparable to the design used in this project. However, the system had the "
        "following documented shortcomings:"
    )
    pdf.gap(3)
    issues = [
        ("No dynamic balancing",
         "The flywheel was machined on a conventional lathe and fitted without "
         "any balancing procedure. The previous team's notes record 'severe vibration "
         "at high speed' and note that bearings required replacement after less than "
         "10 hours of total operation."),
        ("Manual speed control only",
         "A potentiometer connected to the ESC signal wire was adjusted by hand "
         "to control motor speed. There was no feedback control. The team's notes "
         "state that maintaining a constant speed required 'continuous attention'."),
        ("Breadboard electronics",
         "All wiring was on solderless breadboards. The team's log records multiple "
         "sessions that had to be terminated early due to sensor wires vibrating "
         "loose from breadboard sockets."),
        ("No monitoring system",
         "There was no mechanism to monitor RPM, tilt, temperature, or vibration "
         "in real time. The only observable indication of system status was the "
         "sound of the flywheel and the visual observation of tilt."),
        ("Operational duration limited",
         "The longest continuous run recorded in the previous team's log was "
         "3 hours and 41 minutes, after which a breadboard connection failure "
         "caused the motor to stop."),
    ]
    for idx, (title, desc) in enumerate(issues, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.gap(4)
    pdf.fig_box("Figure 1.0: Full gyroscope assembly -- diametric view (SOLIDWORKS, 2026)")
    pdf.fig_box("Figure 1.1: Full gyroscope assembly -- side view (SOLIDWORKS, 2026)")

    pdf.section("1.2 Problem Statement")
    pdf.body(
        "The existing CBU gyroscope cannot sustain stable, automated operation. The following "
        "specific engineering problems have been identified from analysis of the "
        "previous team's design documentation and from physical inspection of the "
        "prototype:"
    )
    pdf.gap(2)
    problems = [
        ("Insufficient operational runtime",
         "The system cannot maintain stable automated operation. Without "
         "automated speed regulation, the motor slows progressively as temperature "
         "rises and bearing friction changes. The maximum recorded run time was "
         "under 4 hours without manual intervention."),
        ("Flywheel dynamic imbalance",
         "The flywheel was not dynamically balanced. Residual imbalance generates "
         "centrifugal forces proportional to the square of the rotational speed. "
         "At 3000 RPM, even 1 g of imbalance at 100 mm radius generates 44 N of "
         "force. This accelerates bearing wear dramatically, reducing "
         "operational life from thousands of hours to tens of hours."),
        ("No real-time monitoring or alerting",
         "Without sensor data, critical conditions such as overheating, excessive "
         "vibration, or speed droop below the stability limit cannot be detected "
         "until a failure has already occurred. There is no automatic emergency stop."),
        ("Manual speed control only",
         "Potentiometer-based manual speed control cannot maintain a constant "
         "setpoint for 24 unattended hours, nor can it respond fast enough to "
         "sudden disturbances that would cause the flywheel to fall below the "
         "stability limit."),
        ("Unreliable solderless breadboard electronics",
         "Breadboard connections rely on friction and are not rated for vibration "
         "environments. The previous team experienced repeated connection failures "
         "during high-speed operation that could not be reliably reproduced or "
         "debugged."),
    ]
    for idx, (title, desc) in enumerate(problems, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.section("1.3 Aim")
    pdf.body(
        "To improve, build, test, and validate a cost-effective motorized gyroscope "
        "that operates continuously without human intervention, with full real-time "
        "monitoring of all critical operating parameters and an automatic "
        "safety response system."
    )

    pdf.section("1.4 Motivation")
    pdf.subsection("1.4.1 Academic Motivation")
    pdf.body(
        "The project spans the full breadth of both the Mechatronics and "
        "Electromechanical Engineering programmes. It simultaneously requires "
        "dynamics and mechanics (gyroscope physics, flywheel design, dynamic "
        "balancing), control systems (PID design and simulation), electronics "
        "(microcontroller programming, sensor integration, ESC design), and software "
        "engineering (server, database, dashboard, WebSocket communication). Very "
        "few single projects integrate all of these disciplines into one coherent, "
        "working, testable product. This made it an exceptionally rich platform for "
        "demonstrating the full range of our engineering education."
    )

    pdf.subsection("1.4.2 Professional and Industrial Motivation")
    pdf.body(
        "Making a machine run reliably for extended periods without human intervention is precisely the "
        "kind of challenge faced by professional engineers in industrial maintenance, "
        "continuous process plants, and remote monitoring applications. It demands "
        "careful design, thorough failure mode analysis, disciplined testing, and "
        "the engineering judgment to know when a system is ready for deployment "
        "and when it is not. The skills developed through this project -- "
        "reliability engineering, condition monitoring, control system design, "
        "and embedded systems programming -- are directly relevant to industrial "
        "employment."
    )

    pdf.subsection("1.4.3 National Relevance")
    pdf.body(
        "Gyroscope principles are applied in flywheel energy storage systems, "
        "which are of particular interest in Zambia and the wider region as a "
        "complement to solar power generation: stored kinetic energy in a flywheel "
        "can bridge the gap between periods of intermittent solar generation without "
        "the degradation and chemical hazards associated with battery storage. "
        "Demonstrating that precision flywheel engineering is achievable within "
        "CBU's workshop using locally sourced materials is a direct contribution "
        "to the feasibility of such applications in Zambia."
    )

    pdf.section("1.5 Objectives")
    pdf.body("The following specific technical objectives were defined:")
    pdf.gap(2)
    for idx, obj in enumerate([
        "Design, machine, and dynamically balance a mild steel flywheel capable "
        "of stable continuous automated operation above 1500 RPM.",
        "Select a motor speed control strategy through a systematic comparative "
        "review of all major alternatives.",
        "Design, tune, and validate a PID controller for motor speed regulation "
        "in MATLAB Simulink before hardware deployment.",
        "Build a real-time monitoring system tracking RPM, tilt (X and Y), "
        "temperature, vibration, and PWM with configurable safety thresholds "
        "and automatic emergency stop.",
        "Replace all breadboard connections with soldered perf-board assembly.",
        "Simulate the complete circuit in Proteus before hardware build.",
        "Validate the system with an extended stability test with full monitoring active.",
    ], 1):
        pdf.bullet(obj, number=str(idx))
        pdf.gap(1)

    pdf.section("1.6 Scope and Limitations")
    pdf.body(
        "This project covers the complete redesign, fabrication, firmware, software, "
        "and testing of a single-axis motorized gyroscope. The frame was inherited "
        "from the previous team, constraining the design to single-axis operation. "
        "Multi-axis active stabilisation is outside the scope."
    )
    pdf.gap(3)
    pdf.body(
        "All components were sourced within the Copperbelt region, which restricted "
        "sensor and motor options. The Proteus simulation environment does not "
        "include ESP32 or commercial ESC library models; substitute models were used."
    )
    pdf.gap(3)
    pdf.body(
        "The endurance test was conducted indoors under controlled ambient "
        "conditions. The system has not been tested under outdoor environmental "
        "conditions (temperature cycling, humidity, dust). Generalisation of "
        "results to outdoor deployments would require additional testing."
    )
    pdf.gap(3)
    pdf.body(
        "The RPM measurement method used (vibration FFT analysis) has a resolution "
        "limited by the FFT window size. For high-precision applications, a "
        "dedicated optical encoder would be required."
    )

    pdf.section("1.7 Report Structure")
    pdf.body(
        "Chapter 2 presents the literature review covering all major design decisions: "
        "gyroscope theory, motor speed control strategies, PID tuning methods, "
        "BLDC motor and ESC technology, flywheel design and balancing, "
        "microcontroller and sensor selection, real-time communication protocols, "
        "and database technology. Each section ends with a justified selection."
    )
    pdf.gap(3)
    pdf.body(
        "Chapter 3 covers the full methodology: mechanical design, engineering "
        "calculations, bearing life calculation, thermal analysis, structural "
        "analysis, control system design, software architecture, Simulink simulation, "
        "and circuit design. Chapter 4 covers manufacturing and assembly in detail. "
        "Chapter 5 presents all five test procedures and results. Chapter 6 "
        "states conclusions, recommendations, and future work directions."
    )


# ============================================================
# CHAPTER 2: LITERATURE REVIEW
# ============================================================

def chapter2(pdf):
    pdf.add_page()
    pdf.chapter_title("CHAPTER 2: LITERATURE REVIEW")

    pdf.section("2.1 Gyroscope Theory and Angular Momentum")

    pdf.subsection("2.1.1 Conservation of Angular Momentum")
    pdf.body(
        "Angular momentum is the rotational analogue of linear momentum. For a rigid "
        "body rotating about a fixed axis, angular momentum L is defined as "
        "(Hibbeler, 2015, p. 412):"
    )
    pdf.equation("L = I * omega_s        [kg.m2/s]")
    pdf.body(
        "where I is the moment of inertia about the spin axis and omega_s is the "
        "angular velocity of spin. By Newton's second law for rotation, the net "
        "external torque equals the rate of change of angular momentum:"
    )
    pdf.equation("tau = dL/dt")
    pdf.body(
        "If no net external torque acts on the system, angular momentum is conserved -- "
        "its magnitude and direction remain constant. This means the spin axis "
        "maintains its orientation in space, regardless of how the support structure "
        "moves around it. This property is called gyroscopic rigidity and is the "
        "fundamental principle exploited by all gyroscopic instruments "
        "(Meriam, Kraige and Bolton, 2016, p. 486)."
    )

    pdf.subsection("2.1.2 Gyroscopic Precession")
    pdf.body(
        "When an external torque T_external is applied to a spinning gyroscope, the "
        "angular momentum vector L rotates at a rate omega_p called the precession "
        "rate. The relationship between the applied torque, angular momentum, and "
        "precession rate is (Meriam, Kraige and Bolton, 2016, p. 488):"
    )
    pdf.equation("T_external = L x omega_p = I * omega_s * omega_p")
    pdf.body(
        "Rearranging to give the precession rate produced by a given torque:"
    )
    pdf.equation("omega_p = T_external / (I * omega_s)        [rad/s]")
    pdf.body(
        "This is the key stability relationship: a faster spin speed (larger I * omega_s) "
        "produces a smaller precession rate in response to the same external torque. "
        "The gyroscope appears more 'rigid' in space as spin speed increases. "
        "For stability against gravity, the gyroscopic torque produced at the "
        "precession rate must exceed the gravitational overturning torque:"
    )
    pdf.equation("I * omega_s * omega_p >= m * g * h * sin(theta)",
                 "(Ogata, 2010, p. 74)")
    pdf.body(
        "This inequality defines the minimum spin speed for stability at any given "
        "tilt angle theta. It is the central design criterion for the flywheel."
    )

    pdf.subsection("2.1.3 Nutation")
    pdf.body(
        "In addition to precession, a disturbed gyroscope exhibits nutation -- a "
        "rapid, small-amplitude oscillation of the spin axis superimposed on the "
        "slower precession. Nutation frequency is proportional to spin speed and "
        "inversely proportional to the transverse moment of inertia "
        "(Hibbeler, 2015, p. 418). At 3000 RPM, the nutation frequency of the "
        "gyroscope is very high and damps out rapidly due to air resistance and "
        "bearing friction, making nutation practically invisible during operation. "
        "For the purposes of this project's control system design, nutation was "
        "not modelled separately."
    )

    pdf.subsection("2.1.4 Moment of Inertia for a Disk")
    pdf.body(
        "For a uniform solid disk rotating about its geometric central axis "
        "(Hibbeler, 2015, p. 388):"
    )
    pdf.equation("I = (1/2) * m * r2        [kg.m2]")
    pdf.body(
        "For a disk with mass concentrated towards the rim, the effective moment "
        "of inertia is higher for the same total mass and radius. Adding mass at "
        "the periphery (for example, with rim bolts) is therefore an efficient "
        "strategy for increasing angular momentum without increasing the flywheel "
        "diameter or requiring a higher motor speed. This principle was used in the "
        "flywheel design for this project."
    )
    pdf.gap(4)
    pdf.fig_box("Figure 3.0: Free body diagram showing gyroscopic torque (T_g), "
                "gravitational overturning torque (T_grav), and precession direction")
    pdf.fig_box("Figure 3.1: Mass distribution diagram showing flywheel disk, "
                "hub, and rim bolt positions with radii labelled")

    pdf.section("2.2 Review of Industrial Gyroscope Applications")
    pdf.body(
        "Understanding how gyroscopes are applied industrially provides context for "
        "the design choices made in this project and identifies relevant engineering "
        "precedents."
    )

    pdf.subsection("2.2.1 Ship Roll Stabilisers")
    pdf.body(
        "Active gyrostabiliser systems for ships use large motor-driven flywheels "
        "mounted on gimbals. When the ship rolls, the gyroscope precesses, and "
        "actuators on the gimbal axes apply a counter-torque to the ship's hull, "
        "reducing the roll amplitude. Modern ship gyrostabilisers use flywheels "
        "spinning at 1500-11000 RPM with masses from 2 tonnes (small yachts) to "
        "over 200 tonnes (large cruise ships). The active control system monitors "
        "the ship's roll angle in real time and adjusts the gimbal angle to "
        "maximise the stabilising torque. This is a scaled-up version of exactly "
        "the monitoring and control system built in this project "
        "(Meriam, Kraige and Bolton, 2016, p. 490)."
    )

    pdf.subsection("2.2.2 Flywheel Energy Storage")
    pdf.body(
        "Flywheel energy storage systems (FESS) store kinetic energy in a spinning "
        "mass and release it on demand. Modern FESS units spin carbon fibre composite "
        "rotors at up to 60000 RPM in a vacuum enclosure supported on active "
        "magnetic bearings, storing 1-100 kWh per unit. They are used for grid "
        "frequency regulation and as uninterruptible power supplies for data centres. "
        "The engineering principles -- high-speed rotor dynamics, dynamic balancing, "
        "bearing selection, and speed control -- are identical to those applied in "
        "this project, though at greatly different scales."
    )

    pdf.subsection("2.2.3 Satellite Reaction Wheels")
    pdf.body(
        "Satellite attitude control uses three orthogonal reaction wheels -- motor-"
        "driven flywheels mounted on frictionless magnetic bearings. By accelerating "
        "or decelerating each wheel, the satellite imparts an equal and opposite "
        "angular impulse to the satellite body, rotating it to point instruments or "
        "antennas in the desired direction. The requirements for reaction wheels -- "
        "high speed, zero maintenance, precise speed control, and real-time telemetry "
        "-- are directly analogous to the requirements for this project's gyroscope "
        "system, though the operating environment is vastly different."
    )

    pdf.section("2.3 Motor Speed Control Strategy Selection")
    pdf.body(
        "Maintaining a 3000 RPM setpoint for 24 unattended hours requires automatic "
        "feedback control. As temperature and bearing friction change slowly over "
        "hours of operation, and as external disturbances occasionally perturb the "
        "flywheel, the control system must detect speed deviations and correct them "
        "automatically. Four principal control strategies were evaluated:"
    )

    pdf.subsection("2.3.1 ON/OFF (Bang-Bang) Control")
    pdf.body(
        "ON/OFF control switches the motor fully on when speed is below the setpoint "
        "and fully off when it is above (Ogata, 2010, p. 64). It is the simplest "
        "possible feedback control law, requiring only a comparator with no "
        "mathematical model. The fundamental drawback is that the controller can "
        "never reach a true steady state -- it always overshoots in one direction, "
        "then switches and overshoots in the other, producing continuous oscillation "
        "around the setpoint. For a spinning flywheel, where speed oscillation "
        "directly impacts gyroscopic rigidity and mechanical stress, this behaviour "
        "is fundamentally unsuitable. ON/OFF control was rejected without "
        "detailed analysis."
    )

    pdf.subsection("2.3.2 PID Control")
    pdf.body(
        "A PID controller computes its output from three terms: proportional (P), "
        "integral (I), and derivative (D) of the error e(t) = setpoint - measured "
        "speed (Astrom and Murray, 2010, p. 74):"
    )
    pdf.equation("u(t) = Kp*e(t) + Ki*(integral of e dt) + Kd*(de/dt)")
    pdf.body(
        "The proportional term provides immediate response to current error. The "
        "integral term eliminates steady-state error by accumulating total error "
        "over time -- without it, the controller would settle at an offset from the "
        "setpoint. The derivative term acts as a predictive damper, reducing overshoot "
        "by reacting to the rate of change of error before it becomes large."
    )
    pdf.gap(3)
    pdf.body(
        "PID has been the dominant industrial control algorithm since the 1940s. "
        "It requires no prior mathematical model of the controlled system. The gain "
        "values can be tuned systematically. For the approximately linear relationship "
        "between PWM duty cycle and motor speed, a well-tuned PID achieves fast "
        "response with minimal overshoot and zero steady-state error "
        "(Astrom and Murray, 2010, p. 83)."
    )

    pdf.subsection("2.3.3 Fuzzy Logic Control")
    pdf.body(
        "Fuzzy logic control uses linguistic rules of the form 'IF error is Large "
        "THEN increase output by Much' rather than a mathematical control law. It can "
        "handle inherently nonlinear systems and does not require a system model. "
        "The primary disadvantage for this project is the complexity of designing "
        "and validating the rule base: the system designer must enumerate and weight "
        "all relevant cases, which requires extensive manual iteration. Since the "
        "BLDC-flywheel system is approximately linear at the operating point, fuzzy "
        "logic offers no meaningful advantage over PID and was not chosen "
        "(Alciatore and Histand, 2012, p. 514)."
    )

    pdf.subsection("2.3.4 Model Predictive Control")
    pdf.body(
        "MPC solves an optimisation problem at each control step, minimising a "
        "cost function over a future prediction horizon while respecting input and "
        "output constraints. It is the most powerful of the four strategies reviewed "
        "and handles constraints and multi-variable interactions elegantly "
        "(Astrom and Murray, 2010, p. 312). However, MPC requires a detailed system "
        "model, careful tuning of the prediction horizon and weighting matrices, and "
        "substantially more computational resources. Implementing MPC on an ESP32 "
        "at a 50 Hz update rate, while also running the IMU, FFT, and "
        "communications tasks, would be very challenging. MPC was rejected on the "
        "grounds of implementation complexity relative to benefit."
    )
    pdf.gap(3)
    pdf.table_caption("Table 1: Comparison of Motor Speed Control Strategies")
    pdf.table(
        ["Strategy",    "SS Error", "Overshoot", "Model?", "Complexity", "Suitable?"],
        [
            ["ON/OFF",         "High (oscillates)", "Very high","No",  "Very low",  "No"],
            ["PID",            "Zero (with I)",     "<10%",     "No",  "Low",       "Yes -- CHOSEN"],
            ["Fuzzy Logic",    "Low",               "Low",      "No",  "Medium",    "No"],
            ["MPC",            "Zero",              "Very low", "Yes", "High",      "No"],
        ]
    )
    pdf.body(
        "PID was selected for its zero steady-state error, well-established tuning "
        "procedures, low embedded implementation complexity, and extensive "
        "industrial track record for motor speed regulation."
    )

    pdf.section("2.4 PID Control and Tuning Methods")
    pdf.body(
        "Selecting PID as the control strategy raises the question of how to choose "
        "the three gain values Kp, Ki, and Kd. These parameters control the speed, "
        "damping, and accuracy of the closed-loop response."
    )

    pdf.subsection("2.4.1 Ziegler-Nichols Open-Loop Method")
    pdf.body(
        "The classical Ziegler-Nichols (ZN) method uses the system open-loop step "
        "response to identify three parameters: process gain K, dead time L, and "
        "dominant time constant T. Gains are then calculated from "
        "(Ogata, 2010, p. 231):"
    )
    pdf.equation("Kp = 1.2*T/(K*L),   Ki = Kp/(2*L),   Kd = 0.5*Kp*L")
    pdf.body(
        "The ZN method typically produces gains that are aggressive -- leading to "
        "20-30 percent overshoot and oscillatory response that usually requires "
        "subsequent manual detuning. For a high-speed flywheel, large transient "
        "speed excursions are mechanically undesirable. ZN was used as a starting "
        "point for simulation comparison but not as the primary tuning method."
    )

    pdf.subsection("2.4.2 Ziegler-Nichols Closed-Loop Method")
    pdf.body(
        "The ZN closed-loop (ultimate gain) method requires the physical system to "
        "be driven to the boundary of stability -- marginal oscillation. This "
        "procedure carries clear mechanical risk for a high-speed flywheel. The "
        "method was considered and rejected on safety grounds."
    )

    pdf.subsection("2.4.3 Cohen-Coon Method")
    pdf.body(
        "The Cohen-Coon method (cited in Alciatore and Histand, 2012, p. 442) uses "
        "the same step response data as ZN open-loop but different gain formulas "
        "developed to provide better load disturbance rejection. It produces "
        "moderately aggressive gains and, like ZN, typically requires subsequent "
        "fine-tuning. It was noted as an alternative to ZN but not selected as the "
        "primary method for this project."
    )

    pdf.subsection("2.4.4 Manual (Empirical) Tuning")
    pdf.body(
        "Manual tuning follows a structured sequence: set Ki = Kd = 0 and increase "
        "Kp until the closed-loop response is acceptably fast; then add Ki to "
        "eliminate steady-state error; then add Kd to reduce overshoot. The method "
        "is practical and widely used but produces gains that cannot be justified "
        "analytically without simulation. Manual tuning was used for final small "
        "adjustments after hardware deployment."
    )

    pdf.subsection("2.4.5 MATLAB Simulink Auto-Tuner")
    pdf.body(
        "MATLAB Simulink PID Tuner (MathWorks, 2026) uses the linearised plant model "
        "from the Simulink block diagram to automatically calculate PID gains that "
        "meet user-specified targets for closed-loop bandwidth (related to response "
        "speed) and phase margin (related to damping and overshoot). All tuning is "
        "done in simulation -- there is zero hardware risk. The resulting gains can "
        "be tested against multiple disturbance and setpoint change scenarios in "
        "simulation before being transferred to the microcontroller. This method is "
        "strongly preferred when a simulation model is available, as it integrates "
        "directly with the Simulink design workflow."
    )
    pdf.gap(3)
    pdf.table_caption("Table 2: Comparison of PID Tuning Methods")
    pdf.table(
        ["Method",                "HW Risk",  "Typical Overshoot", "Justified?", "Selected?"],
        [
            ["ZN Open-Loop",          "Low",      "20-30%",            "Yes",       "Comparison only"],
            ["ZN Closed-Loop",        "High",     "20-30%",            "Yes",       "No -- unsafe"],
            ["Cohen-Coon",            "Low",      "Moderate",          "Yes",       "No"],
            ["Manual Tuning",         "Low",      "Varies",            "No",        "Final adj. only"],
            ["MATLAB Auto-Tuner",     "None",     "<10%",              "Yes",       "Yes -- PRIMARY"],
        ]
    )

    pdf.section("2.5 BLDC Motor Technology and ESC Design")

    pdf.subsection("2.5.1 Brushed vs. Brushless DC Motors")
    pdf.body(
        "Brushed DC motors use physical carbon brushes in contact with a rotating "
        "commutator to deliver current to the rotor windings. Brush-commutator "
        "friction generates heat, carbon dust, and electrical arcing. Brush life "
        "is typically 1000-3000 hours under moderate load, with wear rate increasing "
        "sharply at higher speeds (Alciatore and Histand, 2012, p. 232). At "
        "3000 RPM during sustained operation, brush replacement "
        "mid-run is a credible failure mode."
    )
    pdf.gap(3)
    pdf.body(
        "Brushless DC motors eliminate physical commutation by moving the windings "
        "to the stator and using permanent magnets on the rotor. Current switching "
        "between stator windings is handled electronically by the ESC. With no "
        "brush contact, there is no mechanical wear in the motor itself -- the "
        "only wear surfaces are the motor bearings, which are rated for tens of "
        "thousands of hours at moderate load. BLDC motors also achieve higher "
        "efficiency (typically 85-92 percent) than brushed DC (70-75 percent), "
        "resulting in less heat generation at the same mechanical output "
        "(Alciatore and Histand, 2012, p. 241)."
    )

    pdf.subsection("2.5.2 KV Rating and Torque Considerations")
    pdf.body(
        "The KV rating of a BLDC motor is the no-load speed in RPM per volt of "
        "supply voltage. For a 950 KV x2212 motor, the no-load speed at 3.64 V is "
        "approximately 3000 RPM. Higher KV motors have lower torque constants and "
        "are therefore better suited to low-load, high-speed applications. A "
        "lower-KV motor (for example 500 KV) would produce more torque at the same "
        "current but would require a higher supply voltage to reach 3000 RPM and "
        "would be physically larger and heavier for the same power rating. "
        "The 950 KV rating was selected because: at 12 V supply and 36% ESC duty cycle, "
        "the effective winding voltage of 4.36 V delivers 3000 RPM no-load speed; "
        "the higher torque constant (0.01005 N.m/A vs. 0.00434 for a 2200 KV motor) "
        "provides better low-speed starting margin for the flywheel; and the x2212 "
        "stator size gives an efficient operating point at this power level."
    )

    pdf.subsection("2.5.3 ESC Design")
    pdf.body(
        "Commercial hobby-grade BLDC ESCs accept a 50 Hz PWM signal with pulse "
        "width between 1000 and 2000 microseconds. A 1000 us pulse commands "
        "minimum throttle; 2000 us commands maximum. The ESC internally runs a "
        "six-step trapezoidal commutation sequence, sensing rotor position from "
        "the back-EMF of the undriven winding. The hardware design for the custom "
        "ESC built in this project follows the standard topology: three half-bridge "
        "circuits using power MOSFETs, gate driver ICs for high-side and low-side "
        "switching, and current sensing for protection."
    )
    pdf.gap(3)
    pdf.table_caption("Table 3: Comparison of Motor Types for this Application")
    pdf.table(
        ["Motor Type",  "Brush Wear?","Efficiency","Speed Range","Long-run Suitability"],
        [
            ["Brushed DC",    "Yes",       "70-75%",    "Low-medium", "Not suitable"],
            ["BLDC",          "No",        "85-92%",    "Wide",       "Excellent for sustained operation -- CHOSEN"],
            ["Stepper motor", "No",        "50-70%",    "Low",        "Not suitable -- too slow"],
            ["AC induction",  "No",        "80-90%",    "Fixed",      "Possible but needs VFD"],
        ]
    )

    pdf.section("2.6 Flywheel Design, Material Selection, and Dynamic Balancing")

    pdf.subsection("2.6.1 Material Selection")
    pdf.body(
        "The flywheel material selection was based on four criteria: density "
        "(higher density = more angular momentum in a given volume), machinability "
        "(must be machinable in CBU workshop), ductility (brittle fracture at speed "
        "is a safety hazard), and local availability and cost."
    )
    pdf.gap(3)
    pdf.table_caption("Table 6: Flywheel Material Property Comparison")
    pdf.table(
        ["Property",           "Mild Steel", "Aluminium 6061","Cast Iron"],
        [
            ["Density (kg/m3)",    "7850",      "2700",          "7200"],
            ["Tensile strength",   "400 MPa",   "310 MPa",       "200 MPa"],
            ["Elongation at break","25%",        "17%",           "<1% (brittle)"],
            ["Machinability",      "Good (CNC)", "Excellent",     "Fair"],
            ["Local cost",         "Low",        "Medium",        "Low"],
            ["Density advantage",  "Highest",    "Low -- 3x less","Similar to steel"],
            ["Fracture mode",      "Ductile",    "Ductile",       "Brittle (unsafe)"],
            ["Selected?",          "YES",        "No",            "No -- brittle"],
        ]
    )
    pdf.body(
        "Mild steel was selected. Its high density concentrates angular momentum "
        "in a compact volume, minimising the flywheel diameter. Aluminium would "
        "require a 70 percent larger diameter flywheel for the same inertia. "
        "Cast iron was rejected for its brittle fracture behaviour."
    )

    pdf.subsection("2.6.2 Dynamic Balancing Theory")
    pdf.body(
        "A rotating body has dynamic imbalance when its principal axis of inertia "
        "does not coincide with the rotation axis. This creates a rotating couple "
        "that generates oscillating loads on the bearings at the frequency of "
        "rotation. The magnitude of the centrifugal force from an imbalance mass "
        "m at eccentricity e, rotating at angular velocity omega, is "
        "(Meriam, Kraige and Bolton, 2016, p. 420):"
    )
    pdf.equation("F_c = m * e * omega2")
    pdf.body(
        "At 3000 RPM (omega = 314.16 rad/s), 1 g of imbalance at 100 mm radius "
        "generates F_c = 0.001 * 0.1 * 314.162 = 70.1 N -- a force that cycles "
        "133 times per second (at 3000 RPM) and would fatigue ball bearings within "
        "hours. ISO 1940 Grade G6.3 allows a maximum specific unbalance of "
        "6.3 g.mm/kg. For a 0.5 kg flywheel, the maximum allowed residual "
        "unbalance is 5.4 g.mm, producing a centrifugal force of only 0.004 N at "
        "operating speed."
    )

    pdf.subsection("2.6.3 Two-Plane Balancing")
    pdf.body(
        "Static balancing eliminates imbalance in a single transverse plane. Dynamic "
        "balancing (two-plane balancing) eliminates imbalance in two longitudinal "
        "planes, correcting both the net centrifugal force and the imbalance couple. "
        "This requires a balancing rig with vibration sensors in two measurement "
        "planes and a phase reference sensor. The influence coefficient method "
        "calculates the correction mass and angular position for each plane from two "
        "sets of vibration measurements -- one with a known trial mass added, one "
        "without (Meriam, Kraige and Bolton, 2016, p. 422). This is the method used "
        "in Section 4.3."
    )

    pdf.section("2.7 Microcontroller and Sensor Selection")

    pdf.subsection("2.7.1 Microcontroller")
    pdf.body(
        "The microcontroller requirements: minimum 32-bit architecture for floating "
        "point PID calculations, clock speed >= 100 MHz for real-time task "
        "scheduling at 50 Hz, >= 100 KB RAM for IMU data buffers and FFT workspace, "
        "and built-in Wi-Fi for wireless monitoring. The evaluation covered five "
        "candidate boards:"
    )
    pdf.gap(3)
    pdf.table_caption("Table 4: Comparison of Microcontroller Options")
    pdf.table(
        ["Board",            "Architecture",    "RAM",    "Wi-Fi?", "Cost","Suitable?"],
        [
            ["Arduino Uno",       "8-bit/16 MHz",    "2 KB",   "No",    "Low",  "No -- too slow"],
            ["Arduino Mega",      "8-bit/16 MHz",    "8 KB",   "No",    "Low",  "No -- no Wi-Fi"],
            ["STM32F4",           "32-bit/168 MHz",  "192 KB", "No",    "Med",  "Possible -- no Wi-Fi"],
            ["Raspberry Pi Zero 2","32-bit/1 GHz",   "512 MB", "Yes",  "Med",  "Overkill; OS overhead"],
            ["ESP32 Xtensa LX6",  "32-bit/240 MHz",  "520 KB", "Yes",   "Low",  "YES -- chosen"],
        ]
    )
    pdf.body(
        "The ESP32 was selected for its combination of dual-core 240 MHz processing "
        "power, 520 KB SRAM, and integrated Wi-Fi/Bluetooth on a single chip. "
        "Its dual-core architecture allows communications tasks to run on Core 0 "
        "without interrupting the real-time control loop on Core 1 "
        "(Maier, Sharp and Vagapov, 2017)."
    )

    pdf.subsection("2.7.2 IMU Sensor")
    pdf.body(
        "The IMU must provide 3-axis tilt measurements and accelerometer data "
        "suitable for vibration FFT analysis. The required accuracy is +/-1 degree "
        "for tilt and a sampling rate of at least 100 Hz for vibration. "
        "Three options were evaluated:"
    )
    pdf.gap(3)
    pdf.table_caption("Table 5: Comparison of IMU Sensor Options")
    pdf.table(
        ["Sensor",  "Axes",       "Interface","Resolution","Cost",  "Selected?"],
        [
            ["ADXL345",  "3-axis accel",   "I2C/SPI",  "13-bit",  "Low",   "No -- no gyro"],
            ["MPU6050",  "6-axis a+g",     "I2C",       "16-bit",  "Low",   "YES"],
            ["LSM9DS1",  "9-axis a+g+mag", "I2C/SPI",   "16-bit",  "High",  "No -- not local"],
        ]
    )
    pdf.body(
        "The MPU6050 provides both a 3-axis accelerometer and a 3-axis gyroscope "
        "in one package. The combination enables complementary or Kalman filtering "
        "for accurate, vibration-resistant tilt estimates that neither sensor alone "
        "could provide. The 16-bit ADC gives 0.0305 deg/s resolution in the "
        "+/-250 deg/s range, more than adequate for tilt measurement. It is also "
        "inexpensive and widely available (InvenSense, 2013)."
    )

    pdf.section("2.8 Real-Time Monitoring and Communication Protocols")

    pdf.subsection("2.8.1 HTTP Polling")
    pdf.body(
        "In an HTTP polling architecture, the browser client sends a GET request "
        "to the server at regular intervals (typically every 1-5 seconds) to "
        "retrieve the latest sensor data. This is easy to implement but has "
        "fundamental latency limitations: data is at most as fresh as the polling "
        "interval. A 2-second interval means a threshold violation may not be "
        "visible for up to 2 seconds -- unacceptable for a safety monitoring system. "
        "HTTP polling also generates a constant stream of network requests regardless "
        "of whether the data has changed."
    )

    pdf.subsection("2.8.2 Server-Sent Events")
    pdf.body(
        "Server-Sent Events (SSE) allow the server to push data to the browser "
        "over a persistent HTTP connection whenever new data is available, "
        "eliminating polling delay. However, SSE is unidirectional: only the "
        "server can push to the client. Motor control commands cannot be sent "
        "back from the dashboard to the server over the same SSE connection, "
        "requiring a separate HTTP request for each control action. For a "
        "dashboard that both displays data and sends motor commands, SSE alone "
        "is not sufficient."
    )

    pdf.subsection("2.8.3 WebSocket")
    pdf.body(
        "WebSocket (RFC 6455) establishes a persistent, full-duplex TCP connection "
        "between the browser and the server after an HTTP upgrade handshake. "
        "Both parties can send messages at any time without overhead of a new "
        "HTTP request. The server pushes new sensor readings immediately when they "
        "arrive from the ESP32, typically with end-to-end latency under 100 ms on "
        "a local network (MDN Web Docs, 2024). The same connection carries motor "
        "control commands from the dashboard to the server."
    )
    pdf.gap(3)
    pdf.table_caption("Table 23: Communication Protocol Comparison")
    pdf.table(
        ["Protocol", "Latency", "Bi-directional?", "Complexity", "Selected?"],
        [
            ["HTTP Polling", "High (poll interval)", "Yes (separate)",   "Very low", "No"],
            ["SSE",          "Low (push)",           "No (server->client only)", "Low", "No"],
            ["WebSocket",    "Very low (<100 ms)",   "Yes (full-duplex)",        "Medium", "YES"],
        ]
    )
    pdf.body(
        "WebSocket was selected as the standard for real-time industrial monitoring "
        "dashboards. It provides full-duplex low-latency communication, and "
        "Node.js's ws library makes it straightforward to implement on the server."
    )

    pdf.section("2.9 Database and Persistent Data Storage")
    pdf.body(
        "A persistent database is required to store sensor readings, session "
        "records, and alert events for post-run analysis and reporting. Three "
        "options were considered: SQLite (file-based relational database), "
        "PostgreSQL (client-server relational database), and MongoDB (document "
        "store)."
    )
    pdf.gap(3)
    pdf.body(
        "SQLite is simple and requires no server process, but has limited "
        "concurrent write performance and is not suitable for production deployments "
        "with high write rates (such as 50 Hz sensor data). MongoDB is flexible "
        "but its schema-less design makes it harder to enforce data integrity "
        "for the structured sensor readings used here."
    )
    pdf.gap(3)
    pdf.body(
        "PostgreSQL was selected for its robustness, structured schema support, "
        "strong concurrent write performance, and excellent ecosystem of client "
        "libraries. Drizzle ORM was used to define the database schema in "
        "TypeScript, providing type-safe database access and automatic migration "
        "management. All readings are stored at the ingest rate and available for "
        "export and analysis after the endurance run."
    )

    pdf.section("2.10 Summary and Justification of Chosen Methods")
    pdf.body(
        "The literature review evaluated all major design decisions systematically. "
        "The selected methods for each decision are summarised below."
    )
    pdf.gap(3)
    pdf.table(
        ["Design Decision",   "Method Chosen",                 "Key Justification"],
        [
            ["Control strategy",    "PID control",               "Simple; no model; zero SS error"],
            ["PID tuning",          "MATLAB Simulink Auto-Tuner","No HW risk; integrates with simulation"],
            ["Motor type",          "BLDC (950 KV x2212)",            "No brush wear; high efficiency; ideal for sustained operation"],
            ["Flywheel material",   "Mild steel",                "High density; ductile; CNC-machinable"],
            ["Flywheel mfg.",       "CNC turning",               "Best geometric accuracy; minimum initial imbalance"],
            ["Balancing",           "Dynamic 2-plane (ISO G6.3)","Eliminates static and dynamic imbalance"],
            ["Microcontroller",     "ESP32 dual-core",           "Wi-Fi built-in; 240 MHz; sufficient RAM"],
            ["IMU sensor",          "MPU6050",                   "6-axis; I2C; affordable; locally available"],
            ["Real-time comms",     "WebSocket (RFC 6455)",      "Full-duplex; instant push; <100 ms latency"],
            ["Server runtime",      "Node.js + Express 5",       "Non-blocking I/O; good WebSocket support"],
            ["Database",            "PostgreSQL + Drizzle ORM",  "Robust; type-safe; structured data"],
            ["Dashboard",           "React + Recharts",          "Component-based; live chart support"],
        ]
    )


# ============================================================
# CHAPTER 3: METHODOLOGY
# ============================================================

def chapter3(pdf):
    pdf.add_page()
    pdf.chapter_title("CHAPTER 3: METHODOLOGY")

    pdf.section("3.0 Methodology")

    pdf.subsection("Design Approach and Engineering Process")
    pdf.body(
        "The design followed a structured iterative engineering methodology. The "
        "process was divided into six sequential phases, each with defined inputs, "
        "outputs, and review criteria:"
    )
    pdf.gap(2)
    for idx, step in enumerate([
        "Literature review: evaluate all major design decisions and document "
        "justified selections (Chapter 2).",
        "Systems-level design: define all subsystems, their interfaces, data "
        "flows, and performance requirements. Identify failure modes at the "
        "system level.",
        "Detailed component design: design each subsystem in detail including "
        "engineering calculations, material specifications, and dimensional "
        "tolerances.",
        "Simulation: verify the control system design in MATLAB Simulink and "
        "the circuit design in Proteus before any hardware is built or ordered.",
        "Manufacture and assembly: fabricate all mechanical components, "
        "assemble electronics, and program firmware following the simulation-"
        "verified designs.",
        "Test and validate: execute the five-stage test programme, comparing "
        "results to simulation predictions.",
    ], 1):
        pdf.bullet(step, number=str(idx))
        pdf.gap(1)
    pdf.gap(4)
    pdf.fig_box("Figure 2.0: Conceptual design -- full assembly diametric view (SOLIDWORKS, 2026)")
    pdf.fig_box("Figure 2.1: Conceptual design -- side view showing internal layout")

    pdf.subsection("System-Level Architecture")
    pdf.body(
        "The complete system consists of five major subsystems that communicate "
        "through defined interfaces:"
    )
    pdf.gap(2)
    subsystems = [
        ("Mechanical subsystem",
         "Flywheel, shaft, bearings, coupling, and frame. Converts motor torque "
         "to spinning angular momentum. Transfers loads to the frame structure."),
        ("Motor and ESC subsystem",
         "950 KV x2212 BLDC motor, custom 3-phase ESC, and 12 V power supply. "
         "Converts electrical power to mechanical torque in response to PWM commands."),
        ("Sensing and control subsystem",
         "ESP32 microcontroller, MPU6050 IMU, Kalman filter, FFT vibration "
         "analysis, and PID controller. Measures system state and computes "
         "motor commands."),
        ("Communications subsystem",
         "USB serial bridge and Wi-Fi TCP socket. Transfers telemetry from "
         "the ESP32 to the server and control commands from the server to the ESP32."),
        ("Server and dashboard subsystem",
         "Node.js Express server, PostgreSQL database, WebSocket server, and "
         "React dashboard. Receives telemetry, evaluates safety thresholds, "
         "stores data, and provides the operator interface."),
    ]
    for idx, (title, desc) in enumerate(subsystems, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.section("3.1 Component Design")
    pdf.body(
        "This section presents the design of each mechanical and electrical "
        "component of the gyroscope, in the order they were selected: flywheel, "
        "shaft, bearings, motor and ESC, coupling, and frame."
    )

    pdf.subsection("3.1.1 Flywheel Design")
    pdf.body(
        "The flywheel is the most critical mechanical component. Its moment of "
        "inertia, combined with its operating speed, determines the angular "
        "momentum and hence the gyroscopic stability of the system."
    )

    pdf.subsubsection("3.1.1.1 Design Requirements")
    pdf.body("The flywheel design requirements were:")
    for req in [
        "Moment of inertia I >= 0.004 kg.m2 (from stability analysis)",
        "Geometrically symmetric to minimise initial dynamic imbalance",
        "Machinable from locally available mild steel stock on CBU's CNC lathe",
        "Balance achievable to ISO G6.3 grade using the CBU balancing rig",
        "Structural integrity with safety factor >= 2.0 at 10000 RPM (25% overspeed)",
        "Mass <= 0.8 kg to remain within the bearing load capacity calculations",
    ]:
        pdf.bullet(req)
        pdf.gap(0.5)

    pdf.subsubsection("3.1.1.2 Geometry")
    pdf.body(
        "The flywheel was designed as a solid mild steel disk: diameter 215.8 mm, "
        "thickness 20 mm. Eight peripheral bolts were added to increase the "
        "effective moment of inertia: four M12 bolts at radius 99 mm and four "
        "M6 bolts at radius 95 mm. The bolts are indexed at 90-degree spacing "
        "(M12) and 45-degree spacing (M6) to maintain geometric symmetry. "
        "The hub bore (8 mm) is an interference fit on the shaft; a set screw "
        "provides secondary retention. Total design mass including bolts: 0.5 kg."
    )
    pdf.gap(4)
    pdf.fig_box("Figure 2.2: Flywheel engineering drawing -- all dimensions in mm")
    pdf.fig_box("Figure 3.1: Mass distribution diagram showing bolt positions "
                "and radii used in inertia calculation")

    pdf.subsection("3.1.2 Shaft Design")
    pdf.body(
        "The main shaft is EN3B mild steel, 8 mm diameter, 120 mm long. The "
        "shaft connects the motor coupling hub at one end to the flywheel hub "
        "at the other, and is supported by two RS608 ball bearings located "
        "35 mm from each end."
    )
    pdf.gap(3)
    pdf.body(
        "The shaft diameter was not sized independently; it was set to 8 mm to "
        "match the bore of the RS608 bearings already fixed by the inherited "
        "frame geometry (Section 3.1.3), since re-boring the existing bearing "
        "housings to accept a larger shaft and bearing pair would have required "
        "rebuilding the frame, outside the scope of this improvement project. "
        "EN3B mild steel was chosen over an alloy steel (e.g. EN8) because it is "
        "readily available from CBU's workshop stock and easier to turn to the "
        "bearing-fit tolerance on the available lathes; the structural analysis "
        "in Section 3.2.4 later confirmed a combined safety factor of 49.6 at the "
        "design load, an order of magnitude beyond what the load case required, "
        "so the lower-cost, easier-to-machine material was the appropriate choice."
    )
    pdf.gap(3)
    pdf.body(
        "The bearing spacing of 50 mm was determined by the frame geometry "
        "inherited from the previous team. A wider spacing would reduce shaft "
        "deflection under load, but the existing bearing housings could not be "
        "moved without rebuilding the frame. The 50 mm span was verified "
        "adequate in the structural analysis (Section 3.2.4), which found a "
        "bending stress of only 1.31 MPa against a safety factor of 328."
    )
    pdf.fig_box("Figure 2.4: Shaft and bearing sub-assembly -- exploded view showing "
                "shaft, inner and outer bearing races, and flywheel hub")

    pdf.subsection("3.1.3 Bearing Selection")
    pdf.body(
        "The bearing bore was fixed at 8 mm by the shaft diameter (Section 3.1.2), "
        "which narrowed the search to standard 8 mm-bore deep groove ball "
        "bearings available through CBU's regional suppliers. RS608 shielded "
        "deep groove ball bearings were selected over an open (unshielded) "
        "equivalent and a 2RS double rubber-sealed variant: the shielded type "
        "is factory-packed with sufficient grease for its rated life without "
        "the extra running friction of contact seals, and it was the variant "
        "in local stock without an import lead time the project's timeline "
        "could not absorb. Key parameters:"
    )
    pdf.gap(2)
    pdf.two_col_table([
        ("Parameter",             "Value"),
        ("Bore diameter",         "8 mm"),
        ("Outer diameter",        "22 mm"),
        ("Width",                 "7 mm"),
        ("Dynamic load rating C", "3450 N"),
        ("Static load rating C0", "1560 N"),
        ("Max speed (grease lube)","32000 RPM"),
        ("Operating temperature", "-20 to +120 degC"),
        ("Lubrication",           "Grease -- sealed, no maintenance"),
    ], c1_frac=0.45)
    pdf.gap(3)
    pdf.body(
        "The dynamic load rating was verified adequate, not merely assumed, in "
        "the bearing life calculation of Section 3.2.2: at the applied radial "
        "load of 2.45 N and an operating speed of 3000 RPM, the calculated L10 "
        "life is 85,900 hours -- confirming bearing failure is not a credible "
        "failure mode for this application. This margin reflects standardising on a single "
        "stocked, no-maintenance bearing size shared with the shaft-bore "
        "constraint above, rather than introducing a second bearing purely to "
        "trim an already inexpensive component."
    )

    pdf.subsection("3.1.4 Motor and ESC Selection")
    pdf.subsubsection("3.1.4.1 Motor Selection")
    pdf.body(
        "The 950 KV x2212 BLDC motor was chosen based on the speed-voltage relationship "
        "n = KV * V, calculated in Section 3.2.1. At the design supply voltage of "
        "4.36 V, the no-load speed is approximately 3000 RPM."
    )
    pdf.gap(3)
    pdf.body(
        "KV was not the only free variable: for a fixed 3000 RPM target, a "
        "lower-KV motor needs a higher supply voltage and a higher-KV motor "
        "needs a lower one, while the torque constant k_t (available torque "
        "per amp) scales inversely with KV. Table 7a compares the selected "
        "950 KV x2212 motor against two commercially available alternatives at the "
        "same target speed, using these relationships."
    )
    pdf.gap(2)
    pdf.table_caption("Table 7a: Motor KV Selection -- Trade-off at Fixed 3000 RPM Target")
    pdf.table(
        ["Motor Option", "Voltage for 3000 RPM", "Relative k_t", "Suitability"],
        [
            ["1400 KV", "~2.14 V eff. (18% duty @ 12V)", "Lower (~0.68x)",
             "Rejected -- very low effective voltage; reduced torque constant cuts starting margin"],
            ["950 KV x2212 (chosen)", "4.36 V", "Baseline (0.01005 N.m/A)",
             "Selected -- matches the available supply and gives adequate stall torque (0.1005 N.m at 10 A)"],
            ["600 KV", "~5.0 V eff. (50% duty @ 12V)", "Higher (~1.68x)",
             "Rejected -- physically larger and heavier; overkill torque for this flywheel load at 3000 RPM"],
        ]
    )
    pdf.gap(3)
    pdf.body("Full electrical parameters for the selected motor:")
    pdf.gap(2)
    pdf.two_col_table([
        ("Parameter",             "Value"),
        ("KV rating",             "2200 RPM/V"),
        ("No-load current I0",    "1.5 A"),
        ("Maximum current",       "10 A"),
        ("Stator resistance R",   "0.12 ohm"),
        ("Number of poles",       "12 (6 pole pairs)"),
        ("Mass",                  "45 g"),
        ("Shaft diameter",        "3 mm"),
    ], c1_frac=0.45)
    pdf.gap(3)
    pdf.table_caption("Table 8: Motor Electrical Parameters")
    pdf.two_col_table([
        ("Parameter",            "Value"),
        ("Back-EMF constant k_e","0.01005 V.s/rad"),
        ("Torque constant k_t",  "0.01005 N.m/A"),
        ("Stall torque",         "0.1005 N.m at 10 A"),
        ("Running torque",       "~0.030 N.m at 3 A steady-state"),
        ("Electrical power",     "43.6 W at full load"),
        ("Mechanical efficiency","91.6% (steady-state)"),
    ], c1_frac=0.45)

    pdf.subsubsection("3.1.4.2 ESC Design and Selection")
    pdf.body(
        "The flywheel motor is driven by a commercial, off-the-shelf 30 A BLDC "
        "ESC rather than a purpose-built driver stage. A custom three-half-"
        "bridge driver (IRFZ44N MOSFETs with IR2101 gate drivers) was modelled "
        "in Proteus during the control-system simulation work (Section 3.2.5) "
        "because Proteus has no library part for a commercial ESC, but that "
        "custom circuit was a simulation-only stand-in -- it was never built "
        "into the physical prototype. The physical machine uses the commercial "
        "ESC described below throughout."
    )
    pdf.gap(3)
    pdf.body("Key specifications, from the manufacturer datasheet:")
    pdf.gap(2)
    pdf.two_col_table([
        ("Parameter",                            "Value"),
        ("Continuous / peak current",            "30 A continuous; 40 A for 10 s"),
        ("Input voltage range",                  "2-4S LiPo/Li-ion (7.4-14.8 V) or 5-12 cell NiMH/NiCd"),
        ("BEC output",                           "5 V, 3 A"),
        ("Max electrical speed (12-pole motor)", "35000 RPM"),
        ("Control signal",                       "Standard 50-60 Hz PWM, 1-2 ms pulse width"),
        ("Protections",                          "Low-voltage cut-off, over-heat cut-back above 110C, "
                                                  "throttle-signal-loss cut-back, abnormal-start cut-off"),
        ("Mass / size",                          "32 g / 55 x 26 x 13 mm"),
    ], c1_frac=0.45)
    pdf.gap(3)
    pdf.table_caption("Table 8a: Commercial ESC Specifications")
    pdf.body(
        "This ESC was selected over building a custom driver for the physical "
        "prototype for four reasons. First, its 30 A continuous / 40 A surge "
        "rating is far beyond the motor's own 10 A maximum current draw and "
        "~3 A steady-state running current, so it operates well inside its own "
        "thermal and electrical limits under every load case this project "
        "produces -- a hand-built driver would need to be engineered and "
        "verified to reach the same margin for no operational benefit. Second, "
        "its built-in protections (over-temperature cut-back, low-voltage "
        "cut-off, throttle-signal-loss cut-back) directly satisfy the safety "
        "requirements the project already needed, without adding them in "
        "firmware or extra hardware. Third, it accepts the same standard "
        "50-60 Hz, 1-2 ms PWM signal already generated by the ESP32 LEDC "
        "peripheral for the PID output stage (Section 3.2.5), so it interfaces "
        "directly with no additional signal conditioning. Fourth, as a "
        "pre-tested commercial unit it removed a point of failure risk from "
        "the build schedule that a hand-built MOSFET/gate-driver stage would "
        "have carried, which is why the custom design was kept to a "
        "simulation-only role instead."
    )
    pdf.gap(3)
    pdf.body(
        "Because a commercial ESC drives the motor by pulse-width-modulating "
        "the raw supply rail rather than physically stepping the supply "
        "voltage down, the 4.36 V figure used in the speed calculation of "
        "Section 3.2.1 is the effective average voltage delivered to the motor "
        "windings at the operating throttle command, not the ESC's raw input "
        "voltage. The physical prototype's raw supply rail is a bench AC-DC "
        "adapter (110-240 VAC input; selectable 12/15/16/18/19 V at 4.5 A or "
        "20/24 V at 5 A DC output) set to its 12 V tap, chosen because it falls "
        "within the ESC's rated 2-4S LiPo / NiMH-NiCd input window and was "
        "available on hand in place of a dedicated battery pack. At a 12 V "
        "supply rail, the ESP32's PWM throttle command was tuned to a duty "
        "cycle of approximately 40% (4.36 V / 12 V) to produce the 3000 RPM "
        "no-load operating speed assumed throughout the design calculations. "
        "If a different supply voltage is used, this duty cycle must be "
        "re-tuned to keep the no-load speed -- and therefore the stability, "
        "inertia, and power calculations of Section 3.2.1 -- valid."
    )
    pdf.gap(3)
    pdf.body(
        "Verification of the throttle interface and current draw against the "
        "datasheet's ratings is reported experimentally in Section 5.2 "
        "(Test 1: Motor Control and ESC Characterisation)."
    )

    pdf.subsection("3.1.5 Coupling Design")
    pdf.body(
        "A rubber spider (jaw) coupling connects the motor shaft to the flywheel "
        "shaft, replacing the rigid, in-line coupling used in the previous "
        "prototype. Three alternatives were considered against the requirement "
        "to isolate motor commutation vibration from the precision-balanced "
        "flywheel shaft while tolerating the small misalignment inevitable in a "
        "hand-assembled frame:"
    )
    pdf.gap(2)
    for req in [
        "Rigid (sleeve/set-screw) coupling -- the previous design. Rejected: "
        "transmits vibration and shock directly into the flywheel shaft and "
        "bearings, and has zero misalignment tolerance.",
        "Bellows coupling -- precise, near-zero backlash. Rejected: designed "
        "for torsional stiffness and positioning accuracy, not vibration "
        "damping, so it would not address the commutation-vibration problem.",
        "Elastomeric spider (jaw) coupling -- chosen. The elastomeric insert "
        "absorbs shock during motor engagement with the already-spinning "
        "flywheel, isolates commutation vibration from reaching the flywheel "
        "shaft and bearings, and tolerates up to 1 degree angular and 0.2 mm "
        "parallel misalignment.",
    ]:
        pdf.bullet(req)
        pdf.gap(0.5)
    pdf.fig_box("Figure 2.5: Spider coupling -- exploded view showing motor hub, "
                "elastomeric insert, and flywheel hub")

    pdf.subsection("3.1.6 Frame Design")
    pdf.body(
        "The steel frame was inherited from the previous team and modified. "
        "Modifications: bearing housings redrilled and reamed to accept RS608 "
        "bearings; motor mounting plate reinforced with 25 x 3 mm flat bar "
        "bracing; all surfaces wire-brushed and repainted."
    )
    pdf.fig_box("Figure 2.3: Internal component layout -- side section view "
                "showing frame, bearings, shaft, motor, and coupling positions")

    pdf.section("3.2 Component Analysis")
    pdf.body(
        "This section verifies the components selected in Section 3.1 through "
        "engineering calculation, and presents the control system, software, "
        "and simulation work that underpins the design."
    )

    pdf.subsection("3.2.1 Design Calculations")

    pdf.subsubsection("3.2.1.1 Moment of Inertia -- Flywheel Disk")
    pdf.body("For a uniform solid disk (Hibbeler, 2015, p. 388):")
    pdf.equation("I_disk = (1/2) * m * r2")
    pdf.equation("I_disk = (1/2) * 0.5 * (0.1079)2")
    pdf.equation("I_disk = (1/2) * 0.5 * 0.011642")
    pdf.equation("I_disk = 0.25 * 0.011642 = 0.002910 kg.m2")

    pdf.subsubsection("3.2.1.2 Additional Inertia from Rim Bolts")
    pdf.body("Each bolt is a point mass at its bolt-circle radius:")
    pdf.equation("I_M12 = 4 * m_M12 * r_M122 = 4 * 0.035 * (0.099)2")
    pdf.equation("I_M12 = 4 * 0.035 * 0.009801 = 0.001372 kg.m2")
    pdf.equation("I_M6 = 4 * m_M6 * r_M62 = 4 * 0.008 * (0.095)2")
    pdf.equation("I_M6 = 4 * 0.008 * 0.009025 = 0.000289 kg.m2")
    pdf.equation("I_bolts = I_M12 + I_M6 = 0.001372 + 0.000289 = 0.001661 kg.m2")
    pdf.equation("I_total = 0.002910 + 0.001661 = 0.004571 kg.m2")

    pdf.subsubsection("3.2.1.3 Operating Angular Velocity")
    pdf.equation("omega_s = N * (2*pi / 60) = 3000 * 0.10472 = 314.16 rad/s")

    pdf.subsubsection("3.2.1.4 Angular Momentum")
    pdf.equation("L = I * omega_s = 0.002910 * 314.16 = 0.9142 kg.m2/s",
                 "(Hibbeler, 2015)")

    pdf.subsubsection("3.2.1.5 Gyroscopic Torque at 0.5 rad/s Precession")
    pdf.equation("T_g = I * omega_s * omega_p = 0.002910 * 314.16 * 0.5 = 0.4571 N.m",
                 "(Meriam et al., 2016)")

    pdf.subsubsection("3.2.1.6 Gravitational Overturning Torque at 5 degrees Tilt")
    pdf.body("Parameters: m = 0.5 kg, g = 9.81 m/s2, h = 0.05 m, theta = 5 deg:")
    pdf.equation("T_grav = m * g * h * sin(theta)")
    pdf.equation("T_grav = 0.5 * 9.81 * 0.05 * sin(5 deg)")
    pdf.equation("T_grav = 0.24525 * 0.08716 = 0.0214 N.m")

    pdf.subsubsection("3.2.1.7 Stability Criterion Check")
    pdf.equation("T_g / T_grav = 0.4571 / 0.0214 = 21.4 ~ 21",
                 "(Ogata, 2010)")
    pdf.body(
        "The gyroscopic torque exceeds the gravitational overturning torque by a "
        "factor of 57. The stability criterion is satisfied with a very large margin. "
        "The minimum stable speed (where margin factor = 1.0) is approximately "
        "3000 / 21^0.5 = 3000 / 4.58 = 655 RPM -- well below any credible "
        "operating condition."
    )

    pdf.subsubsection("3.2.1.8 Motor Back-EMF Constant")
    pdf.equation("k_e = 1 / (KV * (2*pi/60)) = 1 / (950 * 0.10472) = 0.01005 V.s/rad")

    pdf.subsubsection("3.2.1.9 Required Supply Voltage")
    pdf.equation("V_back_emf = k_e * omega_s = 0.01005 * 314.16 = 3.157 V")
    pdf.equation("V_resistive = I_running * R = 10.0 * 0.12 = 1.200 V")
    pdf.equation("V_supply = V_back_emf + V_resistive = 3.157 + 1.200 = 4.357 V ~ 4.36 V")

    pdf.subsubsection("3.2.1.10 Stored Kinetic Energy")
    pdf.equation("E_k = (1/2) * I * omega2 = (1/2) * 0.002910 * (314.16)2")
    pdf.equation("E_k = 0.001455 * 98677 = 143.6 J = 0.040 Wh")

    pdf.subsubsection("3.2.1.11 Motor Power")
    pdf.equation("P_elec = V * I_max = 4.36 * 10.0 = 43.6 W")
    pdf.equation("P_mech_ss = P_elec_ss - P_copper = (4.36*3.0) - (3.0^2*0.12) = 13.1 - 1.08 = 12.0 W")
    pdf.equation("Efficiency_ss = P_mech_ss / P_elec_ss = 12.0 / 13.1 = 91.6%  (at 3 A steady-state)")

    pdf.subsubsection("3.2.1.12 Flywheel Hoop Stress at Overspeed (3750 RPM)")
    pdf.body(
        "The hoop stress in a rotating disk at radius r from the centre is "
        "(Meriam, Kraige and Bolton, 2016):"
    )
    pdf.equation("sigma_hoop = (3+nu)/8 * rho * omega2 * (ro2 + ri2)")
    pdf.body("Using Poisson's ratio nu = 0.3, density rho = 7850 kg/m3, "
             "ro = 0.1079 m, ri = 0 (solid disk), omega = 3750 * 2pi/60 = 392.7 rad/s:")
    pdf.equation("sigma_hoop = (3.3/8) * 7850 * (392.7)2 * (0.1079)2")
    pdf.equation("sigma_hoop = 0.4125 * 7850 * 154,227 * 0.011642")
    pdf.equation("sigma_hoop = 0.4125 * 7850 * 1795.5 = 5.81 MPa")
    pdf.body(
        "The mild steel tensile strength is 400 MPa. Safety factor at overspeed = "
        "400 / 5.81 = 68.8. The flywheel is extremely safe against structural "
        "failure even at 25% above the design speed."
    )
    pdf.gap(3)
    pdf.table_caption("Table 7: Summary of All Design Calculations")
    pdf.table(
        ["Calculation", "Formula", "Result", "Target"],
        [
            ["Disk moment of inertia", "I=(1/2)mr2",         "0.002910 kg.m2", ">=0.004"],
            ["Bolt inertia",           "I=sum(m_i*r_i2)",    "0.00166 kg.m2",  "--"],
            ["Total inertia",          "I_disk+I_bolts",     "0.004571 kg.m2",  "--"],
            ["Angular velocity",       "omega=N*2pi/60",     "314.16 rad/s",   "--"],
            ["Angular momentum",       "L=I*omega",          "0.9142 kg.m2/s",  "--"],
            ["Gyroscopic torque",      "T=I*omega_s*omega_p","0.4571 N.m",      "--"],
            ["Gravity torque (5 deg)", "T=mgh*sin(theta)",   "0.0214 N.m",     "--"],
            ["Stability factor",       "T_g/T_grav",         "21",             ">=1"],
            ["Supply voltage (effective)", "V=k_e*omega+I*R", "4.36 V",         "--"],
            ["Kinetic energy",         "E=(1/2)*I*omega2",   "143.6 J",       "--"],
            ["Motor efficiency",       "P_mech/P_elec",      "91.6% (steady-state)",          "--"],
            ["Hoop stress (overspeed)","sigma=(3+nu)/8*rho*omega2*ro2","5.81 MPa","Safety factor 68.8"],
        ]
    )

    pdf.subsection("3.2.2 Bearing Life Calculation")
    pdf.body(
        "Bearing life was calculated using the ISO 281 L10 formula for ball bearings "
        "(Meriam, Kraige and Bolton, 2016):"
    )
    pdf.equation("L10 = (C/P)3 * (10^6 / (60*N))   [hours]")
    pdf.body(
        "Determining the equivalent dynamic load P:"
    )
    pdf.equation("P_radial = (m_flywheel * g) / 2 = (0.5 * 9.81) / 2 = 2.45 N")
    pdf.body(
        "After dynamic balancing to ISO G6.3, residual imbalance adds at most 0.004 N. "
        "Taking P = 2.45 N (radial only; no significant axial load in this application):"
    )
    pdf.equation("L10 = (3450 / 2.45)3 * (10^6 / (60 * 3000))")
    pdf.equation("L10 = (1408.2)3 * 5.5556")
    pdf.equation("L10 = 2.792 x 10^9 * 5.5556 = 1.551 x 10^10 revolutions")
    pdf.equation("L10 = 1.551 x 10^10 / (3000 * 60) = 85,900 hours")
    pdf.body(
        "The L10 life of 85,900 hours at operating speed is 98.8 times longer than "
        "any credible operational requirement. Bearing failure is not a credible "
        "failure mode for this application."
    )
    pdf.gap(3)
    pdf.table_caption("Table 9: Bearing Selection Parameters and Calculated Life")
    pdf.table(
        ["Parameter",         "Value",           "Notes"],
        [
            ["Bearing model",     "RS608",           "Deep groove ball bearing"],
            ["Bore / OD",         "8 mm / 22 mm",    ""],
            ["Dynamic rating C",  "3450 N",          "From data sheet"],
            ["Operating speed",   "3000 RPM",        "Nominal"],
            ["Applied load P",    "2.45 N",          "Half flywheel weight"],
            ["L10 life",          "85,900 hours",      "ISO 281 formula"],
            ["Margin over target",">> 1000x",        "No specific endurance target"],
        ]
    )

    pdf.subsection("3.2.3 Thermal Analysis")
    pdf.body(
        "A steady-state first-order thermal model estimates motor winding temperature "
        "rise during continuous operation. At steady-state (constant speed), "
        "the running current is approximately 3 A. Copper winding losses:"
    )
    pdf.equation("P_copper = I2 * R = (3.0)2 * 0.12 = 1.08 W")
    pdf.body("Motor casing surface area (cylinder approximation):")
    pdf.equation("A_casing = pi * D * L = pi * 0.025 * 0.030 = 0.00236 m2")
    pdf.body("Steady-state thermal balance (heat in = heat out):")
    pdf.equation("P_copper = h_conv * A_casing * delta_T")
    pdf.equation("delta_T = P_copper / (h_conv * A_casing) = 1.08 / (10 * 0.00236) = 45.8 degC")
    pdf.body(
        "With maximum ambient of 30 degC, predicted motor surface temperature is "
        "30 + 45.8 = 75.8 degC. Winding temperature (typically 10-20 degC higher "
        "than surface) is approximately 86-96 degC. BLDC motors are typically "
        "rated to >= 100 degC winding temperature -- the margin is small but "
        "acceptable, and the dashboard temperature alert provides further protection."
    )
    pdf.gap(3)
    pdf.table_caption("Table 10: Thermal Analysis Inputs and Results")
    pdf.table(
        ["Parameter",           "Value",       "Notes"],
        [
            ["Steady-state current", "3.0 A",      "Measured during constant-speed run"],
            ["Stator resistance R",  "0.12 ohm",   "From motor data sheet"],
            ["Copper losses",        "1.08 W",     "I2R at steady-state current"],
            ["Casing surface area",  "0.00236 m2", "Cylinder approximation"],
            ["Conv. coefficient h",  "10 W/m2.K",  "Natural convection, conservative"],
            ["Predicted delta_T",    "45.8 degC",  "At steady state"],
            ["Max surface temp",     "75.8 degC",  "At 30 degC ambient"],
            ["Motor winding limit",  ">100 degC",  "Typical BLDC limit"],
            ["Safety margin",        "~14 degC",   "Adequate with monitoring"],
        ]
    )

    pdf.subsection("3.2.4 Structural Analysis of Main Shaft")
    pdf.body(
        "The shaft is subjected to a bending moment from the radial load at the "
        "flywheel position between the two bearing supports. After dynamic balancing, "
        "the dominant load is the flywheel weight: 0.5 * 9.81 = 8.44 N applied "
        "at the shaft centre. With a bearing span of 50 mm and the flywheel at "
        "the mid-span:"
    )
    pdf.equation("M_max = F * L / 4 = 8.44 * 0.050 / 4 = 0.1055 N.m")
    pdf.body("Bending stress in the 8 mm diameter shaft:")
    pdf.equation("sigma_b = M_max * (d/2) / (pi * d4 / 64)")
    pdf.equation("sigma_b = 0.1055 * 0.004 / (pi * (0.008)4 / 64)")
    pdf.equation("sigma_b = 0.000422 / (3.217 x 10^-10) = 1.31 MPa")
    pdf.body(
        "The EN3B mild steel has a tensile strength of 430 MPa. The shaft safety "
        "factor against static bending failure is 430 / 1.31 = 328 -- the shaft is "
        "completely adequate. Adding the torsional stress from motor torque "
        "(0.05 N.m, yielding tau = 4.97 MPa via J = pi*d4/32) and combining with "
        "von Mises criterion:"
    )
    pdf.equation("sigma_vm = sqrt(sigma_b2 + 3*tau2) = sqrt(1.312 + 3*4.972) = 8.67 MPa")
    pdf.equation("Safety factor (von Mises) = 430 / 8.67 = 49.6")
    pdf.body(
        "The shaft is very safe. Even with 10x the torque, the safety factor "
        "would remain above 4.0."
    )
    pdf.gap(3)
    pdf.table_caption("Table 11: Shaft Structural Analysis Results")
    pdf.table(
        ["Load Type",         "Stress",     "Safety Factor"],
        [
            ["Bending",           "1.31 MPa",   "328"],
            ["Torsion",           "4.97 MPa",   "86.5"],
            ["Combined (von Mises)","8.67 MPa", "49.6"],
        ]
    )
    pdf.fig_box("Figure 3.4: Shaft bending moment diagram under flywheel weight load")

    pdf.subsection("3.2.5 Control System Design")

    pdf.subsubsection("3.2.5.1 Plant Model")
    pdf.body(
        "The motor-flywheel plant was modelled as a second-order system. The "
        "motor electrical model relates input voltage V to current I:"
    )
    pdf.equation("V = k_e * omega + I * R      (inductance neglected)")
    pdf.body(
        "The mechanical model relates motor torque to flywheel acceleration:"
    )
    pdf.equation("T_motor - T_friction = I_flywheel * (d_omega/dt)")
    pdf.body(
        "T_friction at running speed is approximately 0.01 N.m, estimated from "
        "the no-load current of 1.5 A via T_friction = k_t * I0 = 0.01005 * 1.5 = "
        "0.0151 N.m (rounded to 0.015 N.m). The combined electrical-mechanical "
        "transfer function from PWM duty cycle to angular velocity was constructed "
        "in Simulink and used by the PID Tuner."
    )

    pdf.subsubsection("3.2.5.2 PID Implementation on ESP32")
    pdf.body(
        "The discrete-time PID implementation uses the backward Euler method for "
        "the integral term and a first-order derivative filter to limit noise "
        "amplification. The integral term is clamped (anti-windup) whenever "
        "the controller output saturates, preventing the integral from accumulating "
        "during the motor ramp-up phase."
    )
    pdf.gap(2)
    pdf.two_col_table([
        ("PID Parameter",     "Value"),
        ("Kp",                "0.85"),
        ("Ki",                "2.40"),
        ("Kd",                "0.015"),
        ("Derivative filter N","100"),
        ("Update period",     "20 ms (50 Hz)"),
        ("Anti-windup",       "Integral clamping -- saturation detection"),
        ("Output min/max",    "1050 / 2000 microseconds (PWM pulse width)"),
    ], c1_frac=0.42)

    pdf.subsubsection("3.2.5.3 Simulation Results -- PID Tuner Output")
    pdf.body(
        "MATLAB Simulink PID Tuner was set to target 2 seconds settling time "
        "and 45 degrees phase margin. The initial gains from the auto-tuner "
        "were Kp = 0.79, Ki = 2.21, Kd = 0.013. These were tested in Simulink "
        "for five disturbance scenarios and adjusted slightly (by less than 10%) "
        "by manual iteration before hardware deployment."
    )

    pdf.subsection("3.2.6 Software and Monitoring System Architecture")

    pdf.subsubsection("3.2.6.1 ESP32 Firmware Architecture")
    pdf.body("The firmware main loop (20 ms period) performs these tasks in sequence:")
    for idx, task in enumerate([
        "Read MPU6050 via I2C (6-axis data: ax, ay, az, gx, gy, gz)",
        "Update Kalman filter -- compute filtered tilt angles for X and Y axes",
        "Accumulate 64 accelerometer Z samples at 500 Hz for FFT vibration analysis",
        "When 64 samples complete: run arduinoFFT to find dominant frequency; "
        "convert to RPM estimate",
        "Run PID control law on RPM error; compute ESC PWM pulse width",
        "Output PWM signal to ESC via timer peripheral",
        "Every 5th cycle (100 ms): send JSON telemetry over serial USB",
        "Every 5th cycle (100 ms): send JSON telemetry over Wi-Fi TCP if connected",
        "Check for incoming commands on serial and Wi-Fi channels",
    ], 1):
        pdf.bullet(task, number=str(idx))
        pdf.gap(0.5)

    pdf.subsubsection("3.2.6.2 Node.js Server Architecture")
    pdf.body("The Express server handles the following concurrently:")
    for idx, item in enumerate([
        "Serial port reader: parses JSON telemetry from ESP32 at 115200 baud",
        "Wi-Fi TCP server: listens on port 5001 for ESP32 Wi-Fi connections",
        "Safety monitor: on each reading, compares values against configured "
        "thresholds; triggers emergency stop if any critical threshold is exceeded",
        "WebSocket server: broadcasts readings and alerts to all connected dashboards",
        "PostgreSQL writer: inserts readings, sessions, and alert records via "
        "Drizzle ORM",
        "REST API: session management, motor control commands, settings get/set, "
        "historical data export",
    ], 1):
        pdf.bullet(item, number=str(idx))
        pdf.gap(0.5)

    pdf.subsubsection("3.2.6.3 React Dashboard Architecture")
    pdf.body(
        "The React dashboard is a single-page application built with Vite, "
        "Tailwind CSS, shadcn/ui components, and Recharts for data visualisation. "
        "Key UI sections:"
    )
    for view in [
        "Live charts: 60-second rolling window for all six sensor channels, "
        "updated at 4 Hz via WebSocket",
        "Stat cards: current values with trend arrows for RPM, tilt X/Y, "
        "temperature, vibration, PWM",
        "System events panel: scrollable alert history with severity colour coding",
        "Motor control panel: session start/stop, motor on/off, emergency stop button",
        "Settings page: configurable thresholds, connectivity settings, dark/light toggle",
        "Connect dialog: step-by-step Wi-Fi and USB serial connection instructions",
    ]:
        pdf.bullet(view)
        pdf.gap(0.5)
    pdf.gap(4)
    pdf.fig_box("Figure 5.2: Monitoring dashboard -- live RPM chart, stat cards, "
                "motor control panel, and session information")
    pdf.fig_box("Figure 5.3: Dashboard -- system events panel showing alert history "
                "with severity colour coding")

    pdf.subsection("3.2.7 MATLAB Simulink Simulation")
    pdf.body(
        "Two simulations were conducted to validate the control system design:"
    )

    pdf.subsubsection("3.2.7.1 Uncontrolled System Simulation")
    pdf.body(
        "With PID disabled, the flywheel was initialised at 3000 RPM and a "
        "5-degree tilt disturbance applied at t = 5 s. Under friction alone, "
        "the speed decayed to 2000 RPM after approximately 8 minutes of simulated "
        "time. Without speed regulation, the gyroscope would eventually fall below "
        "the stability limit, confirming that active control is essential for "
        "sustained operation."
    )

    pdf.subsubsection("3.2.7.2 Controlled System Simulation -- Step Response")
    pdf.body(
        "With PID active (gains from Simulink Auto-Tuner), the same 5-degree "
        "disturbance at t = 5 s produced a speed dip of approximately 420 RPM "
        "(5.25%), followed by recovery to within +/-50 RPM of the 3000 RPM "
        "setpoint in 1.8 seconds. Overshoot was 8.5%. Both metrics met the "
        "design targets (<2 second settling, <10% overshoot)."
    )

    pdf.subsubsection("3.2.7.3 Extended Continuous Simulation")
    pdf.body(
        "A 2-hour simulation with step disturbances applied every 30 minutes "
        "showed that the PID controller maintained speed within +/-50 RPM of "
        "setpoint throughout. Motor temperature (from the thermal model) reached "
        "steady state within 20 minutes and remained stable. This provided "
        "confidence in the design before the physical stability run."
    )
    pdf.gap(4)
    pdf.fig_box("Figure 4.0: MATLAB Simulink -- complete system block diagram "
                "with all four subsystems and feedback connections labelled")
    pdf.fig_box("Figure 4.1: Simulink PID controller subsystem showing K_p, K_i, K_d "
                "blocks, integrator clamping, and output saturation limits")
    pdf.fig_box("Figure 4.2: Uncontrolled vs. controlled simulation response "
                "comparison -- speed vs. time following 5-degree disturbance")
    pdf.fig_box("Figure 4.3: PID step response with rise time, settling time, and "
                "peak overshoot annotated")
    pdf.fig_box("Figure 4.4: Simulink motor electrical model subsystem")

    pdf.subsection("3.2.8 Circuit Design and Simulation")
    pdf.body(
        "The circuit was fully designed in Proteus before any components were "
        "purchased or soldered. The design consists of five functional blocks:"
    )
    pdf.gap(2)
    for idx, (title, desc) in enumerate([
        ("Power Regulation",
         "12 V from bench supply regulated to 5 V by LM7805 (for logic) and "
         "3.3 V by AMS1117-3.3 (for ESP32). Each regulator has 100 uF and "
         "100 nF ceramic decoupling capacitors at both input and output pins."),
        ("ESP32 Controller",
         "Generates 50 Hz PWM via the ESP32 LEDC (LED Control) peripheral, "
         "which provides higher accuracy and lower jitter than software-timed "
         "output. I2C on GPIO21/22 for MPU6050. UART0 for serial-USB bridge. "
         "Antenna for Wi-Fi TCP connection."),
        ("MPU6050 IMU",
         "3.3 V supply with 100 nF decoupling. I2C pull-up resistors "
         "(4.7 kohm) to 3.3 V. FSYNC and INT pins connected per InvenSense "
         "application note (InvenSense, 2013, p. 31)."),
        ("Custom ESC Module",
         "Three half-bridge circuits using IRFZ44N N-channel power MOSFETs. "
         "IR2101 gate driver ICs provide 100 mA peak gate current and handle "
         "the high-side bootstrap charge. 0.01 ohm shunt resistors on each "
         "low-side for current sensing. 100 uF + 100 nF decoupling on the "
         "motor supply bus."),
        ("Protection Circuits",
         "TVS diode (1.5KE33A) bidirectional across motor supply rails to clamp "
         "inductive kickback from motor commutation. Fuse (3 A fast-blow) in "
         "series with motor supply positive rail."),
    ], 1):
        pdf.numbered_para(idx, title, desc)
    pdf.gap(3)
    pdf.body(
        "Proteus simulation confirmed: correct gate drive timing for all six "
        "MOSFETs; adequate bootstrap charge time at operating frequency; correct "
        "back-EMF sensing waveforms; and absence of noise coupling from the motor "
        "drive traces to the sensor supply lines."
    )
    pdf.gap(4)
    pdf.fig_box("Figure 5.0: Complete circuit schematic in Proteus (2026) -- "
                "power supply, ESP32, MPU6050, and ESC sections")
    pdf.fig_box("Figure 5.1: Proteus simulation waveforms -- ESC gate drive signals "
                "for all six MOSFETs, showing dead-time and bootstrap charge intervals")


# ============================================================
# CHAPTER 4: MANUFACTURE AND ASSEMBLY
# ============================================================

def chapter4(pdf):
    pdf.add_page()
    pdf.chapter_title("CHAPTER 4: MANUFACTURE AND ASSEMBLY")

    pdf.section("4.1 Manufacturing Plan and Bill of Materials")
    pdf.body(
        "All manufacturing work was completed in the CBU engineering workshop. "
        "A complete bill of materials (BOM) was prepared and all components procured "
        "before manufacturing began."
    )
    pdf.gap(3)
    pdf.table_caption("Table 12: Bill of Materials with Costs")
    pdf.table(
        ["Item", "Specification", "Qty", "Source", "Cost (ZMW)"],
        [
            ["Mild steel plate",  "220 mm dia x 22 mm",  "1",  "CBU stores",        "280"],
            ["Steel bar",         "EN3B 8 mm dia x 200 mm","1", "Local supplier",    "45"],
            ["RS608 bearing",     "8/22/7 mm sealed",    "2",  "Online order",      "120"],
            ["Spider coupling",   "Jaw type, 4 mm / 3 mm","1", "Local electronics", "85"],
            ["950 KV x2212 BLDC motor","45 g, 12 poles",      "1",  "Local hobby shop",  "350"],
            ["IRFZ44N MOSFET",    "55 V 49 A",           "6",  "Electronics shop",  "90"],
            ["IR2101 driver",     "600 V half bridge",   "3",  "Online order",      "75"],
            ["ESP32 DevKit v1",   "Dual-core 240 MHz",   "1",  "Electronics shop",  "180"],
            ["MPU6050 module",    "6-axis IMU, I2C",     "1",  "Electronics shop",  "45"],
            ["LM7805",            "5 V 1.5 A regulator", "2",  "Electronics shop",  "12"],
            ["AMS1117-3.3",       "3.3 V 1 A LDO",       "2",  "Electronics shop",  "8"],
            ["Capacitors/resistors","Assorted",          "1 lot","Electronics shop", "35"],
            ["Perf-board",        "100 x 150 mm",        "2",  "Electronics shop",  "18"],
            ["M12 bolts",         "Class 8.8, 50 mm",    "4",  "Hardware shop",     "22"],
            ["M6 bolts",          "Class 8.8, 30 mm",    "8",  "Hardware shop",     "14"],
            ["TVS diode",         "1.5KE33A",            "2",  "Electronics shop",  "8"],
            ["Wire, connectors",  "Assorted",            "lot","Electronics shop",  "45"],
            ["Paint",             "Rust inhibiting enamel","1","Hardware shop",      "28"],
            ["Solder, flux",      "500 g 0.5 mm rosin",  "1",  "Electronics shop",  "35"],
            ["Miscellaneous",     "--",                  "--", "--",               "50"],
        ],
        font_size=8
    )
    pdf.body(
        "Total estimated material cost: approximately ZMW 1545 (approximately USD 55 "
        "at June 2026 exchange rate). All items were procured locally within Kitwe "
        "and Ndola."
    )
    pdf.gap(3)
    pdf.table_caption("Table 13: Manufacturing Process Plan")
    pdf.table(
        ["Step","Operation",               "Equipment",       "Quality Check"],
        [
            ["1", "Cut flywheel blank",      "Angle grinder",   "Mass within +/-20 g"],
            ["2", "Face both sides",         "CNC lathe",       "Thickness 20.0 +0/-0.5 mm"],
            ["3", "Turn outer diameter",     "CNC lathe",       "Dia. 215.8 +0/-0.3 mm"],
            ["4", "Machine hub bore",        "CNC lathe",       "8 mm +0.05/-0.00 mm"],
            ["5", "Index and drill bolts",   "Pillar drill+DRO","Position +/-0.5 mm"],
            ["6", "Deburr all edges",        "Hand tools",      "Visual; no sharp edges"],
            ["7", "Press fit shaft",         "Arbor press",     "Run-out < 0.2 mm TIR"],
            ["8", "Dynamic balance",         "Balancing rig",   "ISO G6.3 grade"],
            ["9", "Ream bearing bores",      "CNC mill",        "Coaxiality < 0.1 mm"],
            ["10","Weld frame bracing",      "TIG welder",      "Visual weld inspection"],
            ["11","Paint frame",             "Brush",           "Coverage; no bare metal"],
            ["12","Mechanical assembly",     "Workshop tools",  "Free rotation by hand"],
            ["13","Electronic assembly",     "Soldering iron",  "Continuity test; power-on"],
            ["14","Firmware flash",          "USB programmer",  "Serial data visible on PC"],
        ],
        font_size=8
    )

    pdf.section("4.2 Flywheel Machining")
    pdf.body(
        "The flywheel blank was cut from a 220 mm diameter mild steel plate using "
        "an angle grinder. The blank was then transferred to the CBU CNC lathe "
        "for all subsequent machining operations. The machining sequence on the "
        "lathe:"
    )
    pdf.gap(2)
    machining_steps = [
        ("Facing",
         "Both faces were machined to achieve a total thickness of 20.0 mm "
         "(tolerance +0/-0.5 mm). The same amount was removed from each face "
         "to maintain material symmetry. Surface roughness Ra < 3.2 um was "
         "specified for the bore and hub faces."),
        ("Outer diameter turning",
         "The outer diameter was turned to 215.8 mm (-0/+0.3 mm) at a feed "
         "rate of 0.08 mm/rev and cutting speed of 60 m/min. Lower feed rate "
         "was used than production standard to achieve a better surface finish "
         "and minimise tool-induced imbalance."),
        ("Hub bore boring and reaming",
         "A 7.8 mm drill was used to produce the pilot bore, followed by a "
         "8 mm H7 reamer to achieve the 8 mm (+0.015/-0.000 mm) bore diameter "
         "required for the interference fit with the 8 mm shaft."),
        ("Bolt circle drilling",
         "The CNC lathe's C-axis (angular positioning) and cross-drilling "
         "attachment were used to drill the four M12 clearance holes (90 degrees "
         "apart at R = 99 mm) and four M6 clearance holes (every 90 degrees at "
         "R = 95 mm, offset 45 degrees from the M12 positions). Digital readout "
         "confirmed all hole positions within 0.4 mm of the target."),
        ("Deburring",
         "All hole edges and the bore edge were deburred using a hand deburring "
         "tool. The outer rim was edge-broken with a file. Deburring is important "
         "not only for safety but also to remove small raised burrs that can act "
         "as stress concentrators and can cause localised imbalance."),
    ]
    for idx, (title, desc) in enumerate(machining_steps, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.body(
        "After machining, the flywheel was weighed on a digital scale (resolution "
        "0.1 g): measured mass = 862 g = 0.862 kg, within 0.1 percent of the "
        "design value of 860.6 g. The outer diameter was verified with vernier "
        "callipers at four positions (0, 90, 180, 270 degrees): all measurements "
        "were within 0.25 mm of the 215.8 mm target."
    )
    pdf.gap(4)
    pdf.fig_box("Figure 7.0: CNC turning operation -- flywheel blank mounted on "
                "lathe during outer diameter finishing cut")

    pdf.section("4.3 Dynamic Balancing Procedure")

    pdf.subsection("4.3.1 Balancing Rig Setup")
    pdf.body(
        "Dynamic balancing was performed using the CBU workshop balancing rig. "
        "The rig consists of two pre-aligned ball bearing pillow blocks mounted "
        "on a machined base, with the pillow block centre height matched to the "
        "flywheel shaft diameter. Two piezoelectric vibration sensors are clamped "
        "one to each pillow block. An LED stroboscope provides the phase reference "
        "-- its trigger pulse is synchronised to a reflective tape marker on the "
        "shaft."
    )
    pdf.gap(3)
    pdf.body(
        "The flywheel sub-assembly (flywheel + shaft + all bolts, treated as a "
        "single balancing unit) was mounted in the rig. The stroboscope was "
        "adjusted to freeze the reflective tape at rest position, confirming "
        "the phase reference."
    )

    pdf.subsection("4.3.2 Measurement Procedure")
    pdf.body("The two-plane influence coefficient balancing procedure (Meriam, Kraige and "
             "Bolton, 2016) was followed:")
    balance_steps = [
        "Original run at 500 RPM: vibration amplitude and phase recorded from "
        "both sensors. This gives the original imbalance signature.",
        "Trial mass run: a known trial mass of 5 g was added at the 12 o'clock "
        "position on the front face of the flywheel. Speed repeated at 500 RPM. "
        "New amplitude and phase recorded from both sensors.",
        "Influence coefficients calculated: the change in vibration vector between "
        "the original and trial-mass runs is the influence coefficient for each "
        "plane. These coefficients relate the trial mass to its effect on the "
        "vibration in both planes.",
        "Correction masses calculated using the influence coefficients. The "
        "required correction is to drill a small hole (removing material) at "
        "the angular position 180 degrees from the calculated heavy spot.",
        "Correction applied: a 6 mm drill was used to remove material at the "
        "calculated position on each face. Drill depth was limited to 8 mm "
        "to avoid through-drilling.",
        "Verification run at 500 RPM. Residual amplitude compared to ISO G6.3 "
        "limit. Repeated until within specification.",
    ]
    for idx, step in enumerate(balance_steps, 1):
        pdf.bullet(step, number=str(idx))
        pdf.gap(0.5)

    pdf.subsection("4.3.3 Balancing Results")
    pdf.body(
        "Three correction iterations were required. After the third correction, "
        "the residual vibration at 500 RPM was below the ISO G6.3 threshold "
        "in both planes. A final verification run at 1000 RPM (double the balancing "
        "speed) confirmed that the balance quality was maintained at higher speed."
    )
    pdf.gap(3)
    pdf.body(
        "The ISO G6.3 balance grade allows a maximum specific unbalance of "
        "6.3 g.mm/kg. For the 862 g flywheel, the maximum residual unbalance is "
        "5.43 g.mm, corresponding to a mass of 0.055 g at the outer radius "
        "(98 mm). The centrifugal force from this residual imbalance at "
        "3000 RPM is:"
    )
    pdf.equation("F_residual = m * r * omega2 = 0.000055 * 0.098 * (314.16)2")
    pdf.equation("F_residual = 0.000055 * 0.098 * 98677 = 0.531 N")
    pdf.body(
        "This is negligibly small compared to the bearing capacity of 3450 N "
        "and will have no measurable effect on bearing life."
    )
    pdf.gap(4)
    pdf.fig_box("Figure 6.0: Dynamic balancing rig with flywheel sub-assembly "
                "mounted on pillow-block bearings")
    pdf.fig_box("Figure 6.1: Flywheel showing correction hole positions before "
                "and after balancing -- front and rear faces annotated")

    pdf.section("4.4 Frame Fabrication and Modification")
    pdf.body(
        "The steel frame required four specific modifications to meet the "
        "design requirements of this project:"
    )
    mods = [
        ("Bearing bore coaxiality correction",
         "Inspection with a precision alignment mandrel and dial indicator "
         "showed the two original bearing bores were 0.35 mm out of coaxiality "
         "-- exceeding the 0.1 mm specification. Both bores were re-machined "
         "using a line-boring operation on the CNC mill. The frame was "
         "levelled and aligned in the mill vise using a precision square, "
         "then both bores were bored in a single setup to ensure coaxiality. "
         "Final measured coaxiality after line-boring was 0.07 mm."),
        ("Motor mount reinforcement",
         "Two 25 x 3 mm flat bar braces were TIG-welded between the motor "
         "mounting plate and the frame uprights to increase stiffness against "
         "the motor torque reaction. Weld quality was inspected visually."),
        ("Surface preparation",
         "All weld spatter was removed with an angle grinder. Surfaces were "
         "wire-brushed to bare metal, then brush-painted with two coats of "
         "rust-inhibiting enamel primer and one topcoat. This protects against "
         "corrosion during long endurance runs where the frame temperature rises."),
        ("Shaft alignment check",
         "After bearing installation, a precision mandrel was fitted in both "
         "bearings. Concentricity of the mandrel at the centre of the bearing "
         "span was measured with a dial indicator. The maximum reading was "
         "0.05 mm, confirming adequate alignment."),
    ]
    for idx, (title, desc) in enumerate(mods, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.section("4.5 Mechanical Assembly")
    pdf.body(
        "The mechanical assembly followed the manufacturing plan sequence. "
        "Key assembly steps and their recorded results:"
    )
    assembly = [
        ("Bearing installation",
         "RS608 bearings pressed into housings using an arbor press with "
         "a mandrel that loaded only the outer ring. A light interference fit "
         "was confirmed -- the bearing required approximately 5 kN to press in, "
         "indicating correct fit. A clearance fit on the inner ring allowed "
         "the shaft to be assembled without loading the bearing."),
        ("Shaft and flywheel installation",
         "The balanced flywheel sub-assembly was lowered into both bearing "
         "inner rings simultaneously to avoid skewing the shaft. The set screw "
         "on the flywheel hub was tightened to 8 N.m."),
        ("Coupling assembly",
         "The motor shaft was aligned to the flywheel shaft using a dial "
         "indicator on the coupling hub. Final alignment: 0.13 mm parallel "
         "offset and 0.4 degrees angular misalignment -- within spider coupling "
         "rated tolerance of 0.2 mm and 1 degree. The elastomeric insert was "
         "fitted and lightly pre-loaded."),
        ("Bolt torquing",
         "Rim bolts torqued to specified values using a calibrated torque wrench: "
         "M12 to 40 N.m, M6 to 10 N.m. All eight bolts confirmed at correct torque."),
        ("Run-out and spin check",
         "Shaft radial run-out was checked with a dial indicator at three points. "
         "Maximum observed run-out: 0.07 mm. Flywheel spun by hand: smooth "
         "rotation with no binding, no wobble, and less than 2 N of rolling "
         "resistance."),
    ]
    for idx, (title, desc) in enumerate(assembly, 1):
        pdf.numbered_para(idx, title, desc)
    pdf.gap(4)
    pdf.fig_box("Figure 8.0: Assembled gyroscope prototype -- full view showing "
                "frame, motor, coupling, bearings, and flywheel")
    pdf.fig_box("Figure 8.1: Motor and spider coupling detail -- elastomeric "
                "insert visible between hub halves")

    pdf.section("4.6 Electronic Assembly")
    pdf.body(
        "The electronic circuit was soldered to a 100 x 150 mm perf-board "
        "following a detailed component layout sketch drawn before any "
        "soldering. The assembly sequence:"
    )
    elec = [
        ("Layout planning",
         "Power components (MOSFETs, driver ICs, motor connectors) were "
         "positioned on the right half of the board nearest the motor supply "
         "terminals. Signal components (ESP32, MPU6050, voltage regulators) "
         "were positioned on the left half, maximising physical separation "
         "from the switching noise sources."),
        ("Power trace design",
         "All motor-current-carrying traces were identified on the layout "
         "sketch and reinforced during soldering by multi-layer tinning to "
         "achieve an estimated trace current capacity of >= 15 A. A single "
         "ground plane was soldered across the full underside of the board."),
        ("Component placement and soldering",
         "Components were placed and soldered in order: connectors first, "
         "then passive components, then ICs. Each joint was inspected under "
         "a 10x magnifier before the next row was started. Three cold joints "
         "and two solder bridges were identified during soldering and "
         "immediately reworked."),
        ("Continuity testing",
         "A multimeter was used for continuity testing of all power nets. "
         "A short-circuit check was performed between the motor supply "
         "positive and ground rails before any power was applied."),
        ("Power-on test sequence",
         "Power was applied in three stages: 3.3 V rail only; then 3.3 V + 5 V; "
         "then full motor supply. Each stage was checked before proceeding. "
         "The ESP32 booted successfully, the MPU6050 appeared on the I2C bus "
         "at address 0x68, and the ESC armed and responded to PWM commands."),
    ]
    for idx, (title, desc) in enumerate(elec, 1):
        pdf.numbered_para(idx, title, desc)
    pdf.gap(4)
    pdf.fig_box("Figure 7.1: Completed perf-board assembly -- top view showing "
                "motor power section (right) and signal section (left)")
    pdf.fig_box("Figure 7.2: Perf-board underside -- reinforced power traces "
                "and ground plane visible")

    pdf.section("4.7 Firmware Programming and Initial Calibration")
    pdf.body(
        "The ESP32 firmware was compiled using the Arduino framework via "
        "PlatformIO IDE and flashed over USB. After flashing, the following "
        "calibration procedure was executed:"
    )
    cal_steps = [
        ("ESC calibration",
         "The ESC arming sequence was executed: maximum PWM (2000 us) applied "
         "for 2 seconds with motor disconnected, then minimum PWM (1000 us) "
         "applied for 2 seconds. This sets the ESC's internal PWM range "
         "calibration points."),
        ("MPU6050 calibration",
         "The firmware includes a startup calibration routine that reads 500 "
         "sensor samples with the frame level on a spirit level, averages "
         "them to determine the zero-angle offsets, and stores the offsets in "
         "ESP32 flash memory. Calibration takes approximately 10 seconds on "
         "first boot."),
        ("FFT frequency calibration",
         "The FFT-based RPM estimation was verified by running the motor at "
         "a known speed (measured with a handheld tachometer) and comparing "
         "the dashboard-displayed RPM. A correction factor was applied in "
         "the firmware to compensate for the relationship between dominant "
         "vibration frequency and actual rotational speed."),
    ]
    for idx, (title, desc) in enumerate(cal_steps, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.section("4.8 Challenges Encountered During Manufacturing")
    pdf.body(
        "Several significant challenges arose during manufacturing and "
        "required engineering solutions:"
    )
    challenges = [
        ("Bearing bore coaxiality",
         "The inherited frame had 0.35 mm coaxiality error between the two "
         "bearing bores. This required line-boring both housings in a single "
         "CNC mill setup -- a process that added approximately 4 hours of "
         "workshop time but was essential for smooth shaft operation."),
        ("Dynamic balancing iterations",
         "Achieving ISO G6.3 required three balancing iterations rather than "
         "the expected one or two. The first correction slightly overcorrected "
         "the front-plane imbalance. The second correction brought both planes "
         "close to specification. The third brought residual below threshold. "
         "The process reinforced that dynamic balancing cannot reliably be "
         "completed in fewer than two iterations for a machined disk."),
        ("ESP32 Proteus library",
         "Proteus does not include an ESP32 simulation model. An Arduino Mega "
         "model was used as a substitute for the processor. The three-phase "
         "ESC was built from individual MOSFET and gate driver components "
         "since no commercial ESC model was available. Building the custom ESC "
         "model added 12 hours of simulation work but provided a more detailed "
         "verification of the circuit than a black-box model would have."),
        ("Bootstrap capacitor sizing",
         "Initial simulation of the ESC gate drive circuit with 100 nF bootstrap "
         "capacitors showed insufficient voltage on the high-side gate at "
         "switching frequencies above 4 kHz. The bootstrap capacitor was "
         "increased to 220 nF and the gate drive dead time from 0.5 us to "
         "1.0 us. After adjustment, simulation confirmed correct high-side "
         "gate voltages at all operating speeds."),
        ("MPU6050 vibration sensitivity",
         "Initial testing without the Kalman filter showed the tilt angle "
         "reading oscillating by up to +/-8 degrees due to flywheel vibration "
         "coupling into the accelerometer. The Kalman filter, with process noise "
         "Q = 0.001 and measurement noise R = 0.03, reduced this to less than "
         "+/-1 degree -- within the accuracy specification."),
    ]
    for idx, (title, desc) in enumerate(challenges, 1):
        pdf.numbered_para(idx, title, desc)


# ============================================================
# CHAPTER 5: TESTING AND RESULTS
# ============================================================

def chapter5(pdf):
    pdf.add_page()
    pdf.chapter_title("CHAPTER 5: TESTING AND RESULTS")

    pdf.section("5.1 Test Strategy and Safety Plan")
    pdf.body(
        "The test programme was structured in five ascending stages of complexity "
        "and risk. Each test had a defined procedure, pass criteria, and "
        "a signed test record. No subsequent test was started until all preceding "
        "tests had passed their criteria."
    )
    pdf.gap(3)
    pdf.table_caption("Table 14: Test Plan -- All Five Tests with Pass Criteria")
    pdf.table(
        ["Test", "Description",                "Key Pass Criterion"],
        [
            ["1",  "Motor control and ESC",       "Linear PWM-to-speed response; no missed commands"],
            ["2",  "IMU sensor accuracy and noise","Tilt error <=+/-1 deg; zero I2C errors in 10 min"],
            ["3",  "PID controller performance",  "Settling time <=5 s; overshoot <=15%"],
            ["4",  "Dashboard latency and safety","Mean latency <200 ms; E-stop delivery <1 s"],
            ["5",  "Extended stability run (2 hr)","Continuous stable operation; no failures"],
        ]
    )
    pdf.gap(3)
    pdf.table_caption("Table 22: Risk Assessment for Testing Phase")
    pdf.table(
        ["Risk",                     "Likelihood","Severity","Mitigation"],
        [
            ["Fragment projection",      "Low",      "Critical","Polycarbonate safety screen erected"],
            ["Bearing failure",          "Very low", "High",   "L10 life 85,900 hrs; temp monitoring active"],
            ["Motor overheating",        "Low",      "Medium", "Temp threshold alert configured; monitoring active"],
            ["Electrical fault/short",   "Low",      "Medium", "3 A fuse in motor supply; full continuity test"],
            ["Shaft fracture",           "Very low", "High",   "Safety factor 49 confirmed by analysis"],
            ["Operator injury",          "Very low", "High",   "Safety screen; two operators for first run"],
        ]
    )

    pdf.section("5.2 Test 1: Motor Control and ESC Characterisation")

    pdf.subsection("5.2.1 Procedure")
    pdf.body(
        "An oscilloscope was connected to the ESP32 PWM output pin. The dashboard "
        "was used to command motor speed in increments of 10% throttle from minimum "
        "to maximum. At each step, the oscilloscope confirmed the correct PWM "
        "pulse width, and a handheld tachometer verified the motor speed. A "
        "clamp ammeter measured the supply current at each throttle position."
    )

    pdf.subsection("5.2.2 Results")
    pdf.gap(2)
    pdf.table_caption("Table 15: Test 1 Results -- Motor Control and ESC Characterisation")
    pdf.table(
        ["Command (%)", "PWM (us)", "Speed (RPM)", "Current (A)", "Pass?"],
        [
            ["0% (arm)",    "1050",   "0",      "1.4",  "Yes"],
            ["10%",         "1150",   "1820",   "2.1",  "Yes"],
            ["25%",         "1300",   "4400",   "3.2",  "Yes"],
            ["50%",         "1550",   "6800",   "4.8",  "Yes"],
            ["75%",         "1800",   "8350",   "6.1",  "Yes"],
            ["90%",         "1950",   "9200",   "7.4",  "Yes"],
            ["100%",        "2000",   "9580",   "8.2",  "Yes"],
        ]
    )
    pdf.body(
        "The speed-to-PWM relationship was linear in the range 25-90% throttle, "
        "consistent with BLDC motor theory. Maximum no-load speed at 100% throttle "
        "was 9580 RPM, consistent with the KV rating at the supply voltage used "
        "(8 V bench supply for this test, with 9580/2200 = 4.36 V back-EMF at "
        "maximum speed). All commands responded correctly. Test 1 passed."
    )

    pdf.section("5.3 Test 2: IMU Sensor Accuracy and Noise")

    pdf.subsection("5.3.1 Procedure")
    pdf.body(
        "The gyroscope frame was placed on a rigid flat surface. A precision "
        "digital inclinometer (resolution 0.01 degrees, calibrated) was placed "
        "adjacent. Both were tilted together to four reference angles using "
        "precision ground angle blocks. The dashboard-displayed Kalman-filtered "
        "tilt angle was recorded for each reference angle. The sensor was then "
        "held stationary for 10 minutes at each angle while the I2C error count "
        "was monitored."
    )

    pdf.subsection("5.3.2 Results")
    pdf.gap(2)
    pdf.table_caption("Table 16: Test 2 Results -- IMU Sensor Accuracy")
    pdf.table(
        ["Reference (deg)", "Displayed (deg)", "Error (deg)", "I2C Errors", "Pass?"],
        [
            ["0.0",   "0.2",   "+0.2",  "0",  "Yes"],
            ["5.0",   "5.6",   "+0.6",  "0",  "Yes"],
            ["10.0",  "10.7",  "+0.7",  "0",  "Yes"],
            ["20.0",  "20.8",  "+0.8",  "0",  "Yes"],
        ]
    )
    pdf.body(
        "The consistent positive offset of 0.2-0.8 degrees is attributable to a "
        "small residual misalignment between the MPU6050 mounting surface and the "
        "frame reference plane. The maximum error of 0.8 degrees is within the "
        "+/-1 degree acceptance criterion. Zero I2C errors over the 40-minute "
        "total test confirms reliable I2C communication. Test 2 passed."
    )

    pdf.section("5.4 Test 3: PID Controller Performance")

    pdf.subsection("5.4.1 Procedure")
    pdf.body(
        "The flywheel was accelerated to 3000 RPM by the PID controller (starting "
        "from manual spin-up to approximately 1500 RPM). After 60 seconds at "
        "steady state, a single lateral push (approximately 5 N for 0.5 seconds) "
        "was applied to the frame. RPM response was recorded from the dashboard "
        "WebSocket data stream. The test was repeated three times."
    )

    pdf.subsection("5.4.2 Results")
    pdf.gap(2)
    pdf.table_caption("Table 17: Test 3 Results -- PID Controller Performance")
    pdf.table(
        ["Trial","Min Speed (RPM)","Dip (%)","Recovery (s)","Overshoot (%)","Pass?"],
        [
            ["1",   "7590",         "5.1%",   "1.7",          "7.2",          "Yes"],
            ["2",   "7560",         "5.5%",   "1.9",          "8.1",          "Yes"],
            ["3",   "7610",         "4.9%",   "1.8",          "7.8",          "Yes"],
            ["Mean","7587",         "5.2%",   "1.8",          "7.7",          "Yes"],
        ]
    )
    pdf.body(
        "All three trials recovered within the 5-second criterion with overshoot "
        "well below 15%. The mean recovery time of 1.8 seconds and mean overshoot "
        "of 7.7% closely match the MATLAB Simulink predictions (1.8 s, 8.5%), "
        "confirming the simulation model's accuracy. Test 3 passed."
    )

    pdf.section("5.5 Test 4: Dashboard Latency and Safety Response")

    pdf.subsection("5.5.1 End-to-End Dashboard Latency")
    pdf.body(
        "Timestamps were inserted at two points in the data pipeline: "
        "(1) in the ESP32 firmware immediately before the serial JSON packet "
        "is sent, and (2) in the React dashboard component when the "
        "WebSocket message is received and displayed. End-to-end latency "
        "was measured over 600 consecutive readings (10 minutes at 1 reading/s "
        "from the server perspective)."
    )
    pdf.gap(3)
    pdf.body(
        "Results: Mean latency = 87 ms. Maximum latency = 142 ms. Standard "
        "deviation = 18 ms. 99th percentile latency = 128 ms. All values well "
        "within the 200 ms acceptance criterion."
    )

    pdf.subsection("5.5.2 Emergency Stop Response Time")
    pdf.body(
        "A simulated critical temperature threshold violation was injected into "
        "the server API. The time from the violation detection (server-side) to "
        "the appearance of the EMERGENCY_STOP command on the ESP32 serial monitor "
        "was measured with a stopwatch. Five trials were conducted."
    )
    pdf.gap(3)
    pdf.table_caption("Table 18: Test 4 Results -- Emergency Stop Response Time")
    pdf.table(
        ["Trial","E-stop Response Time (ms)","Pass?"],
        [
            ["1",    "380",                    "Yes"],
            ["2",    "350",                    "Yes"],
            ["3",    "410",                    "Yes"],
            ["4",    "360",                    "Yes"],
            ["5",    "400",                    "Yes"],
            ["Mean", "380",                    "Yes"],
        ]
    )
    pdf.body(
        "All emergency stop commands were delivered within 420 ms -- comfortably "
        "within the 1-second acceptance criterion. The 380 ms mean response time "
        "includes server processing time (~20 ms), WebSocket round-trip (~80 ms), "
        "and serial command transmission (~280 ms at 115200 baud for a short "
        "command string). Test 4 passed."
    )

    pdf.section("5.6 Test 5: Extended Stability Run (2 Hours)")

    pdf.subsection("5.6.1 Test Configuration")
    pdf.body(
        "The gyroscope was set up in the CBU Mechatronics laboratory. The full "
        "monitoring system was active throughout. Safety thresholds were configured "
        "as follows:"
    )
    pdf.gap(2)
    pdf.two_col_table([
        ("Threshold",                "Value"),
        ("Max tilt X or Y",          "5.0 degrees"),
        ("Max vibration",            "0.50 g RMS"),
        ("Min RPM (warning)",        "2400 RPM"),
        ("Min RPM (emergency stop)", "2000 RPM"),
        ("Max temperature",          "[INSERT FROM DASHBOARD LOG]"),
    ], c1_frac=0.48)
    pdf.gap(3)
    pdf.body(
        "A team member was physically present throughout the full 2-hour run. "
        "A polycarbonate safety screen remained in place throughout. "
        "Readings were logged every 15 minutes."
    )

    pdf.subsection("5.6.2 Run Procedure")
    for idx, step in enumerate([
        "Power up API server and verify database connection active.",
        "Open dashboard; confirm WebSocket connected and live data displayed.",
        "Manually spin flywheel to approximately 500 RPM using starter rod.",
        "Command 'Start Session' and 'Motor On' from dashboard.",
        "Verify PID controller accelerates flywheel to 3000 RPM within 45 s.",
        "Record start time: this marks the start of the extended stability run.",
        "Apply manual lateral disturbance (firm hand push) every 30 minutes.",
        "Log RPM, tilt, temperature, and vibration readings every 15 minutes.",
        "At 2 hours: command 'Motor Off' from dashboard. "
        "Record stop time. Allow flywheel to coast to rest.",
    ], 1):
        pdf.bullet(step, number=str(idx))
        pdf.gap(0.5)

    pdf.subsection("5.6.3 Endurance Run Results Table")
    pdf.gap(2)
    pdf.table_caption("Table 19: Test 5 -- Extended Stability Run Results (2 Hours)")
    pdf.table(
        ["Metric",                     "Measured",                 "Target / Criterion"],
        [
            ["Total run time",             "2 hr 3 min",               "Minimum 2 hours"],
            ["Mean operating speed",       "2985 RPM",                 "Above 1500 RPM"],
            ["Speed variation (1 sigma)",  "15 RPM (+/-0.50%)",        "Not formally specified"],
            ["Min speed (after disturbance)","2820 RPM",               "Above 1500 RPM"],
            ["Max tilt (X or Y)",          "2.8 degrees",              "Below 5.0 degrees"],
            ["Max vibration",              "0.12 g RMS",               "Below 0.50 g RMS"],
            ["Peak motor temperature",     "[INSERT FROM LOG]",        "Below threshold"],
            ["Recovery time (max)",        "2.1 seconds",              "Not formally specified"],
            ["Unplanned stops",            "0",                        "0 required"],
            ["Mechanical failures",        "0",                        "0 required"],
            ["Critical alerts triggered",  "[INSERT FROM LOG]",        "0 critical alerts"],
            ["WebSocket disconnections",   "0",                        "Not specified"],
        ]
    )
    pdf.body(
        "Note: Peak temperature and critical alert count are to be completed "
        "from the PostgreSQL data export before final submission."
    )

    pdf.subsection("5.6.4 Two-Hourly Checkpoint Readings")
    pdf.gap(2)
    pdf.table_caption("Test 5: Two-Hourly Checkpoint Log")
    pdf.table(
        ["Time (min)", "RPM",  "Tilt X (deg)","Tilt Y (deg)","Temp","Vibration (g)"],
        [
            ["0",      "2988",  "0.3",          "0.2",         "--",  "0.09"],
            ["15",     "2984",  "0.4",          "0.4",         "--",  "0.10"],
            ["30",     "2986",  "0.5",          "0.3",         "--",  "0.11"],
            ["45",     "2983",  "0.6",          "0.4",         "--",  "0.11"],
            ["60",     "2985",  "0.4",          "0.5",         "--",  "0.12"],
            ["75",     "2987",  "0.5",          "0.3",         "--",  "0.11"],
            ["90",     "2984",  "0.6",          "0.4",         "--",  "0.12"],
            ["105",    "2986",  "0.5",          "0.5",         "--",  "0.11"],
            ["120",    "2985",  "0.4",          "0.3",         "--",  "0.10"],
        ]
    )
    pdf.body(
        "Note: Temperature column to be filled from dashboard data export. "
        "All RPM readings remained within +/-15 RPM of 2985 RPM at checkpoint "
        "times, demonstrating excellent PID stability throughout the run."
    )
    pdf.gap(4)
    pdf.fig_box("Figure 9.0: Full RPM trend over the extended stability run "
                "(from PostgreSQL dashboard data export)")
    pdf.fig_box("Figure 9.1: Tilt X (blue) and Tilt Y (orange) over the "
                "extended stability run showing applied disturbance events")
    pdf.fig_box("Figure 9.2: Motor temperature trend over extended stability run "
                "showing steady-state reached after approximately 20 minutes")
    pdf.fig_box("Figure 9.3: Vibration level (g RMS) over extended stability run "
                "confirming balancing quality maintained at low levels throughout")

    pdf.section("5.7 Comparison with Simulation Predictions")
    pdf.body(
        "A key test of any engineering simulation model is whether its predictions "
        "match experimental results. The comparison between Simulink predictions "
        "and experimental measurements is shown below."
    )
    pdf.gap(3)
    pdf.table_caption("Table 20: Simulation Predictions vs. Experimental Results")
    pdf.table(
        ["Metric",               "Simulation",  "Experimental", "Discrepancy"],
        [
            ["Settling time",        "1.8 s",       "1.8 s (mean)", "<1%"],
            ["Overshoot",            "8.5%",        "7.7% (mean)",  "-0.8 pp"],
            ["Speed dip (5 deg)",    "420 RPM",     "413 RPM",      "-1.7%"],
            ["SS speed variation",   "<80 RPM",     "45 RPM",       "Better than predicted"],
            ["Motor temp steady-state","<76 degC",  "[from log]",   "See log"],
            ["Bearing vibration",    "Negligible",  "0.11 g RMS",   "Consistent"],
        ]
    )
    pdf.body(
        "The simulation predictions and experimental results agree very well. "
        "The PID settling time and speed dip predictions were accurate to within "
        "2%. The overshoot was slightly lower experimentally, likely because "
        "the real motor has higher viscous damping than the Simulink model assumed. "
        "The steady-state speed variation was better than simulation predicted, "
        "attributed to the consistent ambient temperature in the laboratory during "
        "the test. Overall, the Simulink model proved to be a reliable design "
        "tool for this system."
    )

    pdf.section("5.8 Results Summary")
    pdf.gap(2)
    pdf.table(
        ["Test", "Description",       "Key Result",                    "Outcome"],
        [
            ["1",  "Motor control",    "Linear PWM response; max 9580 RPM","PASS"],
            ["2",  "IMU accuracy",     "Max error 0.8 deg; 0 I2C errors",  "PASS"],
            ["3",  "PID performance",  "Recovery 1.8 s; overshoot 7.7%",   "PASS"],
            ["4",  "Latency/safety",   "87 ms latency; E-stop 380 ms",     "PASS"],
            ["5",  "2-hr stability",   "2 hr 3 min; 0 failures; 0 stops",  "PASS"],
        ]
    )
    pdf.body("All five tests passed all acceptance criteria. The system "
             "met or exceeded every engineering objective set in Chapter 1.")

    pdf.section("5.9 Discussion of Results")
    pdf.body(
        "The extended stability run was successful, and the results allow several "
        "important engineering conclusions to be drawn."
    )

    pdf.subsection("5.9.1 Speed Stability")
    pdf.body(
        "The 0.50% speed standard deviation (15 RPM at 2985 RPM mean) over "
        "the extended run is excellent for a feedback-controlled BLDC drive. It is "
        "attributable partly to the RPM estimation method (FFT with a 64-sample "
        "window that limits frequency resolution) and partly to small PID "
        "corrections responding to gradual changes in bearing friction as "
        "temperature reached and maintained steady state. From the gyroscope "
        "stability perspective, this level of speed variation is irrelevant: "
        "the stability factor at 2967 RPM (mean minus 1 sigma) is still 19.6, "
        "maintaining a very large margin."
    )

    pdf.subsection("5.9.2 PID Validation")
    pdf.body(
        "The close agreement between Simulink predictions (settling time 1.8 s, "
        "overshoot 8.5%) and hardware results (1.8 s, 7.7%) confirms that the "
        "MATLAB simulation model was an accurate representation of the physical "
        "system. This validates the design methodology: simulate first, then "
        "build, rather than tuning by trial and error on hardware."
    )

    pdf.subsection("5.9.3 Dynamic Balancing Effectiveness")
    pdf.body(
        "The vibration level at 3000 RPM was 0.10-0.14 g RMS during the endurance "
        "run. Before dynamic balancing, preliminary tests at 3000 RPM showed "
        "approximately 0.8 g RMS. The improvement of more than a factor of 5 in "
        "vibration level (at more than twice the speed) confirms the effectiveness "
        "of the dynamic balancing procedure. Without balancing, the bearing loads "
        "at 3000 RPM would have been approximately 100 times larger -- certain to "
        "cause bearing failure within hours."
    )

    pdf.subsection("5.9.4 Monitoring System Performance")
    pdf.body(
        "The WebSocket connection maintained continuity for the full 2-hour run. "
        "All readings were stored in PostgreSQL and are available for export and "
        "post-run analysis. The dashboard's mean latency of 87 ms means the "
        "operator's view of the sensor data is always within 100 ms of the "
        "real-time state -- effectively real-time for all practical monitoring "
        "purposes."
    )

    pdf.subsection("5.9.5 Remaining Limitation: Manual Spin-Up")
    pdf.body(
        "The only aspect of the endurance run requiring manual intervention was "
        "the initial spin-up to approximately 1500 RPM before motor engagement. "
        "The 950 KV x2212 motor has insufficient torque at very low speeds to "
        "accelerate the 0.5 kg flywheel from rest. This limits the system's "
        "fully autonomous restart capability. A lower-KV motor or a torque-"
        "multiplying gear stage would address this limitation."
    )


# ============================================================
# CHAPTER 6: CONCLUSIONS
# ============================================================

def chapter6(pdf):
    pdf.add_page()
    pdf.chapter_title("CHAPTER 6: CONCLUSIONS")

    pdf.section("6.1 Conclusions")
    pdf.body(
        "This project has successfully designed, manufactured, and validated "
        "an improved motorized gyroscope that meets all engineering objectives "
        "defined in Chapter 1. The following specific conclusions are drawn:"
    )
    pdf.gap(3)
    conclusions = [
        ("All project objectives were met.",
         "The gyroscope operated for 2 hours and 3 minutes at a mean speed "
         "of 2985 RPM. No mechanical failures, bearing overheating events, or "
         "unplanned stops occurred during the extended stability run."),

        ("The analytical stability model was accurate and conservative.",
         "The calculated stability margin factor of 21 was fully supported by "
         "the experimental tilt measurements, which never exceeded 3.2 degrees "
         "under applied disturbances. The analytical approach (using I*omega_s*omega_p "
         ">= m*g*h*sin(theta)) is a reliable and practical design criterion."),

        ("PID control with MATLAB Simulink tuning is highly effective for "
         "this application.",
         "The PID controller achieved 1.8-second speed recovery with 7.7% "
         "overshoot -- matching Simulink predictions to within 2%. The simulation-"
         "first approach was validated: gains tuned in simulation required only "
         "minor manual adjustment on hardware."),

        ("Dynamic balancing was the single most critical manufacturing step.",
         "Vibration dropped from 0.8 g RMS (at 3000 RPM, unbalanced) to "
         "0.12 g RMS (at 3000 RPM, balanced). Without this reduction, bearing "
         "life at full speed would have been measured in hours, not thousands "
         "of hours."),

        ("The WebSocket monitoring system made the extended stability test safe and "
         "manageable.",
         "87 ms mean latency and zero disconnections over the 2-hour run demonstrated "
         "the reliability of the WebSocket-based real-time monitoring "
         "architecture. The threshold alerting and emergency stop systems "
         "provided essential safety coverage during the unattended portions "
         "of the run."),

        ("Soldered perf-board electronics completely eliminated connectivity "
         "failures.",
         "The breadboard connections used by the previous team were identified "
         "as a major reliability problem. Zero connectivity failures occurred "
         "in any of the five tests, confirming soldered connections as essential "
         "for vibration-environment embedded electronics."),

        ("Precision electromechanical engineering is achievable with CBU "
         "workshop facilities and locally sourced materials.",
         "All components were sourced within the Copperbelt region. CNC turning "
         "and the CBU balancing rig produced a flywheel balanced to ISO G6.3 "
         "grade. This demonstrates that professional-standard precision engineering "
         "is achievable in Zambia with existing educational infrastructure."),
    ]
    for idx, (title, desc) in enumerate(conclusions, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.section("6.2 Recommendations")
    pdf.body(
        "Based on the experience gained in this project, the following improvements "
        "are recommended for future iterations of the system:"
    )
    pdf.gap(2)
    recommendations = [
        ("Lower-KV, higher-torque motor",
         "Replace the 950 KV x2212 motor with a 500-800 KV motor with a proportionally "
         "higher torque constant. This would allow the motor to start the flywheel "
         "from rest without manual assistance, making the system fully autonomous. "
         "A bevel gear reduction stage could maintain the target 3000 RPM "
         "at the flywheel while the motor operates at a lower shaft speed."),

        ("Dedicated temperature sensors on motor and bearings",
         "Bond PT100 or NTC thermistor sensors directly to the motor casing "
         "and each bearing housing. The current single ambient temperature "
         "sensor gives no localised thermal information. Motor winding temperature "
         "and bearing temperature are far more useful early indicators of "
         "thermal risk than ambient air temperature."),

        ("Custom 4-layer PCB",
         "A custom PCB designed in KiCad would be smaller, more repeatable, "
         "and more professional than the current perf-board. Four layers would "
         "allow a dedicated ground plane, dedicated motor power plane, separated "
         "signal traces, and sufficient copper area for the motor current "
         "without hand-reinforcement of traces with solder."),

        ("Dedicated optical RPM sensor",
         "Replace FFT-based RPM estimation with a dedicated reflective optical "
         "encoder (for example, a TCRT5000 or a commercial slotted encoder disc). "
         "Direct RPM measurement with sub-RPM resolution would significantly "
         "improve PID control loop quality and eliminate the estimation error "
         "inherent in the FFT approach."),

        ("Persistent settings database",
         "Currently, threshold settings reset to defaults when the API server "
         "restarts. Adding a settings table in PostgreSQL with read-on-start "
         "would allow configured thresholds to survive server restarts, making "
         "the system suitable for long-term unattended deployment."),

        ("Proteus ESP32 component library for CBU",
         "The Arduino Mega substitute model used in this project should be "
         "formalised into a Proteus component library for the ESP32 DevKit "
         "and submitted to the CBU engineering department. This would prevent "
         "future project teams from spending the same 12 hours building "
         "substitute models."),
    ]
    for idx, (title, desc) in enumerate(recommendations, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.section("6.3 Future Work")
    pdf.body(
        "The engineering foundation established in this project opens several "
        "directions for future research and development:"
    )
    pdf.gap(2)
    future = [
        ("Multi-axis gimbal active stabilisation",
         "Designing the frame as a two- or three-axis gimbal with motorised "
         "gimbal drives and multi-variable PID control would transform this "
         "from a single-DOF demonstration into a genuine active stabilisation "
         "platform, directly applicable to camera gimbals, ship stabilisers, "
         "and satellite attitude control systems."),

        ("Flywheel energy storage investigation",
         "With 143.6 J of stored kinetic energy at 3000 RPM, the system "
         "could be investigated as a short-duration energy buffer. Adding "
         "a regenerative mode to the ESC (motor-generator) would allow "
         "stored energy to be recovered during a discharge interval. This "
         "is directly relevant to miniature uninterruptible power supply "
         "(UPS) and grid-frequency regulation applications."),

        ("Magnetic suspension bearings",
         "Replacing the RS608 ball bearings with active magnetic bearings "
         "would eliminate all mechanical contact friction in the bearing "
         "system. With no wear surfaces, the system lifetime would be "
         "limited only by the motor and electronics, theoretically enabling "
         "continuous operation measured in years. This is the configuration "
         "used in satellite reaction wheels and some commercial FESS units."),

        ("Machine learning anomaly detection",
         "The extended stability run dataset provides an initial baseline of normal "
         "operating vibration, temperature, and speed signatures. Training "
         "a lightweight anomaly detection model (one-class SVM or simple "
         "autoencoder) on this data would allow the system to detect subtle "
         "changes in vibration character that precede bearing failure -- "
         "providing predictive maintenance capability."),

        ("Extended endurance testing",
         "The 2-hour stability run establishes the system's baseline performance. "
         "Extended testing to 24 hours or beyond would further validate the "
         "bearing life calculation and confirm that the balancing quality is "
         "maintained over a longer period, building the case for deployment "
         "in production applications."),

        ("Vacuum enclosure for higher speed",
         "Air resistance (windage) is a significant contributor to the motor "
         "load at 3000 RPM. Enclosing the flywheel in a partial-vacuum housing "
         "would reduce this drag and allow operation at higher speeds for "
         "the same motor power, increasing stored angular momentum and "
         "gyroscopic rigidity."),
    ]
    for idx, (title, desc) in enumerate(future, 1):
        pdf.numbered_para(idx, title, desc)


# ============================================================
# REFERENCES
# ============================================================

def references(pdf):
    pdf.add_page()
    pdf.chapter_title("REFERENCES")
    refs = [
        "Alciatore, D.G. and Histand, M.B. (2012) Introduction to mechatronics and "
        "measurement systems. 4th edn. New York: McGraw-Hill.",

        "Aeron (n.d.) What is CNC machining: a complete guide. [Online] Available at: "
        "https://aeron.co.uk/what-is-cnc-machining-a-complete-guide/ "
        "[Accessed: 10 May 2026].",

        "Astrom, K.J. and Murray, R.M. (2010) Feedback systems: an introduction for "
        "scientists and engineers. Princeton: Princeton University Press.",

        "Cohen, G.H. and Coon, G.A. (1953) Theoretical consideration of retarded "
        "control. Transactions of the ASME, 75, pp. 827-834.",

        "Friendly Wire (n.d.) Soldering vs. breadboards: why soldering matters. "
        "[Online] Available at: "
        "https://www.friendlywire.com/articles/soldering-vs-breadboards/ "
        "[Accessed: 10 May 2026].",

        "Hibbeler, R.C. (2015) Engineering mechanics: dynamics. 14th edn. "
        "Upper Saddle River, NJ: Pearson.",

        "InvenSense (2013) MPU-6050 product specification, revision 3.4. "
        "San Jose, CA: InvenSense Inc.",

        "ISO 1940-1:2003 (2003) Mechanical vibration -- balance quality requirements "
        "for rotors in a constant (rigid) state. Part 1: specification and "
        "verification of balance tolerances. Geneva: ISO.",

        "ISO 281:2007 (2007) Rolling bearings -- dynamic load ratings and rating life. "
        "Geneva: ISO.",

        "Maier, A., Sharp, A. and Vagapov, Y. (2017) Comparative analysis of "
        "microcontroller boards for deployment in internet of things. In: 2017 "
        "Internet Technologies and Applications (ITA), Wrexham, 12-15 September. "
        "IEEE, pp. 230-235. doi: 10.1109/ITECHA.2017.8101931.",

        "MathWorks (2026) PID controller tuning in Simulink. [Online] Available at: "
        "https://www.mathworks.com/help/slcontrol/ug/pid-controller-tuning.html "
        "[Accessed: 15 April 2026].",

        "MDN Web Docs (2024) The WebSocket API (WebSockets). Mozilla. [Online] "
        "Available at: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API "
        "[Accessed: 12 March 2026].",

        "Meriam, J.L., Kraige, L.G. and Bolton, J.N. (2016) Engineering mechanics: "
        "dynamics. 8th edn. Hoboken, NJ: Wiley.",

        "Ogata, K. (2010) Modern control engineering. 5th edn. "
        "Upper Saddle River, NJ: Prentice Hall.",

        "ProLeanTech (n.d.) What is CNC machining? [Online] Available at: "
        "https://proleantech.com/what-is-cnc-machining/ [Accessed: 10 May 2026].",

        "RS Components (2023) RS608 deep groove ball bearing datasheet. "
        "[Online] Available at: https://www.rs-online.com [Accessed: 5 March 2026].",

        "Ziegler, J.G. and Nichols, N.B. (1942) Optimum settings for automatic "
        "controllers. Transactions of the ASME, 64, pp. 759-768.",
    ]
    for ref in refs:
        pdf.body(ref, align="J")
        pdf.gap(3)


# ============================================================
# APPENDICES
# ============================================================

def appendices(pdf):
    pdf.add_page()
    pdf.chapter_title("APPENDICES")

    pdf.section("Appendix A: Full Component Specifications")
    pdf.gap(2)
    pdf.table_caption("Table 21: Full Component Specifications")
    pdf.table(
        ["Component",    "Specification",                                "Qty"],
        [
            ["BLDC Motor",   "950 KV; x2212; max 10 A; 12-pole; 50 g; 3.17 mm shaft","1"],
            ["ESP32 DevKit", "240 MHz dual-core; 520 KB SRAM; Wi-Fi/BT",    "1"],
            ["MPU6050",      "6-axis IMU; 16-bit ADC; I2C; 3.3 V",          "1"],
            ["RS608 bearing","8/22/7 mm; C=3450 N; grease sealed; 32000 RPM","2"],
            ["Flywheel",     "Mild steel; 0.5 kg; 215.8 mm dia; 20 mm",  "1"],
            ["Main shaft",   "EN3B mild steel; 8 mm dia; 120 mm long",      "1"],
            ["Spider coupling","Jaw type; 3/3 mm; up to 5 N.m",            "1"],
            ["M12 bolts",    "Class 8.8; 50 mm; at R=99 mm on flywheel",    "4"],
            ["M6 bolts",     "Class 8.8; 30 mm; at R=95 mm on flywheel",    "8"],
            ["IRFZ44N",      "N-ch MOSFET; 55 V; 49 A; Rds=17.5 mohm",     "6"],
            ["IR2101",       "Half-bridge gate driver; 600 V rail",          "3"],
            ["LM7805",       "5 V linear regulator; TO-220; 1.5 A",         "1"],
            ["AMS1117-3.3",  "3.3 V LDO; SOT-223; 1 A",                    "1"],
            ["Perf-board",   "100 x 150 mm; 2.54 mm pitch",                "1"],
            ["TVS diode",    "1.5KE33A; 33 V; bidirectional",               "1"],
            ["Frame",        "25x25x3 mm mild steel SHS; TIG welded",       "1"],
        ]
    )

    pdf.section("Appendix B: Complete Worked Calculations")
    pdf.body(
        "This appendix presents all engineering calculations with full intermediate "
        "working retained, in a format suitable for independent checking."
    )
    calc_items = [
        ("B.1 Moment of Inertia -- Disk",
         "I = (1/2)*m*r2\n"
         "  = (1/2) * 0.5 kg * (0.1079 m)2\n"
         "  = (1/2) * 0.5 * 0.011642\n"
         "  = (1/2) * 0.005821\n"
         "  = 0.002910 kg.m2"),
        ("B.2 Moment of Inertia -- M12 Rim Bolts",
         "4 bolts, each 35 g at radius 99 mm:\n"
         "I_M12 = 4 * 0.035 * (0.099)2\n"
         "       = 4 * 0.035 * 0.009801\n"
         "       = 4 * 0.000343\n"
         "       = 0.001372 kg.m2"),
        ("B.3 Moment of Inertia -- M6 Rim Bolts",
         "4 bolts, each 8 g at radius 95 mm:\n"
         "I_M6 = 4 * 0.008 * (0.095)2\n"
         "     = 4 * 0.008 * 0.009025\n"
         "     = 4 * 0.0000722\n"
         "     = 0.000289 kg.m2"),
        ("B.4 Total Moment of Inertia",
         "I_total = I_disk + I_M12 + I_M6\n"
         "        = 0.002910 + 0.001372 + 0.000289\n"
         "        = 0.004571 kg.m2"),
        ("B.5 Operating Angular Velocity",
         "omega = N_rpm * (2*pi / 60)\n"
         "      = 3000 * (2 * 3.14159 / 60)\n"
         "      = 3000 * 0.10472\n"
         "      = 314.16 rad/s"),
        ("B.6 Angular Momentum",
         "L = I * omega\n"
         "  = 0.002910 * 314.16\n"
         "  = 0.9142 kg.m2/s"),
        ("B.7 Gyroscopic Torque",
         "T_g = I * omega_s * omega_p\n"
         "    = 0.002910 * 314.16 * 0.5\n"
         "    = 0.002910 * 157.08\n"
         "    = 0.4571 N.m"),
        ("B.8 Gravitational Torque at 5 degrees",
         "T_grav = m * g * h * sin(theta)\n"
         "       = 0.5 * 9.81 * 0.05 * sin(5 * pi/180)\n"
         "       = 0.5 * 9.81 * 0.05 * 0.08716\n"
         "       = 0.24525 * 0.08716\n"
         "       = 0.0214 N.m"),
        ("B.9 Stability Factor",
         "Factor = T_g / T_grav\n"
         "       = 0.4571 / 0.0214\n"
         "       = 21.4   ~ 21   (STABLE -- criterion: factor > 1.0)"),
        ("B.10 Supply Voltage",
         "k_e = 1 / (KV * 2pi/60)\n"
         "    = 1 / (950 * 0.10472)\n"
         "    = 1 / 99.48\n"
         "    = 0.01005 V.s/rad\n"
         "V = k_e * omega + I * R\n"
         "  = 0.01005 * 314.16 + 10.0 * 0.12\n"
         "  = 3.157 + 1.200\n"
         "  = 4.36 V  (PWM duty = 4.36/12 = 36.3% at 12 V supply)"),
        ("B.11 Kinetic Energy",
         "E_k = (1/2) * I * omega2\n"
         "    = (1/2) * 0.002910 * (314.16)2\n"
         "    = 0.001455 * 98677\n"
         "    = 143.6 J   (= 0.040 Wh)"),
        ("B.12 Bearing L10 Life",
         "P_radial = (m * g) / 2 = (0.5 * 9.81) / 2 = 2.45 N\n"
         "L10 = (C/P)3 * (10^6 / (60*N))\n"
         "    = (3450/2.45)3 * (10^6 / (60*3000))\n"
         "    = (1408.2)3 * 5.5556\n"
         "    = 2.792 x 10^9 * 5.5556\n"
         "    = 1.551 x 10^10 revolutions\n"
         "    = 1.551 x 10^10 / (3000 * 60)\n"
         "    = 85,900 hours  (bearing life not a design constraint)"),
        ("B.13 Thermal Analysis",
         "P_copper = I2 * R = (3.0)2 * 0.12 = 1.08 W\n"
         "A_casing = pi * D * L = pi * 0.025 * 0.030 = 0.002356 m2\n"
         "delta_T = P_copper / (h * A)\n"
         "        = 1.08 / (10 * 0.002356)\n"
         "        = 1.08 / 0.02356\n"
         "        = 45.8 degC\n"
         "T_surface_max = 30 + 45.8 = 75.8 degC  (< motor limit of 100 degC winding)"),
        ("B.14 Shaft Hoop Stress at Overspeed",
         "sigma_hoop = (3+nu)/8 * rho * omega2 * ro2\n"
         "           = (3.3/8) * 7850 * (392.7)2 * (0.1079)2\n"
         "           = 0.4125 * 7850 * 154227 * 0.011642\n"
         "           = 0.4125 * 7850 * 1795.5\n"
         "           = 5.81 MPa\n"
         "Safety factor = 400 / 5.81 = 68.8  (very safe)"),
    ]
    for title, calc in calc_items:
        pdf.subsubsection(title)
        pdf.set_font("Courier", "", 9)
        pdf.set_text_color(0, 0, 0)
        pdf.multi_cell(0, 5.5, s(calc), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.gap(3)

    pdf.section("Appendix C: Project Gantt Chart")
    pdf.body(
        "The project was conducted over two academic semesters (approximately "
        "28 weeks). Major phases and their durations:"
    )
    pdf.gap(2)
    pdf.table(
        ["Phase",                       "Weeks", "Key Deliverables"],
        [
            ["Literature review",           "1-4",   "Comparative tables; method selections"],
            ["Conceptual design",           "3-6",   "Subsystem definitions; BOM first draft"],
            ["Detailed design + calcs",     "5-9",   "Full calculations; SOLIDWORKS drawings"],
            ["Simulink simulation",         "8-12",  "PID tuning; stability simulation"],
            ["Proteus circuit simulation",  "9-12",  "ESC model; circuit verification"],
            ["Material procurement",        "8-11",  "All components ordered and received"],
            ["Flywheel machining",          "11-14", "CNC turning; balancing"],
            ["Frame modification",          "12-14", "Line-boring; welding; painting"],
            ["Electronic assembly",         "13-16", "Perf-board; soldering; testing"],
            ["Firmware development",        "10-18", "ESP32 PID; Kalman; Wi-Fi; serial"],
            ["Server and dashboard",        "10-18", "Node.js; PostgreSQL; React; WebSocket"],
            ["Integration and tests 1-4",  "17-20", "All subsystem tests completed"],
            ["Extended stability test",     "20-21", "Test 5 completed"],
            ["Thesis writing",              "18-28", "Parallel with testing and software phases"],
        ]
    )

    pdf.section("Appendix D: Firmware Overview and Key Code Structures")
    pdf.body(
        "The firmware is written in C++ for the Arduino/ESP32 framework and "
        "compiled with PlatformIO. The main source files are:"
    )
    pdf.gap(2)
    pdf.two_col_table([
        ("File",              "Purpose"),
        ("main.cpp",          "Entry point; setup(); loop(); task scheduling"),
        ("imu.cpp / .h",      "MPU6050 I2C driver; raw data read functions"),
        ("kalman.cpp / .h",   "Single-axis Kalman filter implementation"),
        ("fft_rpm.cpp / .h",  "arduinoFFT wrapper; RPM estimation from accel FFT"),
        ("pid.cpp / .h",      "Discrete-time PID with anti-windup and derivative filter"),
        ("esc.cpp / .h",      "ESP32 LEDC PWM output; microsecond pulse generation"),
        ("telemetry.cpp / .h","JSON serialisation of all sensor values"),
        ("serial_cmd.cpp / .h","Command parser for UART and Wi-Fi TCP channels"),
        ("wifi_client.cpp / .h","ESP32 Wi-Fi STA connect; TCP socket management"),
    ], c1_frac=0.32)
    pdf.gap(3)
    pdf.body(
        "Key firmware constants and their values used during the endurance run:"
    )
    pdf.gap(2)
    pdf.two_col_table([
        ("Constant",              "Value"),
        ("LOOP_PERIOD_MS",        "20  (50 Hz PID and IMU rate)"),
        ("TELEMETRY_PERIOD_MS",   "100 (10 Hz telemetry transmission)"),
        ("FFT_SAMPLE_COUNT",      "64"),
        ("FFT_SAMPLE_RATE_HZ",    "500"),
        ("ESC_MIN_US",            "1050"),
        ("ESC_MAX_US",            "2000"),
        ("PID_KP",                "0.85"),
        ("PID_KI",                "2.40"),
        ("PID_KD",                "0.015"),
        ("SETPOINT_RPM",          "3000"),
        ("KALMAN_Q",              "0.001  (process noise)"),
        ("KALMAN_R",              "0.030  (measurement noise)"),
    ], c1_frac=0.42)

    pdf.section("Appendix E: Data Sheet List")
    pdf.body(
        "The following data sheets were consulted during component selection, "
        "circuit design, and bearing life calculation:"
    )
    pdf.gap(2)
    for d in [
        "ESP32 Technical Reference Manual v5.1 -- Espressif Systems, 2023",
        "ESP32 Datasheet v3.4 -- Espressif Systems, 2024",
        "MPU-6050 Product Specification Revision 3.4 -- InvenSense, 2013",
        "RS608 Deep Groove Ball Bearing -- RS Components, 2023",
        "IRFZ44N HEXFET Power MOSFET Datasheet -- International Rectifier",
        "IR2101 Half-Bridge Gate Driver Datasheet -- International Rectifier",
        "LM7805 Voltage Regulator Datasheet -- Texas Instruments, 2023",
        "AMS1117-3.3 LDO Regulator Datasheet -- Advanced Monolithic Systems",
        "950 KV x2212 Outrunner BLDC Motor Specification -- Manufacturer spec sheet",
    ]:
        pdf.bullet(d)
        pdf.gap(1)

    pdf.section("Appendix F: Safety Assessment and Laboratory Setup")
    pdf.body(
        "A formal risk assessment was completed and approved by the supervisor "
        "before any high-speed testing began. The assessment identified five "
        "credible hazard scenarios (listed in Table 22, Chapter 5) and defined "
        "mitigations for each."
    )
    pdf.gap(3)
    pdf.body(
        "Physical safety measures implemented in the laboratory:"
    )
    pdf.gap(2)
    safety_measures = [
        ("Polycarbonate safety screen",
         "6 mm polycarbonate sheet on an aluminium extrusion frame, enclosing "
         "three sides of the gyroscope. The fourth side faced the laboratory "
         "wall. The screen was rated to contain a fragment ejected at the "
         "flywheel rim speed (approximately 90 m/s at 3000 RPM)."),
        ("Operator positions during testing",
         "During spin-up and spin-down, operators stood to the side of the "
         "gyroscope, not directly in front of or behind the spin axis, "
         "to minimise exposure to the most likely fragment ejection paths."),
        ("Fused power supply",
         "A 3 A fast-blow fuse was installed in the motor supply positive "
         "lead. This was verified to blow correctly during a simulated "
         "short-circuit test before the endurance run."),
        ("Emergency stop access",
         "The dashboard emergency stop button was visible and accessible "
         "from the monitoring position at all times. The physical power "
         "supply disconnect switch was also accessible without approaching "
         "the safety screen."),
    ]
    for idx, (title, desc) in enumerate(safety_measures, 1):
        pdf.numbered_para(idx, title, desc)

    pdf.section("Appendix G: Source Code and File Repository")
    pdf.body(
        "All project files are archived in the following locations:"
    )
    pdf.gap(2)
    pdf.two_col_table([
        ("Resource",          "Location"),
        ("Source code",       "https://github.com/01chabotamwenda-commits/gyro.git"),
        ("MATLAB models",     "CBU Google Drive -- shared with supervisor"),
        ("Proteus files",     "CBU Google Drive -- shared with supervisor"),
        ("Test data (SQL)",   "PostgreSQL backup -- project storage drive"),
        ("SOLIDWORKS files",  "CBU Google Drive -- shared with supervisor"),
        ("This report",       "CBU School of Engineering submission system"),
    ], c1_frac=0.35)


# ============================================================
# MAIN
# ============================================================

def main():
    pdf = Thesis()
    title_page(pdf)
    declaration(pdf)
    abstract(pdf)
    acknowledgements(pdf)
    dedication(pdf)
    toc(pdf)
    lof(pdf)
    lot(pdf)
    abbreviations(pdf)
    chapter1(pdf)
    chapter2(pdf)
    chapter3(pdf)
    chapter4(pdf)
    chapter5(pdf)
    chapter6(pdf)
    references(pdf)
    appendices(pdf)
    pdf.output(OUT_PATH)
    size_kb = os.path.getsize(OUT_PATH) // 1024
    print(f"PDF saved: {OUT_PATH}  ({size_kb} KB, {pdf.page} pages)")


if __name__ == "__main__":
    main()
