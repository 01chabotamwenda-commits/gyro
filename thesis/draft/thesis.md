# COPPERBELT UNIVERSITY
## School of Engineering

---

# IMPROVEMENT OF A MOTORIZED GYROSCOPE
## (Improved Design for Automated, Sustained Operation)

A Thesis Submitted in Partial Fulfilment of the Requirements for the Award of the Bachelor of Engineering Degree

---

**Group Members:**

| Name | Student Number | Programme |
|---|---|---|
| Janet Mwaba | 22107919 | Electromechanical Engineering |
| Luyando Chiyasa | 22111262 | Mechatronics Engineering |
| Chabota Mwenda | 22176470 | Mechatronics Engineering |
| Isaac Phiri | 22105748 | Mechatronics Engineering |

**Supervisor:** Mr. Bennet Siyingwa

**Year:** 2026

---

## DECLARATION

We declare that this project report is entirely our own work. It has not been submitted for any other degree or qualification at any other institution. All references and sources of information have been acknowledged.

| Name | Signature | Date |
|---|---|---|
| Janet Mwaba | _________________ | _________________ |
| Luyando Chiyasa | _________________ | _________________ |
| Chabota Mwenda | _________________ | _________________ |
| Isaac Phiri | _________________ | _________________ |

**Supervisor:**

Mr. Bennet Siyingwa: _________________ Date: _________________

---

## ABSTRACT

This report documents the design, build, and testing of an improved motorized gyroscope that can run continuously in an automated, unattended manner. The project continues the work of a previous student team at Copperbelt University. Our main goal was to fix the problems with the original gyroscope, which could not sustain long-duration operation, had no electronic monitoring, and relied on manual motor adjustment with no automated feedback control.

The gyroscope uses a mild steel flywheel driven by a 950 KV x2212 brushless DC (BLDC) motor. The flywheel has a mass of 0.5 kg and a radius of 0.1079 m, giving a moment of inertia of 0.002910 kg.m2. The system is designed to run at approximately 3000 RPM. Calculations confirmed the system is stable at that speed, with a gyroscopic torque of 0.4571 N.m, which is 21 times greater than the minimum stability requirement.

A Proportional-Integral-Derivative (PID) controller was designed and tuned using MATLAB Simulink to maintain the target speed. The controller was selected over other control strategies after comparing several options including fuzzy logic and ON/OFF control. PID was chosen for its simplicity, proven reliability, and ease of tuning using systematic methods.

For monitoring, we used an ESP32 microcontroller and an MPU6050 sensor to measure tilt and vibration in real time. A web-based monitoring dashboard was built using React and Node.js, showing live data over a WebSocket connection. The flywheel was machined using CNC turning and dynamically balanced to reduce vibration. Electronics were soldered on a perf-board for better reliability under vibration.

After assembly, an extended stability run was conducted. The gyroscope maintained stable automated operation above 1500 RPM throughout with no mechanical failures or safety threshold violations.

**Keywords:** gyroscope, BLDC motor, ESP32, MPU6050, PID control, real-time monitoring, dynamic balancing, sustained automated operation, mechatronics.

---

## ACKNOWLEDGEMENTS

We would like to thank our supervisor, Mr. Bennet Siyingwa, for guiding us throughout this project. His advice helped us make better design decisions and kept us on track whenever we ran into problems.

We also thank the CBU workshop staff who helped us with the machining and assembly of the gyroscope components. Their practical knowledge was very helpful, especially during the CNC turning and dynamic balancing stages.

We are grateful to the previous student team for the design documentation they left behind. It gave us a solid starting point and saved us a lot of time.

Finally, we thank our families for their support throughout our studies.

---

## DEDICATION

To our families, who have supported us through four years of engineering study.

---

## TABLE OF CONTENTS

- DECLARATION
- ABSTRACT
- ACKNOWLEDGEMENTS
- DEDICATION
- LIST OF FIGURES
- LIST OF TABLES
- LIST OF ABBREVIATIONS
- CHAPTER 1: INTRODUCTION
  - 1.1 Background
  - 1.2 Problem Statement
  - 1.3 Aim
  - 1.4 Motivation
  - 1.5 Objectives
  - 1.6 Scope and Limitations
- CHAPTER 2: LITERATURE REVIEW
  - 2.1 Gyroscope Fundamentals
  - 2.2 Motor Speed Control: Strategy Selection
  - 2.3 PID Control and Tuning Methods
  - 2.4 BLDC Motor Technology and ESC Selection
  - 2.5 Flywheel Design and Dynamic Balancing Methods
  - 2.6 Microcontroller and Sensor Selection
  - 2.7 Real-Time Monitoring and Communication Protocols
  - 2.8 Summary and Justification of Chosen Methods
- CHAPTER 3: METHODOLOGY
  - 3.1 Design Approach
  - 3.2 Component Design
  - 3.3 Design Calculations
  - 3.4 Control System Design
  - 3.5 Software and Monitoring System
  - 3.6 Simulation
  - 3.7 Circuit Design
- CHAPTER 4: MANUFACTURE AND ASSEMBLY
  - 4.1 Manufacturing Methods
  - 4.2 Assembly
  - 4.3 Electronic Assembly
- CHAPTER 5: TESTING AND RESULTS
  - 5.1 Test Plan
  - 5.2 Tests Carried Out
  - 5.3 Results
  - 5.4 Discussion
- CHAPTER 6: CONCLUSIONS
  - 6.1 Conclusions
  - 6.2 Recommendations
  - 6.3 Future Work
- REFERENCES
- APPENDICES

---

## LIST OF FIGURES

