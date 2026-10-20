import { CanFrame, DbcMessageDef } from '../types/can';
import { decodeFrameSignals } from './dbcParser';

/**
 * Parses Vector ASCII (.asc) file format into CanFrame array
 * Standard Vector format:
 *   0.000000 1  0x020           Rx   d 8 10 20 30 40 50 60 70 80
 */
export function parseVectorAsc(ascText: string, dbcMessages: DbcMessageDef[]): CanFrame[] {
  const lines = ascText.split('\n');
  const frames: CanFrame[] = [];
  let prevTimestamp = 0;

  // Regex matches: timestamp channel id Rx/Tx d dlc data...
  const ascRegex = /^\s*([0-9.]+)\s+(\d+)\s+([0-9a-fA-Fx]+)\s+(Rx|Tx)\s+d\s+(\d+)\s+([0-9a-fA-F ]+)/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('date') || line.startsWith('base')) {
      continue;
    }

    const match = line.match(ascRegex);
    if (match) {
      const timestamp = parseFloat(match[1]);
      const rawId = match[3].toLowerCase();
      const isExtended = rawId.endsWith('x');
      const cleanIdStr = isExtended ? rawId.slice(0, -1) : rawId;
      const id = cleanIdStr.startsWith('0x') ? parseInt(cleanIdStr, 16) : parseInt(cleanIdStr, 16);
      const dlc = parseInt(match[5], 10);
      const dataBytes = match[6]
        .trim()
        .split(/\s+/)
        .map((hex) => parseInt(hex, 16))
        .filter((n) => !isNaN(n));

      const deltaMs = prevTimestamp > 0 ? Number(((timestamp - prevTimestamp) * 1000).toFixed(2)) : 20.0;
      prevTimestamp = timestamp;

      const messageDef = dbcMessages.find((m) => m.id === id);
      const decodedSignals = decodeFrameSignals(dataBytes, messageDef);

      frames.push({
        id,
        idHex: `0x${id.toString(16).toUpperCase().padStart(3, '0')}`,
        bus: 'can0',
        dlc,
        data: dataBytes,
        timestamp: Number(timestamp.toFixed(4)),
        deltaMs,
        isExtended,
        periodMs: deltaMs,
        frequencyHz: deltaMs > 0 ? Number((1000 / deltaMs).toFixed(1)) : 50.0,
        count: 1,
        name: messageDef ? messageDef.name : undefined,
        decodedSignals,
      });
    }
  }

  return frames;
}

/**
 * Parses CSV log format into CanFrame array
 * Header: Timestamp,DeltaMs,Bus,CAN_ID,Name,DLC,DataHex,DecodedSignals
 */
export function parseCanCsv(csvText: string, dbcMessages: DbcMessageDef[]): CanFrame[] {
  const lines = csvText.split('\n');
  const frames: CanFrame[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length >= 7) {
      const timestamp = parseFloat(parts[0]);
      const deltaMs = parseFloat(parts[1]) || 20.0;
      const bus = parts[2] || 'can0';
      const idHex = parts[3].trim();
      const id = parseInt(idHex.replace('0x', ''), 16);
      const dlc = parseInt(parts[5], 10) || 8;
      const dataHex = parts[6].replace(/[^0-9a-fA-F]/g, '');

      const dataBytes: number[] = [];
      for (let b = 0; b < dataHex.length; b += 2) {
        dataBytes.push(parseInt(dataHex.substr(b, 2), 16));
      }

      const messageDef = dbcMessages.find((m) => m.id === id);
      const decodedSignals = decodeFrameSignals(dataBytes, messageDef);

      frames.push({
        id,
        idHex: idHex.toUpperCase(),
        bus,
        dlc,
        data: dataBytes,
        timestamp,
        deltaMs,
        isExtended: id > 0x7FF,
        periodMs: deltaMs,
        frequencyHz: deltaMs > 0 ? Number((1000 / deltaMs).toFixed(1)) : 50.0,
        count: 1,
        name: messageDef ? messageDef.name : parts[4].replace(/"/g, ''),
        decodedSignals,
      });
    }
  }

  return frames;
}
