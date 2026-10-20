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
 * In-browser DBC parser supporting BO_ (Messages) and SG_ (Signals)
 */
export function parseDbcText(dbcText: string): DbcMessageDef[] {
  const lines = dbcText.split('\n');
  const messages: DbcMessageDef[] = [];
  let currentMsg: DbcMessageDef | null = null;

  // Regex patterns
  // BO_ 32 EngineStatus: 8 ECU
  const boRegex = /^BO_\s+(\d+)\s+([a-zA-Z0-9_]+)\s*:\s*(\d+)\s+([a-zA-Z0-9_]+)/;
  // SG_ EngineSpeed : 0|16@1+ (0.25,0) [0|15000] "rpm" Vector__XXX
  const sgRegex = /^\s*SG_\s+([a-zA-Z0-9_]+)\s*(?:m\d+)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"/;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const boMatch = line.match(boRegex);
    if (boMatch) {
      currentMsg = {
        id: parseInt(boMatch[1], 10),
        name: boMatch[2],
        dlc: parseInt(boMatch[3], 10),
        sender: boMatch[4],
        signals: [],
      };
      messages.push(currentMsg);
      continue;
    }

    if (currentMsg) {
      const sgMatch = line.match(sgRegex);
      if (sgMatch) {
        const signal: DbcSignalDef = {
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
        };
        currentMsg.signals.push(signal);
      }
    }
  }

  return messages.length > 0 ? messages : DEFAULT_MOTO_MESSAGES;
}

/**
 * Decodes raw CAN payload bytes using a message definition
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
    let rawValue = 0;

    if (sig.isLittleEndian) {
      // Little-endian bit extraction
      const startByte = Math.floor(sig.startBit / 8);
      const startBitInByte = sig.startBit % 8;

      if (startByte >= data.length) continue;

      let bitsLeft = sig.bitLength;
      let currentByteIdx = startByte;
      let bitOffsetInResult = 0;

      while (bitsLeft > 0 && currentByteIdx < data.length) {
        const byteVal = data[currentByteIdx];
        const bitShift = currentByteIdx === startByte ? startBitInByte : 0;
        const bitsToTake = Math.min(8 - bitShift, bitsLeft);
        const mask = (1 << bitsToTake) - 1;
        const extractedBits = (byteVal >> bitShift) & mask;

        rawValue |= (extractedBits << bitOffsetInResult);
        bitOffsetInResult += bitsToTake;
        bitsLeft -= bitsToTake;
        currentByteIdx++;
      }

      // Sign extension if signed
      if (sig.isSigned && (rawValue & (1 << (sig.bitLength - 1)))) {
        rawValue = rawValue - (1 << sig.bitLength);
      }
    } else {
      // Big-endian extraction (standard single-byte or 16-bit)
      const startByte = Math.floor(sig.startBit / 8);
      if (startByte < data.length) {
        rawValue = data[startByte];
      }
    }

    const physicalValue = (rawValue * sig.factor) + sig.offset;
    result[sig.name] = Number(physicalValue.toFixed(2));
  }

  return result;
}