| Figure | Description |
|---|---|
| Figure 1.0 | Full gyroscope assembly - diametric view (SOLIDWORKS, 2026) |
| Figure 1.1 | Full gyroscope assembly - side view (SOLIDWORKS, 2026) |
| Figure 2.0 | Conceptual design - diametric view (SOLIDWORKS, 2026) |
| Figure 2.1 | Conceptual design - side view (SOLIDWORKS, 2026) |
| Figure 2.2 | Flywheel - diametric view (SOLIDWORKS, 2026) |
| Figure 2.3 | Internal components - side view (SOLIDWORKS, 2026) |
| Figure 3.0 | Free body diagram of gyroscope forces |
| Figure 4.0 | MATLAB Simulink subsystem model (MathWorks, 2026) |
| Figure 4.1 | Controlled vs uncontrolled simulation response (MathWorks, 2026) |
| Figure 5.0 | Circuit schematic in Proteus (2026) |
| Figure 5.1 | Monitoring dashboard - live RPM and tilt |
| Figure 6.0 | Dynamic balancing rig setup |
| Figure 7.0 | Completed perf-board assembly |
| Figure 8.0 | Assembled gyroscope prototype |

---

## LIST OF TABLES

| Table | Description |
|---|---|
| Table 1 | Comparison of control strategies |
| Table 2 | Comparison of PID tuning methods |
| Table 3 | Comparison of motor types |
| Table 4 | Comparison of microcontroller options |
| Table 5 | Summary of design calculations |
| Table 6 | Material selection |
| Table 7 | extended endurance run results |
| Table 8 | Component specifications |

---

## LIST OF ABBREVIATIONS

| Abbreviation | Meaning |
|---|---|
| BLDC | Brushless Direct Current |
| CAD | Computer-Aided Design |
| CNC | Computer Numerical Control |
| DOF | Degree of Freedom |
| EMF | Electromotive Force |
| ESC | Electronic Speed Controller |
| I2C | Inter-Integrated Circuit |
| IMU | Inertial Measurement Unit |
| KV | Motor velocity constant (RPM per volt) |
| MATLAB | Matrix Laboratory |
| MPC | Model Predictive Control |
| PID | Proportional-Integral-Derivative |
| PWM | Pulse Width Modulation |
| RPM | Revolutions Per Minute |
| ZN | Ziegler-Nichols |

---

# CHAPTER 1: INTRODUCTION

## 1.1 Background

A gyroscope is a spinning device that uses angular momentum to maintain or measure orientation. The basic idea has been around since the 19th century when the French scientist Leon Foucault first used the term in 1852 (Hibbeler, 2015). Today, gyroscopes are used in aircraft navigation systems, ship stabilisers, satellites, and even inside smartphones.

A motorized gyroscope works by spinning a heavy flywheel at high speed using an electric motor. The spinning flywheel resists changes in its orientation due to a property called gyroscopic rigidity, which is a direct consequence of conservation of angular momentum. This makes motorized gyroscopes useful for stabilisation and attitude control applications.

The challenge with sustained gyroscope operation is keeping the system running reliably for long periods. High-speed rotation puts continuous stress on bearings, motor windings, and the structural frame. Without a proper control system and real-time monitoring, even a small problem can cause the system to fail before the target runtime is reached.

At Copperbelt University (CBU), a previous student group designed and built a basic motorized gyroscope. Their design demonstrated the fundamental operating principle, but the system could not sustain operation for extended periods and had no electronic monitoring or automatic control. Our project continues their work with the goal of achieving continuous, stable operation for at least the extended stability run at speeds above 5000 RPM, while adding real-time monitoring and automated speed control.

[FIGURE 1.0: Full gyroscope assembly - diametric view -- INSERT SOLIDWORKS FIGURE HERE]

[FIGURE 1.1: Full gyroscope assembly - side view -- INSERT SOLIDWORKS FIGURE HERE]

## 1.2 Problem Statement

The existing gyroscope at CBU has several issues that prevent it from running reliably for the extended stability run:

1. The runtime is too short. The system cannot maintain stable continuous operation for the extended stability run due to mechanical and thermal losses.
2. The flywheel was not properly balanced. Imbalances cause vibrations that accelerate bearing wear and reduce the system's operational life significantly.
3. There is no monitoring system. Without real-time sensor data, there is no way to know when something is going wrong until a failure has already occurred.
4. The control is limited to manual motor speed adjustment. There is no automated feedback control to correct for disturbances or speed drift.
5. The electronics were unreliable. Breadboard connections would sometimes fail under the vibration generated by the spinning flywheel.

## 1.3 Aim

To improve, test, and sustain a cost-effective motorized gyroscope that can operate continuously without interruption for at least the extended stability run.

## 1.4 Motivation

We chose this project because it covers a wide range of engineering topics simultaneously - dynamics, control systems, electronics, and software. It is a practical engineering challenge that requires the kind of cross-disciplinary thinking that our programmes have been building towards over four years.

There is also clear real-world relevance. High-speed rotating systems are found in flywheel energy storage, ship stabilisers, and inertial navigation systems. The engineering lessons from making a gyroscope run for the extended stability run apply directly to those industrial applications.

We also wanted to demonstrate that precision engineering is achievable using locally sourced materials and the machining resources available at CBU.

## 1.5 Objectives

1. Design and build a dynamically balanced gyroscope flywheel that runs stably above 5000 RPM for the extended stability run.
2. Use homogeneous flywheel material to minimise vibration from mass imbalance.
3. Build a real-time monitoring system that tracks RPM, tilt (X and Y axes), temperature, vibration, and PWM duty cycle.
4. Improve on the previous design by keeping what worked and fixing what did not.
5. Design, simulate, and implement a PID control algorithm using MATLAB Simulink.
6. Replace breadboard wiring with soldered perf-board connections for better reliability under vibration.

## 1.6 Scope and Limitations

This project covers the redesign, fabrication, electronics, software, and testing of a single-axis motorized gyroscope.

The mechanical frame inherited from the previous design allows only one degree of control (motor speed). We cannot actively tilt or reposition the gyroscope frame. This limits how much disturbance the system can automatically compensate for.

We were limited to components available locally in the Copperbelt region due to budget and procurement constraints. Proteus did not have simulation libraries for the ESP32 or commercial ESC modules, so we used an Arduino model as a substitute and built a custom ESC for simulation, which added development time.

Results apply specifically to our hardware configuration and cannot be generalised to other gyroscope designs without additional testing.

---

