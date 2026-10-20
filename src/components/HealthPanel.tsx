import React from 'react';
import { 
  HeartPulse, 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  Thermometer, 
  Disc, 
  Compass,
  Gauge
} from 'lucide-react';
import { BusStats } from '../types/can';

interface HealthPanelProps {
  stats: BusStats;
  currentRpm: number;
  currentSpeed: number;
  currentLeanAngle: number;
  currentCoolantTemp: number;
  gear: number;
  throttlePct: number;
  frontWheelSpeed: number;
  rearWheelSpeed: number;
  absActive: boolean;
  rtCoreAlive: number;
  safetyNodeAlive: number;
}

export const HealthPanel: React.FC<HealthPanelProps> = ({
  stats,
  currentRpm,
  currentSpeed,
  currentLeanAngle,
  currentCoolantTemp,
  gear,
  throttlePct,
  frontWheelSpeed,
  rearWheelSpeed,
  absActive,
  rtCoreAlive,
  safetyNodeAlive,
}) => {
  // Wheel slip calculation
  const wheelSpeedDiff = Math.abs(frontWheelSpeed - rearWheelSpeed);
  const slipDetected = wheelSpeedDiff > 4.0 && currentSpeed > 15;

  // Window health calculations
  const w1Status = currentRpm > 9200 ? 'warning' : 'ok';
  const w2Status = Math.abs(currentLeanAngle) > 48 ? 'warning' : 'ok';
  const w3Status = absActive || slipDetected ? 'warning' : 'ok';
  const w4Status = stats.busLoadPct > 65 ? 'warning' : 'ok';
  const w5Status = currentCoolantTemp > 100 ? 'warning' : 'ok';

  // Overall health score computation
  const warnings = [w1Status, w2Status, w3Status, w4Status, w5Status].filter((s) => s === 'warning').length;
  const healthScore = Math.max(70, 100 - warnings * 8);

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none overflow-auto p-4 gap-4">
      {/* Top Health Header Banner */}
      <div className="bg-surface/80 border border-surface-border rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <HeartPulse className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-slate-100">D-079 Vehicle Health Windows (W1–W5)</span>
              <span className="text-[10px] bg-cyan-950/40 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800">
                CL250 Diagnostic Baseline
              </span>
            </div>
            <div className="text-slate-400 text-xs mt-0.5">
              Real-time platform subsystem integrity monitoring and anomaly detection
            </div>
          </div>
        </div>

        {/* Global Health Score */}
        <div className="flex items-center gap-4 bg-background border border-surface-border rounded-lg px-4 py-2">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-400 uppercase">Platform Integrity</span>
            <span className="text-xl font-bold text-emerald-400">{healthScore}%</span>
          </div>
          <div className="h-8 w-px bg-surface-border" />
          <div className="flex items-center gap-2 text-xs">
            {warnings === 0 ? (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>ALL SUBSYSTEMS NOMINAL</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <AlertTriangle className="w-4 h-4" />
                <span>{warnings} ATTENTION REQUIRED</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid of 5 Health Windows */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* W1: Engine & Powertrain Health */}
        <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-slate-200">W1: Engine & Powertrain</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">0xFD4A</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Engine Speed:</span>
              <span className={`font-bold text-sm ${currentRpm > 9000 ? 'text-rose-400' : 'text-slate-200'}`}>
                {currentRpm.toFixed(0)} <span className="text-[10px] text-slate-500 font-normal">rpm</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Throttle Valve:</span>
              <span className="text-slate-200 font-semibold">{throttlePct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Selected Gear:</span>
              <span className="text-cyan-300 font-bold">Gear {gear}</span>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t border-surface-border/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Redline Safety:</span>
            <span className={w1Status === 'ok' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-bold'}>
              {w1Status === 'ok' ? 'Safe Operating Range' : 'Near Rev Limit'}
            </span>
          </div>
        </div>

        {/* W2: Cornering & IMU Dynamics */}
        <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-slate-200">W2: Cornering & IMU</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">0xFD4B</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Lean Angle:</span>
              <span className={`font-bold text-sm ${Math.abs(currentLeanAngle) > 45 ? 'text-amber-400' : 'text-slate-200'}`}>
                {currentLeanAngle.toFixed(1)}°
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">D-065 Clamp Ceiling:</span>
              <span className="text-slate-400 font-mono">55.0° Max</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">IMU Safety Node Partition:</span>
              <span className="text-emerald-400 font-semibold">Cortex-M4 Linked</span>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t border-surface-border/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Stability Envelope:</span>
            <span className={w2Status === 'ok' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-bold'}>
              {w2Status === 'ok' ? 'Tire Grip Stable' : 'High Bank Angle'}
            </span>
          </div>
        </div>

        {/* W3: Brake & ABS System Health */}
        <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <Disc className="w-4 h-4 text-rose-400" />
              <span className="font-bold text-slate-200">W3: Brake & ABS System</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">0xFD4C</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Front Wheel Speed:</span>
              <span className="text-slate-200 font-semibold">{frontWheelSpeed.toFixed(1)} km/h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Rear Wheel Speed:</span>
              <span className="text-slate-200 font-semibold">{rearWheelSpeed.toFixed(1)} km/h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">ABS Intervention:</span>
              <span className={`font-bold ${absActive ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`}>
                {absActive ? 'INTERVENING' : 'INACTIVE'}
              </span>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t border-surface-border/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Wheel Slip Status:</span>
            <span className={!slipDetected ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-bold'}>
              {!slipDetected ? 'Optimal Traction' : `Slip Δ ${wheelSpeedDiff.toFixed(1)} km/h`}
            </span>
          </div>
        </div>

        {/* W4: Electrical & CAN Bus Health */}
        <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-slate-200">W4: Electrical & Bus</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">0xFD4D</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Bus Load %:</span>
              <span className="text-slate-200 font-semibold">{stats.busLoadPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">RT-Core Heartbeat:</span>
              <span className="text-cyan-300 font-mono">Alive #{rtCoreAlive}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Safety-Node Heartbeat:</span>
              <span className="text-emerald-300 font-mono">Alive #{safetyNodeAlive}</span>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t border-surface-border/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">CAN Controller:</span>
            <span className="text-emerald-400 font-semibold">Active Error Free</span>
          </div>
        </div>

        {/* W5: Thermal & Cooling Health */}
        <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-purple-400" />
              <span className="font-bold text-slate-200">W5: Thermal & Cooling</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">0xFD4E</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Coolant Temperature:</span>
              <span className={`font-bold text-sm ${currentCoolantTemp > 98 ? 'text-amber-400' : 'text-slate-200'}`}>
                {currentCoolantTemp.toFixed(1)}°C
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Thermostat Status:</span>
              <span className="text-slate-200 font-semibold">{currentCoolantTemp > 82 ? 'Open (Cooling)' : 'Closed'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Overheat Safety Limit:</span>
              <span className="text-slate-400 font-mono">105.0°C</span>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t border-surface-border/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Thermal Envelope:</span>
            <span className={w5Status === 'ok' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-bold'}>
              {w5Status === 'ok' ? 'Optimal Operating Temp' : 'High Temperature Warning'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
