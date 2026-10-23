import { DbcMessageDef, DbcSignalDef } from '../types/can';

/**
 * Built-in platform DBC catalog preloaded from moto-vehicle-defs
 * (platform.dbc & cl250.dbc)
 */
export const DEFAULT_MOTO_MESSAGES: DbcMessageDef[] = [
  {
    id: 0x020,
    name: 'EngineAndVehicleSpeed',
    dlc: 8,
    sender: 'ECU',
    signals: [
      { name: 'EngineSpeed', startBit: 0, bitLength: 16, isLittleEndian: true, isSigned: false, factor: 0.25, offset: 0, min: 0, max: 15000, unit: 'rpm' },
      { name: 'VehicleSpeed', startBit: 16, bitLength: 16, isLittleEndian: true, isSigned: false, factor: 0.01, offset: 0, min: 0, max: 250, unit: 'km/h' },
      { name: 'ThrottlePosition', startBit: 32, bitLength: 8, isLittleEndian: true, isSigned: false, factor: 0.39215686, offset: 0, min: 0, max: 100, unit: '%' },
      { name: 'GearPosition', startBit: 40, bitLength: 4, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 6, unit: 'gear' },
      { name: 'EngineCoolantTemp', startBit: 48, bitLength: 8, isLittleEndian: true, isSigned: false, factor: 1, offset: -40, min: -40, max: 150, unit: '°C' },
    ],
  },
  {
    id: 0x021,
    name: 'VehicleDynamicsIMU',
    dlc: 8,
    sender: 'SAFETY_NODE',
    signals: [
      { name: 'LeanAngle', startBit: 0, bitLength: 16, isLittleEndian: true, isSigned: true, factor: 0.01, offset: 0, min: -60, max: 60, unit: 'deg' },
      { name: 'RollRate', startBit: 16, bitLength: 16, isLittleEndian: true, isSigned: true, factor: 0.02, offset: 0, min: -250, max: 250, unit: 'deg/s' },
      { name: 'PitchRate', startBit: 32, bitLength: 16, isLittleEndian: true, isSigned: true, factor: 0.02, offset: 0, min: -250, max: 250, unit: 'deg/s' },
      { name: 'LateralAccel', startBit: 48, bitLength: 16, isLittleEndian: true, isSigned: true, factor: 0.001, offset: 0, min: -4, max: 4, unit: 'g' },
    ],
  },
  {
    id: 0x110,
    name: 'WheelSpeedsAndBrakes',
    dlc: 8,
    sender: 'ABS',
    signals: [
      { name: 'FrontWheelSpeed', startBit: 0, bitLength: 16, isLittleEndian: true, isSigned: false, factor: 0.01, offset: 0, min: 0, max: 250, unit: 'km/h' },
      { name: 'RearWheelSpeed', startBit: 16, bitLength: 16, isLittleEndian: true, isSigned: false, factor: 0.01, offset: 0, min: 0, max: 250, unit: 'km/h' },
      { name: 'FrontBrakeActive', startBit: 32, bitLength: 1, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 1, unit: 'bool' },
      { name: 'RearBrakeActive', startBit: 33, bitLength: 1, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 1, unit: 'bool' },
      { name: 'AbsIntervention', startBit: 34, bitLength: 1, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 1, unit: 'bool' },
    ],
  },
  {
    id: 0x081,
    name: 'HeartbeatRtCore',
    dlc: 4,
    sender: 'RT_CORE',
    signals: [
      { name: 'AliveCounter', startBit: 0, bitLength: 8, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 255, unit: 'cnt' },
      { name: 'NodeState', startBit: 8, bitLength: 8, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 15, unit: 'enum' },
      { name: 'FaultMask', startBit: 16, bitLength: 16, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 65535, unit: 'mask' },
    ],
  },
  {
    id: 0x082,
    name: 'HeartbeatSafetyNode',
    dlc: 4,
    sender: 'SAFETY_NODE',
    signals: [
      { name: 'AliveCounter', startBit: 0, bitLength: 8, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 255, unit: 'cnt' },
      { name: 'SafetyState', startBit: 8, bitLength: 8, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 15, unit: 'enum' },
      { name: 'ImmobilizerLocked', startBit: 16, bitLength: 1, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, min: 0, max: 1, unit: 'bool' },
    ],
  },
];

