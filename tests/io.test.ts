import { describe, it, expect } from 'vitest';
import { parseSlcanLine } from '../src/services/webSerialCan';
import { parseStreamMessage } from '../src/services/streamClient';
import { exportToVectorAsc } from '../src/services/exportService';
import { parseVectorAsc, parseCanCsv } from '../src/services/logParser';
import { exportToCsv } from '../src/services/exportService';
import type { CanFrame } from '../src/types/can';

const frame = (over: Partial<CanFrame>): CanFrame => ({
  id: 0x110, idHex: '0x110', bus: 'platform', dlc: 8, data: [1, 2, 3, 4, 5, 6, 7, 8], timestamp: 1.5,
  deltaMs: 0, isExtended: false, periodMs: 0, frequencyHz: 0, count: 1, ...over,
});

describe('SLCAN', () => {
  it('parses standard and extended data frames', () => {
    expect(parseSlcanLine('t1102AABB', 'vehicle')).toMatchObject({ id: 0x110, dlc: 2, data: [0xaa, 0xbb], isExtended: false });
    expect(parseSlcanLine('T18DAF1108046240C1FAAAAAAAA', 'vehicle')).toMatchObject({ id: 0x18daf110, dlc: 8, isExtended: true });
  });
  it('rejects malformed lines and non-data replies', () => {
    for (const l of ['t11', 't1109AA', 'tFFF1AA'.replace('FFF', '8FF'), 'z', '\x07', 't110', 'r1100']) {
      expect(parseSlcanLine(l, 'vehicle')).toBeNull();
    }
  });
});

describe('vehicle-server stream protocol', () => {
  it('reads CanFrameDto fields (data_hex, timestamp_us, is_extended, channel)', () => {
    const { frames } = parseStreamMessage(
      { type: 'frame', payload: { timestamp_us: 2_500_000, channel: 1, id: 0x18daf110, is_extended: true, dlc: 8, data_hex: '04620c1faaaaaaaa' } });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ bus: 'vehicle', isExtended: true, timestamp: 2.5, data: [4, 0x62, 0x0c, 0x1f, 0xaa, 0xaa, 0xaa, 0xaa] });
  });
  it('reads batches and stats; ignores malformed frames', () => {
    const r = parseStreamMessage(
      { type: 'batch', payload: { timestamp_us: 0, frames: [{ id: 1, data_hex: 'zz' }, { id: 0x20, channel: 2, dlc: 1, data_hex: '01' }], stats: { bus_load_pct: 12.5, frame_rate_hz: 300 } } });
    expect(r.frames.map((f) => f.id)).toEqual([0x20]);
    expect(r.stats).toEqual({ busLoadPct: 12.5, msgPerSec: 300 });
  });
});

describe('log export/import', () => {
  it('writes Vector ASC without 0x prefixes and reads it back', () => {
    const frames = [frame({}), frame({ id: 0x18da10f1, idHex: '0x18DA10F1', isExtended: true, bus: 'vehicle', timestamp: 2, data: [2, 0x10, 3, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa] })];
    const asc = exportToVectorAsc(frames);
    expect(asc).not.toMatch(/0x/);
    expect(asc).toMatch(/18DA10F1x/);
    const back = parseVectorAsc(asc);
    expect(back.map((f) => [f.id, f.isExtended, f.bus, f.data.length])).toEqual([
      [0x110, false, 'platform', 8],
      [0x18da10f1, true, 'vehicle', 8],
    ]);
    expect(back[1].timestamp).toBe(2);
  });
  it('round-trips CSV', () => {
    const back = parseCanCsv(exportToCsv([frame({})]));
    expect(back[0]).toMatchObject({ id: 0x110, bus: 'platform', data: [1, 2, 3, 4, 5, 6, 7, 8], timestamp: 1.5 });
  });
});