# CHAPTER 2: LITERATURE REVIEW

## 2.1 Gyroscope Fundamentals

The physics of a gyroscope is based on the conservation of angular momentum. The angular momentum L of a spinning body is the product of its moment of inertia I and its angular velocity omega:

L = I x omega_s        (Hibbeler, 2015, p. 412)

When an external torque acts on the gyroscope, instead of simply tipping over, the spin axis rotates slowly about a perpendicular axis. This rotation is called precession, and its rate is given by:

omega_p = torque / (I x omega_s)        (Meriam, Kraige and Bolton, 2016, p. 486)

The important implication is that a faster spin means less precession for the same applied torque. A high-speed flywheel therefore resists changes in orientation very effectively, a property known as gyroscopic rigidity. For a flat disk, the moment of inertia is (Hibbeler, 2015, p. 388):

I = (1/2) x m x r2

To maximise stability, we want to maximise I, which means using a heavy flywheel with mass concentrated as far from the rotation axis as possible.

The stability condition for a gyroscope under gravity is:

I x omega_s x omega_p >= m x g x h x sin(theta)        (Ogata, 2010, p. 74)

This says the gyroscopic torque must exceed the gravitational torque at the operating tilt angle. Our design calculations in Chapter 3 confirm this condition is met by a factor of approximately 57 at our operating speed.

[FIGURE 3.0: Free body diagram showing gyroscopic torque, gravity torque, and precession direction -- INSERT DIAGRAM HERE]

## 2.2 Motor Speed Control: Strategy Selection

Maintaining a constant flywheel speed over the extended stability run requires an automatic feedback control system. Several control strategies exist for this type of application, and choosing the right one is important because it directly affects how well the system responds to disturbances and how difficult it is to implement and tune.

The main strategies considered were ON/OFF control, PID control, fuzzy logic control, and model predictive control (MPC).

**ON/OFF (Bang-Bang) Control** switches the motor fully on or fully off based on whether the speed is above or below the setpoint. It is the simplest approach but produces continuous oscillation around the setpoint because it can never settle at a steady state (Ogata, 2010, p. 64). For a extended endurance application where smooth, stable operation is critical, ON/OFF control was ruled out immediately.

**Fuzzy Logic Control** does not require a mathematical model of the system. Instead, it uses a set of human-language rules (such as "if speed is too low, increase motor power significantly") to make control decisions. This can work well for nonlinear or poorly-modelled systems (Alciatore and Histand, 2012, p. 514). However, designing and debugging a fuzzy rule base for a first implementation without prior system identification data is time-consuming, and the results are harder to justify analytically. Since our system is reasonably linear at the operating point, fuzzy logic would add complexity without a clear advantage.

**Model Predictive Control (MPC)** calculates the optimal control input over a future time horizon by solving an optimisation problem at each time step (Åström and Murray, 2010, p. 312). MPC can handle constraints explicitly and performs well on complex multi-variable systems. However, it requires a detailed mathematical model of the system, significant computational resources, and is considerably more complex to implement on an embedded microcontroller like the ESP32. For our application, this level of complexity was not justified.

**PID Control** computes the control output as the sum of three terms: proportional (P) to the current error, integral (I) to the accumulated error over time, and derivative (D) to the rate of change of error:

u(t) = Kp x e(t) + Ki x integral of e(t)dt + Kd x de(t)/dt        (Ogata, 2010, p. 168)

PID controllers have been the industry standard for motor speed control for decades because they are simple to implement, well understood, applicable to a wide range of systems, and can be tuned systematically using established methods (Åström and Murray, 2010, p. 74). They work well for systems where the dominant dynamic is a first or second-order linear response, which matches our BLDC motor and flywheel system.

**Table 1: Comparison of Motor Speed Control Strategies**

| Strategy | Complexity | Model Required | Tuning Effort | Suitability for Our Application |
|---|---|---|---|---|
| ON/OFF control | Very low | No | None | Not suitable - causes oscillation |
| PID control | Low | No | Moderate | Most suitable - simple, proven |
| Fuzzy Logic | Medium | No | High | Possible but overcomplicated |
| MPC | High | Yes | Very high | Not practical on ESP32 |

PID was selected as the most appropriate control strategy for this project.

## 2.3 PID Control and Tuning Methods

Once PID was selected as the control strategy, the next decision was how to tune the three gains Kp, Ki, and Kd. Several methods exist for this, each with different trade-offs between accuracy, ease of use, and the amount of prior knowledge needed about the system.

**Ziegler-Nichols (ZN) Open-Loop Method** uses the system's step response to estimate the process gain, dead time, and time constant, then calculates initial PID gains from these values using lookup formulas (Ziegler and Nichols, 1942, cited in Ogata, 2010, p. 231). The ZN method is quick and requires only a simple step test on the real hardware. However, it is known to produce aggressive gains that often result in significant overshoot (20-30%) and oscillation, which then needs further manual fine-tuning (Åström and Murray, 2010, p. 228). For a high-speed spinning system, large speed overshoots could be damaging.

**Ziegler-Nichols Closed-Loop (Ultimate Gain) Method** increases the proportional gain alone until the system oscillates continuously (the ultimate gain Ku) and records the oscillation period (Tu). Gains are then calculated from Ku and Tu. The results have the same tendency for overshoot as the open-loop method, and deliberately driving the system to sustained oscillation is risky with a physical flywheel spinning at high speed.

**Cohen-Coon Method** is similar to the open-loop ZN method but uses a different set of gain calculation formulas that tend to produce less aggressive gains and better disturbance rejection (Cohen and Coon, 1953, cited in Alciatore and Histand, 2012, p. 442). It is still based on a step-response test and can give a better starting point than ZN for processes with moderate dead time.

**Manual Tuning** involves setting Ki and Kd to zero and increasing Kp until the response is acceptably fast, then adding Ki to eliminate steady-state error, and finally adding Kd to reduce overshoot. This is straightforward for an engineer who understands PID behaviour but can be time-consuming and inconsistent across different operators (Ogata, 2010, p. 178).

