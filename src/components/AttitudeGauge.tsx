import React from 'react';
import { Compass } from 'lucide-react';

interface AttitudeGaugeProps {
  leanAngleDeg: number;
  rollRateDegS?: number;
  lateralAccelG?: number;
}

export const AttitudeGauge: React.FC<AttitudeGaugeProps> = ({
  leanAngleDeg,
  rollRateDegS = 0,
  lateralAccelG = 0,
}) => {
  // Clamp lean angle for visual safety display
  const clampedAngle = Math.max(-55, Math.min(55, leanAngleDeg));
  const absAngle = Math.abs(clampedAngle);
  const direction = clampedAngle < -0.5 ? 'LEFT' : clampedAngle > 0.5 ? 'RIGHT' : 'CENTER';

  const getZoneColor = (angle: number) => {
    if (angle < 32) return 'text-emerald-400 border-emerald-500/50';
    if (angle < 45) return 'text-amber-400 border-amber-500/50';
    return 'text-rose-500 border-rose-500/80 animate-pulse';
  };

  return (
    <div className="bg-surface/80 border border-surface-border rounded-lg p-3 flex flex-col gap-2 font-mono text-xs select-none shadow-md">
      <div className="flex items-center justify-between border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span>Vehicle Dynamics & Lean Angle</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${getZoneColor(absAngle)}`}>
          {direction} {absAngle.toFixed(1)}°
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Motorcycle Banking Silhouette Display */}
        <div className="relative w-28 h-28 flex items-center justify-center bg-background rounded-full border border-surface-border overflow-hidden shadow-inner">
          {/* Degree Tick Marks */}
          <div className="absolute inset-0 border border-slate-700/40 rounded-full" />
          <div className="absolute w-full h-px bg-slate-700/60" /> {/* Ground horizon */}
          <div className="absolute h-full w-px bg-slate-700/40" /> {/* Center vertical */}

          {/* Rotating Motorcycle Cross-Section SVG */}
          <div
            className="w-16 h-16 flex items-center justify-center transition-transform duration-75 ease-out"
            style={{ transform: `rotate(${clampedAngle}deg)` }}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]">
              {/* Bike Body Silhouette */}
              <circle cx="50" cy="50" r="14" fill="#0891b2" />
              {/* Handlebars */}
              <line x1="20" y1="38" x2="80" y2="38" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" />
              {/* Mirrors */}
              <circle cx="20" cy="35" r="3" fill="#f59e0b" />
              <circle cx="80" cy="35" r="3" fill="#f59e0b" />
              {/* Windscreen / Fairing */}
              <polygon points="50,15 62,38 38,38" fill="#0284c7" opacity="0.9" />
              {/* Headlight */}
              <polygon points="50,28 56,38 44,38" fill="#fde047" />
              {/* Front Fork & Tire */}
              <rect x="46" y="55" width="8" height="28" rx="4" fill="#334155" stroke="#0ea5e9" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Roll Angle Arc Visualizer */}
          <div className="absolute bottom-1 text-[9px] text-slate-500 font-mono">
            -55° ── 0° ── +55°
          </div>
        </div>

        {/* Dynamic Metric Badges */}
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="bg-background border border-surface-border rounded p-1.5 flex items-center justify-between">
            <span className="text-slate-400 text-[10px]">Roll Angle:</span>
            <span className={`font-bold text-sm ${getZoneColor(absAngle)}`}>
              {clampedAngle > 0 ? `+${clampedAngle.toFixed(1)}°` : `${clampedAngle.toFixed(1)}°`}
            </span>
          </div>

          <div className="bg-background border border-surface-border rounded p-1.5 flex items-center justify-between">
            <span className="text-slate-400 text-[10px]">Roll Rate:</span>
            <span className="text-cyan-300 font-semibold text-[11px] font-mono">
              {rollRateDegS.toFixed(1)} <span className="text-[9px] text-slate-500">°/s</span>
            </span>
          </div>

          <div className="bg-background border border-surface-border rounded p-1.5 flex items-center justify-between">
            <span className="text-slate-400 text-[10px]">Lateral Accel:</span>
            <span className="text-amber-300 font-semibold text-[11px] font-mono">
              {lateralAccelG.toFixed(2)} <span className="text-[9px] text-slate-500">G</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
