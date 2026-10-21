/**
 * Math Channels & Telemetry Signal Calculus Service for moto-analyzer
 *
 * Provides real-time computed channels (derivatives, slip ratios, power indices)
 * and oscilloscope telemetry export (CSV & branded snapshot).
 */

export interface MathChannelDef {
  id: string;
  label: string;
  unit: string;
  color: string;
  min: number;
  max: number;
  enabled: boolean;
  type: 'wheel_slip' | 'lean_velocity' | 'power_index' | 'custom_diff';
  primarySignal: string;
  secondarySignal?: string;
  scale?: number;
}

export const DEFAULT_MATH_CHANNELS: MathChannelDef[] = [
  {
    id: 'math_wheel_slip',
    label: 'Wheel Slip Δv',
    unit: 'km/h',
    color: '#ec4899', // pink-500
    min: 0,
    max: 25,
    enabled: false,
    type: 'wheel_slip',
    primarySignal: 'FrontWheelSpeed',
    secondarySignal: 'RearWheelSpeed',
  },
  {
    id: 'math_lean_velocity',
    label: 'Lean Velocity dθ/dt',
    unit: '°/s',
    color: '#8b5cf6', // purple-500
    min: -100,
    max: 100,
    enabled: false,
    type: 'lean_velocity',
    primarySignal: 'LeanAngle',
  },
  {
    id: 'math_power_index',
    label: 'Power Demand Index',
    unit: 'kW·idx',
    color: '#eab308', // yellow-500
    min: 0,
    max: 100,
    enabled: false,
    type: 'power_index',
    primarySignal: 'EngineSpeed',
    secondarySignal: 'ThrottlePosition',
    scale: 0.001,
  },
];

/**
 * Calculates a derived math channel series from raw signals history
 */
export function computeMathChannel(
  mathDef: MathChannelDef,
  signalsHistory: Map<string, { time: number; value: number }[]>
): { time: number; value: number }[] {
  const primary = signalsHistory.get(mathDef.primarySignal) || [];

  if (mathDef.type === 'lean_velocity') {
    // Numerical differentiation: dθ/dt
    if (primary.length < 2) return [];
    const result: { time: number; value: number }[] = [];
    for (let i = 1; i < primary.length; i++) {
      const dt = primary[i].time - primary[i - 1].time;
      if (dt > 0.0001 && dt < 1.0) {
        // limit noise from dropped frames or time jumps
        const dVal = (primary[i].value - primary[i - 1].value) / dt;
        result.push({
          time: primary[i].time,
          value: parseFloat(dVal.toFixed(2)),
        });
      }
    }
    return result;
  }

  const secondary = mathDef.secondarySignal ? signalsHistory.get(mathDef.secondarySignal) || [] : [];
  if (primary.length === 0 || secondary.length === 0) return [];

  // Timestamp alignment with nearest-neighbor search within 100ms window
  const result: { time: number; value: number }[] = [];
  let secIdx = 0;

  for (let i = 0; i < primary.length; i++) {
    const pPt = primary[i];

    // advance secondary index to find closest timestamp
    while (secIdx < secondary.length - 1 && Math.abs(secondary[secIdx + 1].time - pPt.time) <= Math.abs(secondary[secIdx].time - pPt.time)) {
      secIdx++;
    }

    const sPt = secondary[secIdx];
    if (Math.abs(sPt.time - pPt.time) <= 0.15) {
      // within 150ms
      let val = 0;

      if (mathDef.type === 'wheel_slip') {
        // |Front - Rear|
        val = Math.abs(pPt.value - sPt.value);
      } else if (mathDef.type === 'power_index') {
        // (RPM * Throttle%) * scale
        const scale = mathDef.scale ?? 0.001;
        val = (pPt.value * sPt.value) * scale;
      } else if (mathDef.type === 'custom_diff') {
        val = pPt.value - sPt.value;
      }

      result.push({
        time: pPt.time,
        value: parseFloat(val.toFixed(2)),
      });
    }
  }

  return result;
}

export interface CsvExportChannel {
  name: string;
  label: string;
  unit: string;
  data: { time: number; value: number }[];
}

/**
 * Generates ISO/SAE compliant CSV string for oscilloscope signal series
 */
export function exportOscilloscopeCsv(channels: CsvExportChannel[], minTime?: number, maxTime?: number): string {
  if (channels.length === 0) return 'Time_s\n';

  // Collect all unique timestamps sorted ascending
  const timeSet = new Set<number>();
  channels.forEach((ch) => {
    ch.data.forEach((pt) => {
      if ((minTime === undefined || pt.time >= minTime) && (maxTime === undefined || pt.time <= maxTime)) {
        // Quantize to millisecond (3 decimal places) to avoid floating point jitter
        timeSet.add(Math.round(pt.time * 1000) / 1000);
      }
    });
  });

  const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);

  // Header line
  const headers = ['Time_s', ...channels.map((ch) => `"${ch.label} (${ch.unit})"` )];
  const lines: string[] = [headers.join(',')];

  // Map each channel's points by quantized time for quick lookup
  const channelLookup = channels.map((ch) => {
    const map = new Map<number, number>();
    ch.data.forEach((pt) => {
      map.set(Math.round(pt.time * 1000) / 1000, pt.value);
    });
    return map;
  });

  // Track last known values for sample-and-hold interpolation
  const lastKnown = channels.map(() => '');

  for (const t of sortedTimes) {
    const row = [t.toFixed(3)];
    for (let c = 0; c < channels.length; c++) {
      const val = channelLookup[c].get(t);
      if (val !== undefined) {
        lastKnown[c] = val.toString();
        row.push(val.toString());
      } else {
        // Sample-and-hold (or empty if not yet received)
        row.push(lastKnown[c]);
      }
    }
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Captures the oscilloscope canvas with an overlaid branded telemetry watermark banner
 */
export function captureBrandedSnapshot(
  canvas: HTMLCanvasElement,
  metadata: {
    activeChannelsCount: number;
    timeWindowSec: number;
    platformName?: string;
  }
): string {
  // Create an offscreen canvas with same dimensions
  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  // Copy original canvas render
  ctx.drawImage(canvas, 0, 0);

  // Draw Watermark Overlay Banner at top
  ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
  ctx.fillRect(0, 0, offscreen.width, 36);

  // Border line under header
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 36);
  ctx.lineTo(offscreen.width, 36);
  ctx.stroke();

  // Branding text
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.fillText('MOTO-ANALYZER SDV OSCILLOSCOPE', 14, 23);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px "JetBrains Mono", monospace';
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  ctx.fillText(
    `[${metadata.platformName || 'Honda CL250 SDV'}] • Window: ${metadata.timeWindowSec}s • Active Channels: ${metadata.activeChannelsCount} • ${timestamp}`,
    270,
    22
  );

  // Bottom footer watermark
  ctx.fillStyle = 'rgba(9, 13, 22, 0.75)';
  ctx.fillRect(0, offscreen.height - 20, offscreen.width, 20);

  ctx.fillStyle = '#64748b';
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillText('Telemetry Scope Snapshot • Calibrated for CAN bus 500 kbps • Confidential Automotive Test Log', 14, offscreen.height - 6);

  return offscreen.toDataURL('image/png');
}
