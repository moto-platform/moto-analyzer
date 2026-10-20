import { useRef, useEffect, useState } from 'react';
import { Crosshair, CheckSquare, Square } from 'lucide-react';

interface ChannelConfig {
  name: string;
  label: string;
  unit: string;
  color: string;
  min: number;
  max: number;
  enabled: boolean;
}

interface OscilloscopePanelProps {
  signalsHistory: Map<string, { time: number; value: number }[]>;
}

export const OscilloscopePanel: React.FC<OscilloscopePanelProps> = ({ signalsHistory }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timeWindowSec, setTimeWindowSec] = useState<number>(10); // 10s default window
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [activeCursor, setActiveCursor] = useState<'A' | 'B'>('A');

  const [channels, setChannels] = useState<ChannelConfig[]>([
    { name: 'EngineSpeed', label: 'Engine RPM', unit: 'rpm', color: '#06b6d4', min: 0, max: 10000, enabled: true },
    { name: 'VehicleSpeed', label: 'Vehicle Speed', unit: 'km/h', color: '#10b981', min: 0, max: 160, enabled: true },
    { name: 'LeanAngle', label: 'Lean Angle', unit: 'deg', color: '#f59e0b', min: -50, max: 50, enabled: true },
    { name: 'ThrottlePosition', label: 'Throttle %', unit: '%', color: '#a855f7', min: 0, max: 100, enabled: false },
    { name: 'EngineCoolantTemp', label: 'Coolant Temp', unit: '°C', color: '#f43f5e', min: 40, max: 110, enabled: false },
  ]);

  const toggleChannel = (name: string) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.name === name ? { ...ch, enabled: !ch.enabled } : ch))
    );
  };

  // Canvas 2D render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Clear background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid Lines (Automotive Oscilloscope Style)
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;

      // Horizontal grid lines (5 divisions)
      const numHoriz = 5;
      for (let i = 1; i < numHoriz; i++) {
        const y = (height / numHoriz) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vertical grid lines (time divisions)
      const numVert = 10;
      for (let i = 1; i < numVert; i++) {
        const x = (width / numVert) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Determine global time range
      let latestTime = 0;
      signalsHistory.forEach((points) => {
        if (points.length > 0) {
          const ptTime = points[points.length - 1].time;
          if (ptTime > latestTime) latestTime = ptTime;
        }
      });

      const startTime = Math.max(0, latestTime - timeWindowSec);

      // Plot Enabled Channels
      channels.forEach((ch) => {
        if (!ch.enabled) return;
        const points = signalsHistory.get(ch.name);
        if (!points || points.length < 2) return;

        // Filter points within the current time window
        const visiblePoints = points.filter((p) => p.time >= startTime && p.time <= latestTime);
        if (visiblePoints.length < 2) return;

        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        visiblePoints.forEach((pt, idx) => {
          const x = ((pt.time - startTime) / timeWindowSec) * width;
          // Normalize value between min and max
          const normalized = (pt.value - ch.min) / (ch.max - ch.min);
          const clamped = Math.max(0, Math.min(1, normalized));
          const y = height - clamped * (height - 20) - 10;

          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();
      });

      // Draw Measurement Cursors
      if (cursorA !== null) {
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cursorA, 0);
        ctx.lineTo(cursorA, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px monospace';
        ctx.fillText('Cursor A', cursorA + 4, 15);
      }

      if (cursorB !== null) {
        ctx.strokeStyle = '#06b6d4';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cursorB, 0);
        ctx.lineTo(cursorB, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = '#06b6d4';
        ctx.font = '10px monospace';
        ctx.fillText('Cursor B', cursorB + 4, 30);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [signalsHistory, channels, timeWindowSec, cursorA, cursorB]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    if (activeCursor === 'A') {
      setCursorA(x);
      setActiveCursor('B');
    } else {
      setCursorB(x);
      setActiveCursor('A');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      {/* Top Toolbar */}
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Channel Selector Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 font-semibold mr-1">CHANNELS:</span>
          {channels.map((ch) => {
            const history = signalsHistory.get(ch.name);
            const latest = history && history.length > 0 ? history[history.length - 1].value : '-';

            return (
              <button
                key={ch.name}
                onClick={() => toggleChannel(ch.name)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-all ${
                  ch.enabled
                    ? 'bg-surface-elevated text-slate-100'
                    : 'bg-background text-slate-500 border-surface-border opacity-60'
                }`}
                style={{ borderColor: ch.enabled ? ch.color : undefined }}
              >
                {ch.enabled ? <CheckSquare className="w-3.5 h-3.5" style={{ color: ch.color }} /> : <Square className="w-3.5 h-3.5" />}
                <span>{ch.label}:</span>
                <strong style={{ color: ch.color }}>{latest}</strong>
                <span className="text-[10px] text-slate-400">{ch.unit}</span>
              </button>
            );
          })}
        </div>

        {/* Time Window Zoom & Cursor Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-background border border-surface-border rounded p-0.5">
            <button
              onClick={() => setTimeWindowSec(5)}
              className={`px-2 py-0.5 rounded text-xs ${timeWindowSec === 5 ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'}`}
            >
              5s
            </button>
            <button
              onClick={() => setTimeWindowSec(10)}
              className={`px-2 py-0.5 rounded text-xs ${timeWindowSec === 10 ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'}`}
            >
              10s
            </button>
            <button
              onClick={() => setTimeWindowSec(30)}
              className={`px-2 py-0.5 rounded text-xs ${timeWindowSec === 30 ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'}`}
            >
              30s
            </button>
          </div>

          <button
            onClick={() => {
              setCursorA(null);
              setCursorB(null);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 border border-surface-border text-xs"
            title="Clear measurement cursors"
          >
            <Crosshair className="w-3 h-3" />
            <span>Reset Cursors</span>
          </button>
        </div>
      </div>

      {/* Main Plot Area */}
      <div className="flex-1 relative p-2 overflow-hidden flex flex-col">
        <canvas
          ref={canvasRef}
          width={1200}
          height={600}
          onClick={handleCanvasClick}
          className="w-full h-full rounded border border-surface-border cursor-crosshair shadow-inner"
        />

        {/* Cursor Delta Legend Overlay */}
        {(cursorA !== null || cursorB !== null) && (
          <div className="absolute top-4 right-4 bg-surface/90 border border-surface-border rounded p-3 text-xs flex flex-col gap-1 backdrop-blur-sm shadow-lg">
            <div className="font-semibold text-slate-200 text-[11px] border-b border-surface-border pb-1">Dual Cursor Telemetry</div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-amber-400 font-medium">Cursor A:</span>
              <span className="text-slate-300">{cursorA !== null ? `${cursorA.toFixed(0)} px` : 'Unset'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-cyan-400 font-medium">Cursor B:</span>
              <span className="text-slate-300">{cursorB !== null ? `${cursorB.toFixed(0)} px` : 'Unset'}</span>
            </div>
            {cursorA !== null && cursorB !== null && (
              <div className="flex items-center justify-between gap-4 border-t border-surface-border/60 pt-1 mt-1 font-semibold text-emerald-400">
                <span>ΔX (Time Offset):</span>
                <span>{Math.abs((cursorB - cursorA) / 1200 * timeWindowSec * 1000).toFixed(1)} ms</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
