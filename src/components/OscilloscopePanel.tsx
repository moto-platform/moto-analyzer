import { useRef, useEffect, useState, useMemo } from 'react';
import { Crosshair, CheckSquare, Square, Camera, Download, Calculator } from 'lucide-react';
import {
  MathChannelDef,
  DEFAULT_MATH_CHANNELS,
  computeMathChannel,
  exportOscilloscopeCsv,
  captureBrandedSnapshot,
  CsvExportChannel,
} from '../services/mathChannels';
import { formatValue } from '../services/format';

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
    { name: 'FrontWheelSpeed', label: 'Front Wheel', unit: 'km/h', color: '#38bdf8', min: 0, max: 160, enabled: false },
    { name: 'RearWheelSpeed', label: 'Rear Wheel', unit: 'km/h', color: '#fb923c', min: 0, max: 160, enabled: false },
  ]);

  const [mathChannels, setMathChannels] = useState<MathChannelDef[]>(DEFAULT_MATH_CHANNELS);
  const [showMathToolbar, setShowMathToolbar] = useState<boolean>(false);

  const toggleChannel = (name: string) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.name === name ? { ...ch, enabled: !ch.enabled } : ch))
    );
  };

  const toggleMathChannel = (id: string) => {
    setMathChannels((prev) =>
      prev.map((ch) => (ch.id === id ? { ...ch, enabled: !ch.enabled } : ch))
    );
  };

  // Precompute active math channel series
  const computedMathSeries = useMemo(() => {
    const map = new Map<string, { time: number; value: number }[]>();
    mathChannels.forEach((mCh) => {
      if (mCh.enabled) {
        map.set(mCh.id, computeMathChannel(mCh, signalsHistory));
      }
    });
    return map;
  }, [mathChannels, signalsHistory]);

  // Export CSV handler
  const handleExportCsv = () => {
    const exportData: CsvExportChannel[] = [];

    // Add enabled physical channels
    channels.forEach((ch) => {
      if (ch.enabled) {
        exportData.push({
          name: ch.name,
          label: ch.label,
          unit: ch.unit,
          data: signalsHistory.get(ch.name) || [],
        });
      }
    });

    // Add enabled math channels
    mathChannels.forEach((mCh) => {
      if (mCh.enabled) {
        exportData.push({
          name: mCh.id,
          label: `[Math] ${mCh.label}`,
          unit: mCh.unit,
          data: computedMathSeries.get(mCh.id) || [],
        });
      }
    });

    if (exportData.length === 0) {
      alert('Please enable at least one channel to export CSV.');
      return;
    }

    const csvContent = exportOscilloscopeCsv(exportData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moto-analyzer-oscilloscope-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Snapshot PNG handler
  const handleSnapshotPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const activeCount = channels.filter((c) => c.enabled).length + mathChannels.filter((m) => m.enabled).length;
    const dataUrl = captureBrandedSnapshot(canvas, {
      activeChannelsCount: activeCount,
      timeWindowSec,
      platformName: 'Honda CL250 SDV Architecture',
    });

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `moto-analyzer-scope-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
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

      // 1. Plot Enabled Standard Channels
      ctx.setLineDash([]);
      channels.forEach((ch) => {
        if (!ch.enabled) return;
        const points = signalsHistory.get(ch.name);
        if (!points || points.length < 2) return;

        const visiblePoints = points.filter((p) => p.time >= startTime && p.time <= latestTime);
        if (visiblePoints.length < 2) return;

        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        visiblePoints.forEach((pt, idx) => {
          const x = ((pt.time - startTime) / timeWindowSec) * width;
          const normalized = (pt.value - ch.min) / (ch.max - ch.min);
          const clamped = Math.max(0, Math.min(1, normalized));
          const y = height - clamped * (height - 30) - 15;

          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();
      });

      // 2. Plot Enabled Math Channels (with dashed neon line)
      mathChannels.forEach((mCh) => {
        if (!mCh.enabled) return;
        const points = computedMathSeries.get(mCh.id);
        if (!points || points.length < 2) return;

        const visiblePoints = points.filter((p) => p.time >= startTime && p.time <= latestTime);
        if (visiblePoints.length < 2) return;

        ctx.setLineDash([6, 3]);
        ctx.strokeStyle = mCh.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();

        visiblePoints.forEach((pt, idx) => {
          const x = ((pt.time - startTime) / timeWindowSec) * width;
          const normalized = (pt.value - mCh.min) / (mCh.max - mCh.min);
          const clamped = Math.max(0, Math.min(1, normalized));
          const y = height - clamped * (height - 30) - 15;

          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 3. Draw Measurement Cursors
      if (cursorA !== null) {
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cursorA * width, 0);
        ctx.lineTo(cursorA * width, height);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px monospace';
        ctx.fillText('Cursor A', cursorA * width + 4, 15);
      }

      if (cursorB !== null) {
        ctx.strokeStyle = '#06b6d4';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cursorB * width, 0);
        ctx.lineTo(cursorB * width, height);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#06b6d4';
        ctx.font = '10px monospace';
        ctx.fillText('Cursor B', cursorB * width + 4, 30);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [signalsHistory, channels, mathChannels, computedMathSeries, timeWindowSec, cursorA, cursorB]);

  // Time at a cursor (fraction of the window), using the same window end as the plot.
  const latestTimeOverall = useMemo(() => {
    let t = 0;
    signalsHistory.forEach((pts) => {
      if (pts.length > 0 && pts[pts.length - 1].time > t) t = pts[pts.length - 1].time;
    });
    return t;
  }, [signalsHistory]);
  const cursorTime = (frac: number) => Math.max(0, latestTimeOverall - timeWindowSec) + frac * timeWindowSec;

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Cursors are kept as a fraction of the plot width, independent of the CSS size.
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

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
                <strong style={{ color: ch.color }}>{formatValue(latest)}</strong>
                <span className="text-[10px] text-slate-400">{ch.unit}</span>
              </button>
            );
          })}

          {/* Math Channels Popover Toggle */}
          <button
            onClick={() => setShowMathToolbar((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-all ${
              showMathToolbar || mathChannels.some((m) => m.enabled)
                ? 'bg-pink-950/40 border-pink-500/60 text-pink-300 font-medium'
                : 'bg-surface-elevated text-slate-400 border-surface-border hover:text-slate-200'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-pink-400" />
            <span>Math Channels {mathChannels.filter((m) => m.enabled).length > 0 ? `(${mathChannels.filter((m) => m.enabled).length})` : ''}</span>
          </button>
        </div>

        {/* Time Window Zoom, Export & Cursor Controls */}
        <div className="flex items-center gap-2">
          {/* Time scale */}
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

          {/* Reset Cursors */}
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

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated hover:bg-emerald-950/40 text-emerald-300 border border-emerald-500/40 hover:border-emerald-500 text-xs transition-colors"
            title="Export plotted channels to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          {/* Snapshot PNG */}
          <button
            onClick={handleSnapshotPng}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated hover:bg-cyan-950/40 text-cyan-300 border border-cyan-500/40 hover:border-cyan-500 text-xs transition-colors"
            title="Capture branded oscilloscope screenshot"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      {/* Math Channels Sub-Toolbar */}
      {showMathToolbar && (
        <div className="bg-surface-elevated/60 border-b border-surface-border px-4 py-2 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-pink-400 font-semibold flex items-center gap-1">
            <Calculator className="w-3 h-3" />
            <span>DERIVED MATH CHANNELS:</span>
          </span>
          {mathChannels.map((mCh) => {
            const series = computedMathSeries.get(mCh.id);
            const latest = series && series.length > 0 ? series[series.length - 1].value : '-';

            return (
              <button
                key={mCh.id}
                onClick={() => toggleMathChannel(mCh.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-all ${
                  mCh.enabled
                    ? 'bg-surface-elevated text-pink-200'
                    : 'bg-background text-slate-500 border-surface-border opacity-70'
                }`}
                style={{ borderColor: mCh.enabled ? mCh.color : undefined }}
              >
                {mCh.enabled ? <CheckSquare className="w-3.5 h-3.5" style={{ color: mCh.color }} /> : <Square className="w-3.5 h-3.5" />}
                <span>{mCh.label}:</span>
                <strong style={{ color: mCh.color }}>{formatValue(latest)}</strong>
                <span className="text-[10px] text-slate-400">{mCh.unit}</span>
              </button>
            );
          })}
        </div>
      )}

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
              <span className="text-slate-300">{cursorA !== null ? `${cursorTime(cursorA).toFixed(3)} s` : 'Unset'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-cyan-400 font-medium">Cursor B:</span>
              <span className="text-slate-300">{cursorB !== null ? `${cursorTime(cursorB).toFixed(3)} s` : 'Unset'}</span>
            </div>
            {cursorA !== null && cursorB !== null && (
              <div className="flex items-center justify-between gap-4 border-t border-surface-border/60 pt-1 mt-1 font-semibold text-emerald-400">
                <span>ΔX (Time Offset):</span>
                <span>{Math.abs((cursorB - cursorA) * timeWindowSec * 1000).toFixed(1)} ms</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
