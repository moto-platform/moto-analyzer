import { describe, it, expect } from 'vitest';
import { composeUdsRequest, generateIsoTpLadderTrace, UDS_REQUEST_ID, UDS_RESPONSE_ID } from '../src/services/udsComposer';

describe('composeUdsRequest', () => {
  it('builds a padded Single Frame for ReadDataByIdentifier', () => {
    const req = composeUdsRequest(0x22, undefined, [0xf4, 0x0c]);
    expect(req.valid).toBe(true);
    expect(req.canFrameData).toEqual([0x03, 0x22, 0xf4, 0x0c, 0xaa, 0xaa, 0xaa, 0xaa]);
  });

  it('allows the default and extended session, refuses the programming session', () => {
    expect(composeUdsRequest(0x10, 0x01).valid).toBe(true);
    expect(composeUdsRequest(0x10, 0x03).valid).toBe(true);
    const prog = composeUdsRequest(0x10, 0x02);
    expect(prog.valid).toBe(false);
    expect(prog.errorMessage).toMatch(/INVARIANT 1/);
  });

  it('ignores the suppressPosRsp bit in the sub-function check', () => {
    expect(composeUdsRequest(0x3e, 0x80).valid).toBe(true);
    expect(composeUdsRequest(0x10, 0x82).valid).toBe(false);
  });

  it('requires a sub-function where the service has one', () => {
    expect(composeUdsRequest(0x10).valid).toBe(false);
  });

  it('refuses writing, clearing, resetting and routine services', () => {
    for (const sid of [0x2e, 0x14, 0x11, 0x31]) {
      const r = composeUdsRequest(sid, 0x01);
      expect(r.valid).toBe(false);
      expect(r.isAllowed).toBe(false);
    }
  });

  it('refuses requests that need a First Frame (requests stay Single Frame)', () => {
    expect(composeUdsRequest(0x22, undefined, [1, 2, 3, 4, 5, 6, 7]).valid).toBe(false);
  });
});

describe('ladder IDs', () => {
  it('sends requests on the tester request ID and answers on the ECU response ID', () => {
    const ladder = generateIsoTpLadderTrace(composeUdsRequest(0x22, undefined, [0xf4, 0x0c]));
    expect(UDS_REQUEST_ID).toBe(0x18da10f1);
    expect(UDS_RESPONSE_ID).toBe(0x18daf110);
    expect(ladder[0]).toMatchObject({ direction: 'tester_to_ecu', canIdHex: '0x18DA10F1' });
    expect(ladder[1]).toMatchObject({ direction: 'ecu_to_tester', canIdHex: '0x18DAF110' });
  });
});