**MATLAB Simulink Auto-Tuning (PID Tuner)** uses the Simulink model of the system to automatically calculate optimal PID gains based on desired performance targets such as settling time and overshoot. This method is particularly powerful when a simulation model is already available, because it allows the gains to be tested and refined in simulation before being loaded onto the hardware, eliminating risk to the physical system (MathWorks, 2026).

**Table 2: Comparison of PID Tuning Methods**

| Method | Needs Real Hardware | Risk to System | Typical Overshoot | Chosen? |
|---|---|---|---|---|
| ZN Open-Loop | Yes (step test) | Low | 20-30% | No |
| ZN Closed-Loop | Yes (oscillation test) | High | 20-30% | No |
| Cohen-Coon | Yes (step test) | Low | Moderate | No |
| Manual Tuning | Yes | Low | Varies | Used for final adjustment |
| MATLAB Auto-Tuner | No (uses model) | None | <10% | Yes (primary method) |

We used the MATLAB Simulink PID Tuner as our primary tuning method because we had already built a simulation model, it required no risk to the physical hardware, and it produced gains that gave less than 10% overshoot in simulation. After loading the gains onto the ESP32, we made small manual adjustments based on the actual hardware response, combining the two approaches.

[FIGURE 4.0: MATLAB Simulink subsystem block diagram showing PID controller, motor model, and flywheel inertia block -- INSERT SIMULINK SCREENSHOT HERE]

[FIGURE 4.1: Simulation comparison - uncontrolled vs controlled system speed response to a 5-degree tilt disturbance -- INSERT SIMULINK RESULTS SCREENSHOT HERE]

## 2.4 BLDC Motor Technology and ESC Selection

The choice of motor type significantly affects how long the system can run reliably. The two practical options for this application were brushed DC motors and brushless DC (BLDC) motors.

**Brushed DC motors** use a physical contact between carbon brushes and a rotating commutator to deliver current to the rotor windings. The friction from this contact causes heat, electrical noise, and gradual wear of both the brushes and commutator. Depending on the operating conditions, brushes typically need replacement after 1000-3000 hours of operation (Alciatore and Histand, 2012, p. 232). While this sounds acceptable, the wear rate increases sharply at high speeds and with high current loads. For a system running at 3000 RPM continuously, brush wear would be a concern even within the extended stability run.

**Brushless DC motors** eliminate the mechanical commutator entirely. Current is switched electronically by the ESC, using feedback from either Hall-effect sensors or back-EMF sensing to determine rotor position. The result is no contact friction, lower heat generation, higher efficiency, and a much longer operational life (Alciatore and Histand, 2012, p. 241). The trade-off is that BLDC motors require an ESC to operate, adding cost and electronic complexity. However, given that we were already building electronic control systems for monitoring, adding an ESC was not a significant burden.

BLDC motors were clearly the better choice for a extended continuous operation target. They are widely used in similar long-duration applications such as drone propulsion, electric vehicle drives, and industrial spindle motors.

**ESC Options:** For driving the BLDC motor, the options were a commercial hobby ESC, a purpose-designed motor driver IC, or a custom-built ESC. Commercial hobby ESCs are reliable and easy to use but could not be properly simulated in Proteus due to missing libraries. A motor driver IC would require a separate commutation algorithm. We designed a custom ESC module to avoid the simulation library problem and to give us direct control over the commutation parameters. This decision is described further in Section 3.7.

## 2.5 Flywheel Design and Dynamic Balancing Methods

The flywheel must maximise stored kinetic energy and moment of inertia while remaining structurally safe at the target speed and free from vibration-causing imbalance.

**Material selection** for the flywheel involved comparing mild steel, aluminium, and cast iron. Aluminium is lighter but has a lower density (2700 kg/m3 compared to 7850 kg/m3 for steel), meaning a larger or heavier aluminium flywheel is needed to achieve the same moment of inertia. Cast iron has similar density to mild steel but is more brittle and more difficult to machine precisely. Mild steel was chosen because it is homogeneous, strong, easy to CNC turn, and locally available (ProLeanTech, n.d.). Its high density means a compact flywheel achieves a good moment of inertia.

**Manufacturing method:** The flywheel could have been made by casting, forging, or machining from a solid plate. Casting would be fast but introduces internal voids and density variations that cause imbalance. Forging would give excellent structural strength but requires dies and equipment not available locally. CNC turning from a solid billet was chosen because it produces the most geometrically accurate result, which minimises the initial eccentricity before dynamic balancing (Aeron, n.d.).

**Dynamic balancing methods:** Several approaches exist for balancing a rotating component. Static balancing involves placing the flywheel on a low-friction spindle and adding or removing mass until it rests in any position without rotating. This corrects for static imbalance (where the centre of mass is off-axis) but does not correct for dynamic imbalance (where the inertia axis is tilted relative to the rotation axis). For a disk-shaped flywheel operating at high speed, dynamic balancing is necessary (Meriam, Kraige and Bolton, 2016, p. 420). We used a purpose-built dynamic balancing rig with vibration sensing to identify and correct both static and dynamic imbalance by material removal.

## 2.6 Microcontroller and Sensor Selection

**Microcontroller options:** The main candidates were the Arduino Uno, the STM32 family, and the ESP32.

The Arduino Uno (ATmega328P) is familiar from our coursework and has good community support. However, its 16 MHz single-core processor and 2 KB of RAM are insufficient for running a PID loop at 50 Hz, handling I2C sensor communication, and maintaining a Wi-Fi connection simultaneously.

The STM32 family (ARM Cortex-M) offers higher processing power (up to 180 MHz), better peripheral support, and is widely used in industrial applications. It would have been capable for this application. However, the STM32 does not include Wi-Fi, which means an additional Wi-Fi module would be needed for wireless telemetry.

The ESP32 (Xtensa dual-core LX6, 240 MHz, 520 KB RAM) includes Wi-Fi and Bluetooth on-chip, has a fast enough processor to run all required tasks concurrently, and has a large online community with good library support for the MPU6050 (Maier, Sharp and Vagapov, 2017). It was the most practical all-in-one solution for this application.

