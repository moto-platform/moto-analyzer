import { describe, it, expect } from 'vitest';
import { DEFS, decodeDid, encodeDid } from '../src/defs';

describe('pinned moto-vehicle-defs', () => {
  it('loads the platform DBC with cycle times, E2E data IDs and value tables', () => {
    const lean = DEFS.platform.messages.find((m) => m.id === 0x020)!;
    expect(lean.name).toBe('EkfLean');
    expect(lean.cycleTimeMs).toBe(20);
    expect(lean.e2e).toEqual({ dataId: 0x1020 });
    expect(lean.signals.find((s) => s.name === 'LEAN_ANGLE_STATE')!.values).toMatchObject({ 0: 'ESTIMATED', 3: 'INVALID' });
    const eng = DEFS.platform.messages.find((m) => m.id === 0x110)!;
    expect(eng.name).toBe('VehicleEngine');
    expect(eng.e2e).toBeUndefined();
  });

  it('treats the CL250 vehicle DBC as the skeleton it is (no broadcast frames known)', () => {
    expect(DEFS.vehicleDbc.messages).toEqual([]);
  });

  it('loads UDS addressing, tester policy and DIDs', () => {
    expect(DEFS.vehicle.addressing.primary).toEqual({ requestId: 0x18da10f1, responseId: 0x18daf110, extended: true });
    expect(DEFS.vehicle.testerPolicy.forbidden).toContain(0x2e);
    const rpm = DEFS.vehicle.dids.find((d) => d.name === 'ENGINE_SPEED')!;
    expect(rpm.did).toBe(0xf40c);
    expect(rpm.platformSignal).toBe('VehicleEngine.ENGINE_SPEED');
    expect(decodeDid(rpm, [0x1f, 0x40])).toBe(2000);
    expect(encodeDid(rpm, 2000)).toEqual([0x1f, 0x40]);
    const ect = DEFS.vehicle.dids.find((d) => d.name === 'COOLANT_TEMP')!;
    expect(decodeDid(ect, encodeDid(ect, 85))).toBe(85);
  });

  it('loads the D-079 windows with their record DIDs', () => {
    expect(DEFS.windows.map((w) => w.key)).toEqual(['W1_KEY_ON', 'W2_CRANK', 'W3_WARM_IDLE', 'W4_CRUISE', 'W5_POST_STOP']);
    const w3 = DEFS.windows.find((w) => w.key === 'W3_WARM_IDLE')!;
    expect(w3.recordDid).toBe(0xfd4c);
    expect(w3.conditions).toContainEqual({ input: 'did.COOLANT_TEMP', op: 'gt', value: 80 });
  });

  it('loads ISO 14229 names, identification DIDs (no VIN) and cornering limits', () => {
    expect(DEFS.iso.nrcs.get(0x31)).toBe('REQUEST_OUT_OF_RANGE');
    expect(DEFS.identification.map((i) => i.did)).not.toContain(0xf190);
    expect(DEFS.limits.kYellow).toBeLessThan(DEFS.limits.kRed);
    expect(DEFS.ref).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});
