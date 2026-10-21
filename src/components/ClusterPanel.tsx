import React from 'react';
import {
  AlertTriangle,
  Flame,
  Gauge,
  Compass,
  Zap,
  ShieldCheck,
  Disc,
} from 'lucide-react';
import {
  calculateTachometerAngle,
  getRpmStatus,
  formatGearDisplay,
  calculateWheelSlip,
} from '../services/clusterCalculations';

interface ClusterPanelProps {
  telemetry: {
    rpm: number;
    speed: number;
    gear: number;
    coolantTemp: number;
    throttlePct: number;
    frontWheelSpeed: number;
    rearWheelSpeed: number;
    absActive: boolean;
    rtCoreAlive: number;
    safetyNodeAlive: number;
  };
  dynamics: {
    leanAngle: number;
    rollRate: number;
    lateralAccel: number;
  };
}

export const ClusterPanel: React.FC<ClusterPanelProps> = ({ telemetry, dynamics }) => {
  const rpmAngle = calculateTachometerAngle(telemetry.rpm);
  const rpmStatus = getRpmStatus(telemetry.rpm);
  const gearInfo = formatGearDisplay(telemetry.gear);
  const slipInfo = calculateWheelSlip(telemetry.frontWheelSpeed, telemetry.rearWheelSpeed);

  // Tachometer radial arc calculations
  // Center is (150, 150), radius is 110
  const cx = 150;
  const cy = 150;
  const r = 105;

  return (
    <div className="flex flex-col h-full bg-[#070a12] font-mono text-xs select-none p-4 overflow-y-auto">
      {/* Top Telltale Bar (Automotive Warning Lamps) */}
      <div className="bg-surface/80 border border-surface-border rounded-xl px-6 py-2.5 flex items-center justify-between shadow-lg mb-4">
        {/* Left Turn Indicator */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-600">
            <span className="font-bold text-sm">◀</span>
          </div>
          <span className="text-[10px] text-slate-500 font-semibold">TURN L</span>
        </div>

        {/* Center Lamps: ABS, Neutral, MIL, Stand, Temp */}
        <div className="flex items-center gap-5">
          {/* Neutral Lamp */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
              gearInfo.isNeutral
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/60 font-bold'
                : 'bg-slate-900/60 border-slate-800 text-slate-600'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs">N</span>
          </div>

          {/* ABS Warning / Active */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
              telemetry.absActive || slipInfo.hasSignificantSlip
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 animate-pulse font-bold'
                : 'bg-slate-900/60 border-slate-800 text-slate-600'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            <span className="text-xs">ABS</span>
          </div>

          {/* Engine Check / MIL */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border bg-slate-900/60 border-slate-800 text-slate-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs">MIL</span>
          </div>

          {/* Coolant Warning */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
              telemetry.coolantTemp > 100
                ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse font-bold'
                : 'bg-slate-900/60 border-slate-800 text-slate-600'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span className="text-xs">{telemetry.coolantTemp}°C</span>
          </div>

          {/* Safety Partition Active */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border bg-emerald-950/30 border-emerald-500/40 text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold">M4 SAFEGUARD</span>
          </div>
        </div>

        {/* Right Turn Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-semibold">TURN R</span>
          <div className="w-7 h-7 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-600">
            <span className="font-bold text-sm">▶</span>
          </div>
        </div>
      </div>

      {/* Main Instrument Cluster Dashboard (3-Column Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 items-stretch">
        {/* Left Column: Analog Tachometer Dial (0 - 10,000 RPM) */}
        <div className="bg-surface/60 border border-surface-border rounded-xl p-4 flex flex-col items-center justify-between shadow-xl relative overflow-hidden">
          <div className="w-full flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-slate-200 text-xs">Engine Tachometer</span>
            </div>
            <span className="text-[10px] text-slate-400">REDLINE: 8,500 RPM</span>
          </div>

          {/* Circular SVG Gauge */}
          <div className="relative w-64 h-64 flex items-center justify-center my-auto">
            <svg viewBox="0 0 300 300" className="w-full h-full drop-shadow-md">
              {/* Outer dial background track */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#1e293b"
                strokeWidth="16"
                strokeDasharray="495 165"
                strokeDashoffset="140"
                strokeLinecap="round"
              />

              {/* Redline track section (8.5k - 10k) */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#ef4444"
                strokeWidth="16"
                strokeDasharray="75 585"
                strokeDashoffset="-210"
                strokeOpacity="0.4"
                strokeLinecap="round"
              />

              {/* Active RPM Arc */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={rpmStatus.colorHex}
                strokeWidth="16"
                strokeDasharray={`${Math.max(1, ((telemetry.rpm / 10000) * 495))} 660`}
                strokeDashoffset="140"
                strokeLinecap="round"
                className="transition-all duration-75"
              />

              {/* Radial Graduation Marks & Numbers */}
              {[0, 2, 4, 6, 8, 10].map((num) => {
                const angle = 135 + (num / 10) * 270;
                const rad = (angle * Math.PI) / 180;
                const x1 = cx + (r - 20) * Math.cos(rad);
                const y1 = cy + (r - 20) * Math.sin(rad);
                const xText = cx + (r - 34) * Math.cos(rad);
                const yText = cy + (r - 34) * Math.sin(rad);

                return (
                  <g key={num}>
                    <line
                      x1={cx + (r - 10) * Math.cos(rad)}
                      y1={cy + (r - 10) * Math.sin(rad)}
                      x2={x1}
                      y2={y1}
                      stroke={num >= 8 ? '#ef4444' : '#64748b'}
                      strokeWidth="2"
                    />
                    <text
                      x={xText}
                      y={yText}
                      fill={num >= 8 ? '#ef4444' : '#94a3b8'}
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {num}
                    </text>
                  </g>
                );
              })}

              {/* Central Needle */}
              <g transform={`rotate(${rpmAngle} ${cx} ${cy})`} className="transition-transform duration-75">
                <line
                  x1={cx}
                  y1={cy}
                  x2={cx + 90}
                  y2={cy}
                  stroke={rpmStatus.colorHex}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <circle cx={cx} cy={cy} r="8" fill="#0f172a" stroke={rpmStatus.colorHex} strokeWidth="3" />
              </g>
            </svg>

            {/* Hub Digital Readout */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-10">
              <span
                className="text-2xl font-black font-mono tracking-tight transition-colors"
                style={{ color: rpmStatus.colorHex }}
              >
                {Math.round(telemetry.rpm).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">RPM x1000</span>
            </div>
          </div>

          {/* Redline Alert Banner */}
          <div
            className={`w-full py-1.5 px-3 rounded text-center text-xs font-bold transition-all ${
              rpmStatus.isRedline
                ? 'bg-rose-950/80 border border-rose-500 text-rose-300 animate-pulse'
                : 'bg-background/40 text-slate-500 border border-surface-border'
            }`}
          >
            {rpmStatus.isRedline ? '⚡ REDLINE WARNING ⚡' : 'OPTIMAL TORQUE BAND'}
          </div>
        </div>

        {/* Center Column: Digital Speedometer, Gear, and Dual Wheel Speed Slip */}
        <div className="bg-surface/60 border border-surface-border rounded-xl p-4 flex flex-col items-center justify-between shadow-xl">
          <div className="w-full flex items-center justify-between border-b border-surface-border pb-2">
            <span className="font-semibold text-slate-200 text-xs">Primary Flight Display</span>
            <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950/40 border border-cyan-800 px-2 py-0.5 rounded">
              HONDA CL250 SDV
            </span>
          </div>

          {/* Large Digital Speed Readout */}
          <div className="flex flex-col items-center my-auto py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-black font-mono text-slate-100 tracking-tighter drop-shadow-lg">
                {Math.round(telemetry.speed)}
              </span>
              <span className="text-lg font-bold text-cyan-400 font-mono">km/h</span>
            </div>

            {/* Large 7-Segment Style Gear Indicator */}
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-slate-400 font-semibold">GEAR:</span>
              <div
                className={`w-14 h-16 rounded-lg border-2 flex items-center justify-center font-mono text-4xl font-black transition-all ${
                  gearInfo.isNeutral
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-950/50'
                    : 'bg-cyan-950/50 border-cyan-500 text-cyan-300 shadow-lg shadow-cyan-950/50'
                }`}
              >
                {gearInfo.label}
              </div>
            </div>
          </div>

          {/* Wheel Speeds and Traction Slip Card */}
          <div className="w-full bg-background/80 border border-surface-border rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] border-b border-surface-border pb-1">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Wheel Speed & Traction Slip (0x110)</span>
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  slipInfo.hasSignificantSlip
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {slipInfo.hasSignificantSlip ? 'SLIP DETECTED' : 'TRACTION STABLE'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-surface/50 p-1.5 rounded border border-surface-border">
                <span className="text-[10px] text-slate-400 block">FRONT</span>
                <strong className="text-cyan-300 text-sm">{telemetry.frontWheelSpeed.toFixed(1)}</strong>
                <span className="text-[9px] text-slate-500 block">km/h</span>
              </div>

              <div className="bg-surface/50 p-1.5 rounded border border-surface-border">
                <span className="text-[10px] text-slate-400 block">REAR</span>
                <strong className="text-cyan-300 text-sm">{telemetry.rearWheelSpeed.toFixed(1)}</strong>
                <span className="text-[9px] text-slate-500 block">km/h</span>
              </div>

              <div
                className={`p-1.5 rounded border ${
                  slipInfo.hasSignificantSlip
                    ? 'bg-rose-950/40 border-rose-500 text-rose-300'
                    : 'bg-surface/50 border-surface-border text-emerald-300'
                }`}
              >
                <span className="text-[10px] text-slate-400 block">SLIP Δv</span>
                <strong className="text-sm font-bold">{slipInfo.slipKmh}</strong>
                <span className="text-[9px] text-slate-500 block">km/h</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Motorcycle Dynamic Lean HUD */}
        <div className="bg-surface/60 border border-surface-border rounded-xl p-4 flex flex-col items-center justify-between shadow-xl">
          <div className="w-full flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-slate-200 text-xs">Attitude & Cornering HUD</span>
            </div>
            <span className="text-[10px] text-amber-400 font-mono">D-072 M4 IMU</span>
          </div>

          {/* Dynamic Lean Visualization */}
          <div className="relative w-64 h-52 flex flex-col items-center justify-center my-auto">
            {/* Horizon and Lean Angle Scale Arc */}
            <svg viewBox="0 0 240 180" className="w-full h-full">
              {/* Horizon Line */}
              <line x1="20" y1="120" x2="220" y2="120" stroke="#334155" strokeWidth="2" strokeDasharray="4 4" />

              {/* Dynamic Roll Angle Grid Arc */}
              <path
                d="M 40 120 A 80 80 0 0 1 200 120"
                fill="none"
                stroke="#1e293b"
                strokeWidth="8"
                strokeLinecap="round"
              />

              {/* Lean angle tick marks (-45, -30, 0, +30, +45) */}
              {[-45, -30, 0, 30, 45].map((deg) => {
                const rad = ((deg - 90) * Math.PI) / 180;
                const x1 = 120 + 72 * Math.cos(rad);
                const y1 = 120 + 72 * Math.sin(rad);
                const x2 = 120 + 84 * Math.cos(rad);
                const y2 = 120 + 84 * Math.sin(rad);
                return (
                  <g key={deg}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth="2" />
                    <text
                      x={120 + 96 * Math.cos(rad)}
                      y={120 + 96 * Math.sin(rad)}
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {Math.abs(deg)}°
                    </text>
                  </g>
                );
              })}

              {/* Rotating Motorcycle Silhouette Hub */}
              <g
                transform={`rotate(${dynamics.leanAngle} 120 120)`}
                className="transition-transform duration-75"
              >
                {/* Roll Needle indicator */}
                <line x1="120" y1="120" x2="120" y2="46" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
                <circle cx="120" cy="46" r="4" fill="#f59e0b" />

                {/* Stylized Motorcycle Outline */}
                {/* Wheels */}
                <circle cx="120" cy="120" r="12" fill="#0f172a" stroke="#06b6d4" strokeWidth="3" />
                <line x1="120" y1="108" x2="120" y2="70" stroke="#06b6d4" strokeWidth="4" strokeLinecap="round" />
                {/* Handlebars */}
                <line x1="98" y1="74" x2="142" y2="74" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
                <circle cx="98" cy="74" r="2.5" fill="#f59e0b" />
                <circle cx="142" cy="74" r="2.5" fill="#f59e0b" />
                {/* Rider Helmet */}
                <circle cx="120" cy="60" r="7" fill="#38bdf8" />
              </g>
            </svg>

            {/* Readout overlay */}
            <div className="absolute bottom-1 flex items-center justify-between w-full px-4 text-xs font-mono">
              <div className="text-left">
                <span className="text-[10px] text-slate-500 block">ROLL RATE</span>
                <span className="text-slate-300 font-bold">{dynamics.rollRate.toFixed(1)} °/s</span>
              </div>

              <div className="text-center">
                <span className="text-xl font-black text-amber-400 font-mono">
                  {Math.abs(dynamics.leanAngle).toFixed(1)}°
                </span>
                <span className="text-[10px] text-slate-400 block font-semibold">
                  {dynamics.leanAngle < -1 ? 'LEAN LEFT' : dynamics.leanAngle > 1 ? 'LEAN RIGHT' : 'UPRIGHT'}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">LATERAL G</span>
                <span className="text-slate-300 font-bold">{dynamics.lateralAccel.toFixed(2)} g</span>
              </div>
            </div>
          </div>

          {/* Cornering ADAS Status Pill */}
          <div className="w-full bg-background/40 border border-surface-border rounded py-1.5 px-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">CORNERING ADAS:</span>
            <span className="text-emerald-400 font-bold">ARMED (55° CEILING)</span>
          </div>
        </div>
      </div>

      {/* Bottom Secondary Telemetry Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Coolant Temperature Bar */}
        <div className="bg-surface/60 border border-surface-border rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Engine Coolant Temperature</span>
            </span>
            <strong className="text-rose-400 font-mono">{telemetry.coolantTemp} °C</strong>
          </div>
          <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-surface-border p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                telemetry.coolantTemp > 100
                  ? 'bg-rose-500'
                  : telemetry.coolantTemp > 85
                  ? 'bg-amber-500'
                  : 'bg-cyan-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, ((telemetry.coolantTemp - 40) / (120 - 40)) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>40°C (COLD)</span>
            <span>85°C (OPTIMAL)</span>
            <span>120°C (OVERHEAT)</span>
          </div>
        </div>

        {/* Throttle Position Sensor Bar */}
        <div className="bg-surface/60 border border-surface-border rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Throttle Position Sensor (TPS)</span>
            </span>
            <strong className="text-amber-400 font-mono">{telemetry.throttlePct} %</strong>
          </div>
          <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-surface-border p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 transition-all duration-150"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.throttlePct))}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>0% (IDLE)</span>
            <span>50% (CRUISE)</span>
            <span>100% (WOT)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