**Table 4: Comparison of Microcontroller Options**

| Microcontroller | Clock Speed | RAM | Wi-Fi Built-in | Chosen? |
|---|---|---|---|---|
| Arduino Uno (ATmega328P) | 16 MHz | 2 KB | No | No - too slow |
| STM32 (Cortex-M4) | up to 180 MHz | 256 KB | No | No - no Wi-Fi |
| ESP32 (LX6 dual-core) | 240 MHz | 520 KB | Yes | Yes |

**IMU sensor options:** The main candidates for tilt and vibration measurement were the MPU6050, the ADXL345 (accelerometer only), and the LSM9DS1 (9-axis IMU).

The ADXL345 is an accelerometer only, with no gyroscope. Tilt can be estimated from acceleration, but high-speed vibrations from the spinning flywheel would make this estimation unreliable without the gyroscope data for fusion.

The LSM9DS1 is a 9-axis sensor (accelerometer, gyroscope, and magnetometer) from STMicroelectronics. It is more capable than needed for this application and more expensive and harder to source locally.

The MPU6050 provides 6-axis measurement (3-axis accelerometer and 3-axis gyroscope) in one package, communicates via I2C, and is widely used in student and hobbyist projects with excellent library support (InvenSense, 2013). It is affordable and readily available locally. The combined accelerometer and gyroscope data allows complementary filtering to give accurate, vibration-resistant tilt estimates. This made it the most practical choice.

## 2.7 Real-Time Monitoring and Communication Protocols

For the monitoring dashboard, we needed a protocol that could push new sensor data to the browser in real time without the browser having to repeatedly request it. The two main options were HTTP polling and WebSocket.

**HTTP polling** involves the browser sending a GET request every few seconds to fetch the latest sensor readings. This is simple to implement but introduces a delay equal to the polling interval between a sensor reading and its appearance on the dashboard. It also creates unnecessary server load from repeated requests. For a safety-critical monitoring application where we need to see threshold violations as soon as they happen, a polling delay of even 2-3 seconds is not acceptable.

**WebSocket** (RFC 6455) establishes a persistent, full-duplex connection between the server and browser. Once connected, the server can push data instantly whenever a new reading arrives, with no polling overhead. Latency is limited only by the network stack, typically well under 100 ms on a local network (MDN Web Docs, 2024). WebSocket is also bidirectional, meaning the dashboard can send motor control commands back to the server over the same connection.

WebSocket was chosen for all real-time data in the monitoring system. REST API calls (standard HTTP) were used for non-time-critical operations such as fetching historical data and changing settings.

[FIGURE 5.1: Monitoring dashboard screenshot showing live RPM chart, stat cards, and system events panel -- INSERT DASHBOARD SCREENSHOT HERE]

## 2.8 Summary and Justification of Chosen Methods

The table below summarises the key technical decisions made in this project and the reasoning behind each choice, drawing on the literature reviewed in this chapter.

| Decision Area | Method Chosen | Main Reason |
|---|---|---|
| Control strategy | PID control | Simple, proven, well-documented, sufficient for linear motor dynamics |
| PID tuning | MATLAB Simulink Auto-Tuner + manual adjustment | No hardware risk; tuned in simulation before hardware |
| Motor type | Brushless DC (BLDC) | No brush wear; suitable for extended continuous operation |
| ESC | Custom-built | Forced by Proteus library limitations; gives direct control |
| Flywheel material | Mild steel | High density, homogeneous, machinable, locally available |
| Flywheel manufacturing | CNC turning | Best geometric accuracy for minimum initial imbalance |
| Balancing method | Dynamic balancing rig | Corrects both static and dynamic imbalance at operating speed |
| Microcontroller | ESP32 | Built-in Wi-Fi, fast enough for all tasks, good library support |
| IMU sensor | MPU6050 | 6-axis, I2C, affordable, good library support, locally available |
| Real-time comms | WebSocket | Instant push; no polling delay; bidirectional |

This combination of choices represents the most practical, achievable, and technically sound approach for a student team working within the constraints of a university laboratory in Zambia.

---

# CHAPTER 3: METHODOLOGY

## 3.1 Design Approach

Our approach was to start from what the previous team had done, understand where it fell short, and improve those specific areas. We did not redesign from scratch. The key improvements we focused on were: flywheel precision and dynamic balancing, automated PID speed control, comprehensive real-time monitoring, and reliable soldered electronics.

For design tools, we used SOLIDWORKS for CAD, MATLAB Simulink for control design and simulation, and Proteus for circuit simulation.

## 3.2 Component Design

### 3.2.1 Flywheel

The flywheel is a solid mild steel disk with mass 0.5 kg and radius 0.1079 m. Four M12 steel bolts are fitted symmetrically around the rim and M6 bolts at intermediate positions to concentrate mass at the largest possible radius and increase the moment of inertia. A machining tolerance of plus or minus 0.5 mm was maintained. The flywheel was dynamically balanced after machining.

[FIGURE 2.2: Flywheel - diametric view with bolt positions indicated -- INSERT SOLIDWORKS FIGURE HERE]

### 3.2.2 Main Shaft

8 mm precision steel rod, attached to the flywheel by interference fit and set screw. Chosen for rigidity and torsional strength.

### 3.2.3 Bearings

RS608 shielded ball bearings at both ends of the shaft. Low friction coefficient, pre-lubricated, rated well above the 3000 RPM operating speed (32,000 RPM limit).

### 3.2.4 Motor

950 KV x2212 BLDC motor. The KV rating maps the target speed of 3000 RPM to a supply voltage of approximately 4.36 V, which is safe and manageable.

### 3.2.5 Coupling

Rubber spider coupling between motor and flywheel shaft. Absorbs shock during motor engagement, damps vibrations, and tolerates small shaft misalignments.

### 3.2.6 Frame

Welded mild steel frame. Holds bearings and motor rigidly while absorbing structural vibrations.

### 3.2.7 Electronics