/**
 * In-browser DBC parser supporting BO_ (Messages) and SG_ (Signals).
 * Returns an empty list when the text holds no message: callers decide what to do,
 * the parser never substitutes another catalog.
 */
export function parseDbcText(dbcText: string): DbcMessageDef[] {
  const lines = dbcText.split(/\r?\n/);
  const messages: DbcMessageDef[] = [];
  let currentMsg: DbcMessageDef | null = null;

  // BO_ 32 EngineStatus: 8 ECU
  const boRegex = /^BO_\s+(\d+)\s+([A-Za-z0-9_]+)\s*:\s*(\d+)\s+([A-Za-z0-9_]+)/;
  // SG_ EngineSpeed [M|m0] : 0|16@1+ (0.25,0) [0|15000] "rpm" Vector__XXX
  const sgRegex =
    /^SG_\s+([A-Za-z0-9_]+)\s*(?:M|m\d+M?)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"/;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const boMatch = line.match(boRegex);
    if (boMatch) {
      const rawId = Number(boMatch[1]);
      // DBC marks a 29-bit identifier with bit 31 set.
      const isExtended = rawId >= 0x80000000;
      currentMsg = {
        id: isExtended ? rawId - 0x80000000 : rawId,
        name: boMatch[2],
        dlc: parseInt(boMatch[3], 10),
        sender: boMatch[4],
        signals: [],
      };
      messages.push(currentMsg);
      continue;
    }

    if (line === '' ) {
      currentMsg = null;
      continue;
    }

    if (currentMsg) {
      const sgMatch = line.match(sgRegex);
      if (sgMatch) {
        currentMsg.signals.push({
          name: sgMatch[1],
          startBit: parseInt(sgMatch[2], 10),
          bitLength: parseInt(sgMatch[3], 10),
          isLittleEndian: sgMatch[4] === '1',
          isSigned: sgMatch[5] === '-',
          factor: parseFloat(sgMatch[6]),
          offset: parseFloat(sgMatch[7]),
          min: parseFloat(sgMatch[8]),
          max: parseFloat(sgMatch[9]),
          unit: sgMatch[10],
        });
      }
    }
  }

  return messages;
}

/**
 * Extracts the raw (unscaled) value of a signal. Works for any length up to 52 bits
 * without 32-bit overflow (no bitwise operators on the accumulated value).
 * Returns null when the signal does not fit in the payload.
 */
export function extractRawValue(data: number[], sig: DbcSignalDef): number | null {
  const len = sig.bitLength;
  if (len <= 0 || len > 52) return null;

  let raw = 0;
  if (sig.isLittleEndian) {
    // Intel: start bit is the LSB; bits go up through the bytes.
    for (let i = len - 1; i >= 0; i--) {
      const bitPos = sig.startBit + i;
      const byteIdx = Math.floor(bitPos / 8);
      if (byteIdx >= data.length) return null;
      const bit = (data[byteIdx] >> (bitPos % 8)) & 1;
      raw = raw * 2 + bit;
    }
  } else {
    // Motorola: start bit is the MSB in DBC sawtooth numbering; walk down each byte,
    // then continue at bit 7 of the next byte.
    let bitPos = sig.startBit;
    for (let i = 0; i < len; i++) {
      const byteIdx = Math.floor(bitPos / 8);
      if (byteIdx >= data.length) return null;
      const bit = (data[byteIdx] >> (bitPos % 8)) & 1;
      raw = raw * 2 + bit;
      bitPos = bitPos % 8 === 0 ? bitPos + 15 : bitPos - 1;
    }
  }

  if (sig.isSigned && raw >= 2 ** (len - 1)) {
    raw -= 2 ** len;
  }
  return raw;
}

/**
 * Decodes raw CAN payload bytes using a message definition. Values are full precision;
 * formatting belongs to the UI.
 */
export function decodeFrameSignals(
  data: number[],
  messageDef?: DbcMessageDef
): Record<string, number | string> {
  if (!messageDef || !messageDef.signals || messageDef.signals.length === 0) {
    return {};
  }

  const result: Record<string, number | string> = {};
  for (const sig of messageDef.signals) {
    const raw = extractRawValue(data, sig);
    if (raw === null) continue;
    result[sig.name] = raw * sig.factor + sig.offset;
  }
  return result;
}
