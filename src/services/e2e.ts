/**
 * Platform E2E profile (moto-vehicle-defs docs/e2e-profile.md), receiver side, for
 * observing the platform bus. Byte 0 = CRC-8/SAE-J1850 over (DataID low, DataID high,
 * bytes 1..DLC-1); byte 1 bits 0-3 = alive counter 0..15. Timeout = 3 x cycle time,
 * max delta counter = 1.
 */

export type E2EStatus = 'OK' | 'OK_SOME_LOST' | 'INITIAL' | 'REPEATED' | 'WRONG_SEQUENCE' | 'WRONG_CRC' | 'NO_NEW_DATA';

export const E2E_MAX_DELTA_COUNTER = 1;
export const E2E_TIMEOUT_CYCLES = 3;

/** CRC-8/SAE-J1850: poly 0x1D, init 0xFF, final XOR 0xFF, no reflection. */
export function crc8SaeJ1850(bytes: number[]): number {
  let crc = 0xff;
  for (const b of bytes) {
    crc ^= b & 0xff;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x1d) & 0xff : (crc << 1) & 0xff;
  }
  return crc ^ 0xff;
}

export function e2eCrc(dataId: number, data: number[]): number {
  return crc8SaeJ1850([dataId & 0xff, (dataId >> 8) & 0xff, ...data.slice(1)]);
}

/** Writes counter and CRC into a packed payload (sender side; used by the simulator). */
export function e2eProtect(dataId: number, data: number[], counter: number): number[] {
  const out = [...data];
  out[1] = (out[1] & 0xf0) | (counter & 0x0f);
  out[0] = e2eCrc(dataId, out);
  return out;
}

export const isE2EValid = (s: E2EStatus) => s === 'OK' || s === 'OK_SOME_LOST';

interface RxState {
  lastCounter: number | null;
  lastValidMs: number | null;
}

/** Receiver state machine of one E2E-protected message. */
export class E2EChecker {
  private state: RxState = { lastCounter: null, lastValidMs: null };
  constructor(private readonly dataId: number, private readonly timeoutMs: number) {}

  public check(data: number[], nowMs: number): E2EStatus {
    if (data.length < 2 || e2eCrc(this.dataId, data) !== data[0]) return 'WRONG_CRC';
    const counter = data[1] & 0x0f;
    const s = this.state;

    if (s.lastCounter === null || s.lastValidMs === null || nowMs - s.lastValidMs > this.timeoutMs) {
      s.lastCounter = counter;
      s.lastValidMs = nowMs;
      return 'INITIAL';
    }

    const delta = (counter - s.lastCounter + 16) & 0x0f;
    if (delta === 0) return 'REPEATED';
    s.lastCounter = counter;
    if (delta > E2E_MAX_DELTA_COUNTER) return 'WRONG_SEQUENCE';
    s.lastValidMs = nowMs;
    return delta === 1 ? 'OK' : 'OK_SOME_LOST';
  }

  /** NO_NEW_DATA when no valid frame arrived within the timeout. */
  public checkTimeout(nowMs: number): E2EStatus | null {
    const s = this.state;
    if (s.lastValidMs === null || nowMs - s.lastValidMs > this.timeoutMs) {
      s.lastCounter = null;
      return 'NO_NEW_DATA';
    }
    return null;
  }
}