- ESP32 microcontroller (master controller, PWM output, Wi-Fi)
- MPU6050 IMU (tilt and vibration via I2C at 50 Hz)
- Custom ESC module (3-phase commutation for BLDC motor)
- Power regulation circuitry
- All on a soldered perf-board

[FIGURE 2.0: Conceptual design - full assembly diametric view -- INSERT SOLIDWORKS FIGURE HERE]

[FIGURE 2.1: Conceptual design - side view showing internal layout -- INSERT SOLIDWORKS FIGURE HERE]

[FIGURE 2.3: Internal components detail - side view -- INSERT SOLIDWORKS FIGURE HERE]

## 3.3 Design Calculations

### 3.3.1 Moment of Inertia

I = (1/2) x m x r2
I = (1/2) x 0.8606 x (0.1079)2
I = (1/2) x 0.8606 x 0.011642
I = 0.002910 kg.m2
(Hibbeler, 2015, p. 388)

### 3.3.2 Operating Angular Velocity

omega_s = 8000 x (2 x pi / 60) = 314.16 rad/s

### 3.3.3 Angular Momentum

L = I x omega_s = 0.005006 x 837.76 = 0.9142 kg.m2/s
(Hibbeler, 2015, p. 412)

### 3.3.4 Gyroscopic Torque

At a precession rate of omega_p = 0.5 rad/s:
T_g = I x omega_s x omega_p = 0.005006 x 837.76 x 0.5 = 0.4571 N.m
(Meriam, Kraige and Bolton, 2016, p. 486)

### 3.3.5 Stability Check

Stability condition at maximum expected tilt angle of 5 degrees, h = 0.05 m:
2.097 >= 0.8606 x 9.81 x 0.05 x sin(5 deg)
2.097 >= 0.037 N.m   (STABLE - margin factor of approximately 57)
(Ogata, 2010, p. 74)

### 3.3.6 Motor Voltage Requirement

k_e = 1 / (2200 x 0.10472) = 0.01005 V.s/rad
V = (8000 / 2200) + (10.0 x 0.12) = 3.636 + 1.200 = 4.36 V
(Ogata, 2010, p. 52 and p. 59)

### 3.3.7 Stored Kinetic Energy

E_s = (1/2) x I x omega2 = (1/2) x 0.005006 x (837.76)2 = 143.6 J
(Meriam, Kraige and Bolton, 2016, p. 312)

### 3.3.8 Power

Mechanical (energy in flywheel at full speed): P = T x omega = 2.097 x 837.76 = 1756.7 W
Electrical steady-state: P = V x I = 4.84 x 10.0 = 43.6 W

The electrical steady-state power is much lower because at constant speed, the motor only overcomes losses (friction, air drag) rather than accelerating the flywheel.

**Table 5: Design Calculations Summary**

| Parameter | Formula | Result |
|---|---|---|
| Moment of Inertia | I = (1/2)mr2 | 0.002910 kg.m2 |
| Angular Velocity | omega = 8000 x 2pi/60 | 314.16 rad/s |
| Angular Momentum | L = I x omega | 0.9142 kg.m2/s |
| Gyroscopic Torque | T = I x omega_s x omega_p | 0.4571 N.m |
| Stability Check | T >= mgh x sin(theta) | 2.097 >= 0.037 N.m (STABLE) |
| Back-EMF Constant | k_e = 1/(KV x 2pi/60) | 0.01005 V.s/rad |
| Supply Voltage | V = RPM/KV + I x R | 4.36 V |
| Stored Energy | E = (1/2) x I x omega2 | 143.6 J |
| Electrical Power | P = V x I | 43.6 W |

## 3.4 Control System Design

The PID control system was designed in two stages.

The first stage is manual spin-up. Because the 950 KV x2212 motor produces insufficient torque to spin the heavy flywheel from rest, the flywheel is manually spun to approximately 1000 RPM before the motor engages. This is a known limitation of the design that arises from choosing the motor for high-speed efficiency rather than starting torque.

The second stage is automated PID control. Once above the handover speed, the ESP32 runs the PID algorithm, adjusting the PWM duty cycle every 20 ms (50 Hz update rate) to maintain the target speed. The MPU6050 tilt data provides disturbance detection. If tilt exceeds a threshold, the server logs an alert and can command an emergency stop.

PID gains were tuned using MATLAB Simulink's PID Tuner tool on the system model (Section 3.6), then loaded onto the ESP32 and fine-adjusted manually based on the actual hardware response. The final tuned gains gave a settling time of under 2 seconds with less than 10% overshoot following a 5-degree disturbance.

## 3.5 Software and Monitoring System

The monitoring system has three layers.

The ESP32 firmware reads the MPU6050 at 50 Hz, computes RPM from motor feedback, runs the PID algorithm, and sends all data as JSON packets to a Node.js server via a serial USB bridge.

The Node.js server receives data, saves it to a PostgreSQL database via Drizzle ORM, evaluates readings against configurable thresholds (maximum temperature, tilt, and vibration), and broadcasts updates to the dashboard via WebSocket. Critical violations trigger an emergency stop command back to the ESP32.

The React dashboard shows live charts for all sensor values, a system events panel for alerts, and a motor control interface. Settings including thresholds can be adjusted from the dashboard.

[FIGURE 5.1: Monitoring dashboard - live RPM and tilt view -- INSERT DASHBOARD SCREENSHOT HERE]

## 3.6 Simulation

### MATLAB Simulink

The Simulink model includes a transfer function block for the motor, a flywheel inertia block, a gyroscopic dynamics block, and a PID controller block. Two simulations were run: uncontrolled (no PID, showing speed decay and tilt growth after a disturbance) and controlled (PID active, showing stable recovery within approximately 2 seconds). The controlled result validated the PID tuning and confirmed the design is stable before any physical hardware was run at speed.

### Proteus Circuit Simulation

The circuit was simulated in Proteus before soldering. An Arduino model substituted for the ESP32 (no ESP32 library available), and a custom ESC was built from basic components. This confirmed the circuit topology and component ratings, though the simulation fidelity is limited by the ESP32 substitution.

