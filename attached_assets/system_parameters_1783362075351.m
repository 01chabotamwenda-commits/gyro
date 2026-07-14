% --- PHYSICAL CONSTANTS ---
m = 2.25759;            %Total mass (kg) from prototype_defender_spec.png
g = 9.81;               % Gravity (m/s^2)
h = 0.08889;            % CoM height (m) from prototype_defender_spec.png
Is = 0.0050060036;      % Spin moment of inertia in Kg m^2
It = 0.009375;          % Transverse moment of inertia in Kg m^2

Kv = 950;               % Motor Kv (RPM/V)
Ke = (Kv*(2*pi)/60);    % Back-EMF constant
V_batt = 11.1;          % Assuming 3S LiPo battery

Ts = 0.01;              % 10 milliseconds sampling period

K = 10;                 % Shaft stiffness
w_n = 30.29;            % Natural frequency (rad/s) 
f_n = 4.82;             % Natural frequency (Hz)
d_r = 0.076;            % Damping ratio
DC_g = 0.1;              % DC gain (rad/N.m)

% MOTOR Values
K_v = 960*pi/30;        %
Tm = 0.015;
Kt = 0.01;

% --- CALCULATED VALUES ---    % CONTROLLER PARAMETERS
  % Majorona Criterion
        Ws_min = 4 * (2/Is)* sqrt(m*g*h*It);        % minimum spin required
        Ws_min_RPM = Ws_min*(30/pi);                % minimum spin required in RPM
  % Voltage
        V_min = Ke * Ws_min;                        % Minimum Voltage to be supplied
  % Others
        L = Is * Ws_min;                 % Angular Momentum
        J = 1.0899e-2;                  % Estimated Frame Moment of Inertia (Pivot axis)


























% ---
% % Create the Transfer Function
% % Numerator: [1]
% % Denominator: [J, H, -(m*g*h)]
% num = 1;
% den = [J, H, -(m*g*h)];
% sys = tf(num, den);
% 
% % Check Stability Graphically
% figure;
% subplot(2,1,1);
% pzmap(sys);     % Plot poles and zeros
% grid on;
% 
% subplot(2,1,2);
% step(sys);      % Plot step response
% grid on;
% 
% % 4. Check Stability Programmatically
% is_it_stable = isstable(sys); % Returns 1 if stable, 0 if unstable
% 
