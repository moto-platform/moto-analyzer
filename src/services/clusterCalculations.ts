/**
 * Instrument Cluster Telemetry Calculus & Gauge Mapping Service
 */

export interface ClusterTelemetry {
  rpm: number;
  speed: number;
  gear: number;
  coolantTemp: number;
  throttlePct: number;
  frontWheelSpeed: number;
  rearWheelSpeed: number;
  absActive: boolean;
  leanAngle: number;
  rollRate: number;
  lateralAccel: number;
}

/**
 * Calculates sweep angle (degrees) for tachometer needle/arc (270° sweep total)
 * From 135° (0 RPM) to 405° (10,000 RPM)
 */
export function calculateTachometerAngle(rpm: number, maxRpm: number = 10000): number {
  const clampedRpm = Math.max(0, Math.min(maxRpm, rpm));
  const fraction = clampedRpm / maxRpm;
  // 135 deg to 405 deg = 270 deg span
  return 135 + fraction * 270;
}

/**
 * Determines tachometer status and color scheme
 */
export function getRpmStatus(rpm: number): {
  isRedline: boolean;
  isWarning: boolean;
  colorHex: string;
} {
  if (rpm >= 8500) {
    return { isRedline: true, isWarning: false, colorHex: '#ef4444' }; // Red
  }
  if (rpm >= 6500) {
    return { isRedline: false, isWarning: true, colorHex: '#f59e0b' }; // Amber
  }
  return { isRedline: false, isWarning: false, colorHex: '#06b6d4' }; // Cyan
}

/**
 * Formats gear position display: 0 = 'N', 1-6 = '1'-'6'
 */
export function formatGearDisplay(gear: number): {
  label: string;
  isNeutral: boolean;
} {
  if (gear === 0) {
    return { label: 'N', isNeutral: true };
  }
  return { label: gear.toString(), isNeutral: false };
}

/**
 * Calculates wheel slip differential and ABS trigger warning
 */
export function calculateWheelSlip(frontSpeed: number, rearSpeed: number): {
  slipKmh: number;
  hasSignificantSlip: boolean;
} {
  const slip = Math.abs(frontSpeed - rearSpeed);
  return {
    slipKmh: parseFloat(slip.toFixed(1)),
    hasSignificantSlip: slip > 5.0,
  };
}