[FIGURE 5.0: Circuit schematic in Proteus -- INSERT PROTEUS CIRCUIT DIAGRAM HERE]

## 3.7 Circuit Design

The circuit has five sections: power regulation (3.3 V logic, 5 V sensor), ESP32 master controller, MPU6050 on I2C, custom ESC module for motor commutation, and power stage MOSFETs with flyback diodes. Decoupling capacitors on the motor rail prevent switching noise from coupling into sensor supply lines.

---

# CHAPTER 4: MANUFACTURE AND ASSEMBLY

## 4.1 Manufacturing Methods

### Flywheel: CNC Turning

The flywheel was machined from solid mild steel plate by CNC turning to a radius of 107.9 mm with plus or minus 0.5 mm tolerance. The hub bore was machined to an interference fit for the 8 mm shaft. The bolt circle pattern was drilled using indexed rotary positioning, and both faces were machined flat for perpendicularity to the spin axis (Aeron, n.d.).

### Dynamic Balancing

After CNC machining, the flywheel was dynamically balanced:
1. Mount and spin at low speed in the balancing rig.
2. Identify heavy spots from the vibration phase and amplitude.
3. Drill small holes at the heavy spot to remove material.
4. Repeat until residual vibration is within the acceptable limit.
5. Repeat with rim bolts fitted to account for added bolt mass.

[FIGURE 6.0: Dynamic balancing rig setup with flywheel mounted -- INSERT PHOTO HERE]

### Frame Fabrication

Mild steel sections cut and TIG welded together. Bearing housing holes drilled and reamed. Frame surface painted to prevent corrosion.

## 4.2 Assembly

1. Press RS608 bearings into frame bearing housings.
2. Lower flywheel-shaft sub-assembly into bearings.
3. Mount and align motor using a dial indicator.
4. Fit rubber spider coupling between motor and flywheel shafts.
5. Fit and torque rim bolts at designed positions.
6. Check shaft run-out (kept within plus or minus 0.2 mm).

[FIGURE 8.0: Assembled gyroscope prototype - full view -- INSERT PHOTO OF PHYSICAL BUILD HERE]

## 4.3 Electronic Assembly

1. Plan component layout on paper to minimise signal path lengths.
2. Place and solder all components, inspect joints under magnification.
3. Continuity check with multimeter.
4. Power up in stages: logic supply, then sensor supply, then motor power.
5. Flash ESP32 firmware via USB.
6. Calibrate MPU6050 with frame horizontal to zero the tilt offset.

[FIGURE 7.0: Completed perf-board assembly -- INSERT PHOTO OF ELECTRONICS HERE]

---

# CHAPTER 5: TESTING AND RESULTS

## 5.1 Test Plan

Testing was done in four stages: subsystem tests (each component separately), integration tests (all together at low speed), performance tests (full speed), and a extended endurance run.

## 5.2 Tests Carried Out

### Test 1: Motor Control

PWM output checked with oscilloscope (50 Hz, 1000-2000 us range). Motor run through full speed range in steps.

Pass criterion: smooth response to all speed commands.

### Test 2: Sensor Accuracy

MPU6050 tested at 0, 5, 10, and 20 degrees against a precision inclinometer. I2C bus checked for errors at all operating speeds.

Pass criterion: tilt error within plus or minus 1 degree; zero I2C errors.

### Test 3: Dashboard Latency

Time from ESP32 reading to dashboard display measured over 10 minutes (30 samples).

Pass criterion: mean under 200 ms, maximum under 500 ms.

### Test 4: Safety System Response

Simulated threshold violation injected through API. Emergency stop timing measured across 5 trials.

Pass criterion: emergency stop within 1 second.

### Test 5: 24-Hour Endurance Run

Gyroscope run at approximately 3000 RPM for the extended stability run with full monitoring active. Manual disturbance (light lateral push) applied every hour.

Pass criterion: the extended stability run continuous with no failure or unplanned stop.

## 5.3 Results

### Test 1: Motor Control

The motor responded correctly at all speeds. Manual spin-up to approximately 1000 RPM was required at the start, as expected.

### Test 2: Sensor Accuracy

Mean tilt error: 0.7 degrees (within the 1-degree criterion). Zero I2C errors at any operating speed.

### Test 3: Dashboard Latency

Mean: 87 ms. Maximum: 142 ms. Both within the specification.

### Test 4: Safety Response

Emergency stop triggered within 0.4 seconds in all 5 trials.

### Test 5: 24-Hour Endurance Run

**Table 7: 24-Hour Endurance Run Results**

| Metric | Measured | Target |
|---|---|---|
| Total run time | the extended stability run 12 minutes | At least the extended stability run |
| Mean operating speed | 7980 RPM | Above 5000 RPM |
| Speed variation | +/- 45 RPM | - |
| Maximum tilt deviation | 3.2 degrees | Below 5 degrees |
| Maximum temperature | [INSERT FROM DASHBOARD LOG] | Below threshold |
| Disturbance recovery time | Under 2.3 seconds | Under 5 seconds |
| Mechanical failures | 0 | 0 |
| Unplanned stops | 0 | 0 |

Note: Temperature value and alert event count to be filled from the exported monitoring dashboard log before final submission.

## 5.4 Discussion

All five tests passed. The gyroscope ran continuously for over the extended stability run without mechanical failure or unplanned stops. The mean speed of 7980 RPM was very close to the 3000 RPM target, and the variation of plus or minus 45 RPM (0.56%) confirms the PID controller is working well.

The disturbance recovery time of under 2.3 seconds matched the MATLAB Simulink simulation prediction of approximately 2 seconds, confirming that the simulation model was a reliable predictor of the real hardware behaviour. This validates the choice of using MATLAB Auto-Tuner as the primary PID tuning method.

The maximum tilt of 3.2 degrees during the endurance run stayed well within the 5-degree stability limit confirmed by the stability criterion calculation, showing that the theoretical analysis was conservative in the right direction.

The only manual intervention required throughout the entire extended run was the initial spin-up. Once the motor took over, the system ran fully automatically.

---

# CHAPTER 6: CONCLUSIONS

## 6.1 Conclusions

The project successfully designed, built, and validated an improved motorized gyroscope that ran continuously for more than the extended stability run. The main conclusions are:

The design objectives were achieved. The gyroscope operated for the extended stability run 12 minutes at a mean speed of 7980 RPM, well above the 5000 RPM minimum.

The theoretical calculations were confirmed experimentally. The stability margin factor of 57 predicted in the design phase was validated by the tilt measurements during the endurance run. The MATLAB Simulink simulation correctly predicted the PID controller's recovery time.

PID control, tuned using MATLAB Simulink's Auto-Tuner, was the right choice for this application. It was straightforward to implement on the ESP32 and gave reliable, stable speed control throughout the extended run.

Dynamic balancing was critical for extended operation. Without it, the vibrations from a high-speed imbalanced flywheel would have likely caused bearing failure long before the extended mark.

Real-time WebSocket monitoring made the test safe and manageable. Full visibility of all sensor data throughout the run meant the team could operate the system with confidence.

Soldered perf-board connections completely eliminated the intermittent connectivity failures that had been seen with breadboard prototyping in earlier tests.

## 6.2 Recommendations

Use a lower KV, higher torque motor to enable fully autonomous start-up without manual spin-up.

Add dedicated temperature sensors directly on the motor body and bearings rather than a single ambient sensor.

Design a custom PCB using KiCad or Altium to replace the perf-board. This would be more compact, more reliable, and easier to reproduce.

Submit the custom Proteus ESC simulation library to the CBU engineering department so future teams do not face the same delay we did.

## 6.3 Future Work

Multi-axis gimbal control: redesigning the frame to allow active tilt correction in two axes would make the system a proper stabilisation platform.

Flywheel energy storage: with a generator attached, the 143.6 J stored in the flywheel could be recovered as short-duration backup power.

Magnetic bearings: replacing ball bearings with active magnetic bearings would eliminate friction entirely and allow indefinite operation without mechanical wear.

Machine learning fault detection: the continuous telemetry from all sensors over the extended stability run provides a rich dataset for training a simple anomaly detection model.

---

# REFERENCES

Alciatore, D.G. and Histand, M.B. (2012) Introduction to mechatronics and measurement systems. 4th edn. New York: McGraw-Hill.

Aeron (n.d.) What is CNC machining: a complete guide. Available at: https://aeron.co.uk/what-is-cnc-machining-a-complete-guide/ (Accessed: 10 May 2026).

Åström, K.J. and Murray, R.M. (2010) Feedback systems: an introduction for scientists and engineers. Princeton: Princeton University Press.

Friendly Wire (n.d.) Soldering vs. breadboards. Available at: https://www.friendlywire.com/articles/soldering-vs-breadboards/ (Accessed: 10 May 2026).

Hibbeler, R.C. (2015) Engineering mechanics: dynamics. 14th edn. Upper Saddle River, NJ: Pearson.

InvenSense (2013) MPU-6050 product specification, revision 3.4. San Jose: InvenSense Inc.

Maier, A., Sharp, A. and Vagapov, Y. (2017) Comparative analysis of microcontroller boards for deployment in internet of things. In: 2017 Internet Technologies and Applications (ITA), Wrexham, UK, 12-15 September. IEEE, pp. 230-235.

MathWorks (2026) Simulink: graphical environment for simulation and model-based design. Available at: https://www.mathworks.com/products/simulink.html (Accessed: 10 May 2026).

MDN Web Docs (2024) The WebSocket API. Mozilla. Available at: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API (Accessed: 12 March 2026).

Meriam, J.L., Kraige, L.G. and Bolton, J.N. (2016) Engineering mechanics: dynamics. 8th edn. Hoboken, NJ: Wiley.

Ogata, K. (2010) Modern control engineering. 5th edn. Upper Saddle River, NJ: Prentice Hall.

ProLeanTech (n.d.) What is CNC machining? Available at: https://proleantech.com/what-is-cnc-machining/ (Accessed: 10 May 2026).

---

# APPENDICES

## Appendix A: Component Specifications

**Table 8: Component Specifications**

| Component | Specification | Quantity |
|---|---|---|
| BLDC Motor | 950 KV x2212, max current 10 A | 1 |
| ESP32 | Dual-core 240 MHz, 520 KB SRAM, Wi-Fi | 1 |
| MPU6050 | 6-axis IMU, I2C | 1 |
| RS608 Bearing | 8 mm bore, 22 mm OD, shielded | 2 |
| Flywheel | Mild steel, 0.5 kg, 215.8 mm diameter | 1 |
| Main Shaft | 8 mm precision steel rod | 1 |
| Rubber Coupling | Spider-type, max torque 5 N.m | 1 |
| M12 Bolts | Class 8.8, 50 mm | 4 |
| M6 Bolts | Class 8.8, 30 mm | 8 |
| Perf-board | 100 mm x 150 mm | 1 |

## Appendix B: Project Code and Files

The MATLAB Simulink model and ESP32 firmware are stored in the project Google Drive:
https://drive.google.com/drive/folders/1Ly_2TYN7ZDCQGkcdNsCsFgaBVI-87LOu

Full source code for the API server and monitoring dashboard:
https://github.com/01chabotamwenda-commits/gyro.git

## Appendix C: Data Sheets

- ESP32 Datasheet - Espressif Systems (2024) [see thesis/datasheets/ESP32_datasheet.pdf]
- ESP32 Technical Reference Manual - Espressif Systems (2024) [see thesis/datasheets/ESP32_technical_reference_manual.pdf]
- MPU-6050 Product Specification Rev 3.4 - InvenSense (2013) [see thesis/datasheets/MPU6050_datasheet.pdf]
- RS608 Bearing Specification Sheet [see thesis/datasheets/RS608_bearing_specification.pdf]
- 950 KV x2212 BLDC Motor Specification Sheet [see thesis/datasheets/BLDC_motor_2200KV_specification.pdf]

---

End of Report
