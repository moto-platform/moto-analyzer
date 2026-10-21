import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeUdsRequest,
  generateIsoTpLadderTrace,
  UDS_SERVICES_CATALOG
} from '../src/services/udsComposer.ts';

test('UDS Composer: ReadDataByIdentifier (0x22) builds valid Single Frame request', () => {
  const req = composeUdsRequest(0x22, undefined, [0xFD, 0x01]);
  assert.equal(req.valid, true);
  assert.equal(req.isAllowed, true);
  assert.deepEqual(req.rawPayload, [0x22, 0xFD, 0x01]);
  // CAN Frame data: [0x03, 0x22, 0xFD, 0x01, 0xAA, 0xAA, 0xAA, 0xAA]
  assert.equal(req.canFrameData[0], 3); // SF Length 3
  assert.equal(req.canFrameData[1], 0x22);
  assert.equal(req.canFrameData[2], 0xFD);
  assert.equal(req.canFrameData[3], 0x01);
  assert.equal(req.canFrameData[4], 0xAA); // Padding byte
});

test('UDS Composer: DiagnosticSessionControl (0x10) subfunction is compiled', () => {
  const req = composeUdsRequest(0x10, 0x03);
  assert.equal(req.valid, true);
  assert.equal(req.isAllowed, true);
  assert.deepEqual(req.rawPayload, [0x10, 0x03]);
  assert.equal(req.canFrameData[0], 2); // SF Length 2
  assert.equal(req.canFrameData[1], 0x10);
  assert.equal(req.canFrameData[2], 0x03);
});

test('UDS Composer: Platform Invariant 1 strictly blocks WriteDataByIdentifier (0x2E)', () => {
  const req = composeUdsRequest(0x2E, undefined, [0xFD, 0x01, 0x00]);
  assert.equal(req.valid, false);
  assert.equal(req.isAllowed, false);
  assert.ok(req.errorMessage?.includes('PLATFORM INVARIANT 1'));
  assert.ok(req.errorMessage?.includes('Read-Only'));
});

test('UDS Composer: Platform Invariant 1 strictly blocks ECUReset (0x11)', () => {
  const req = composeUdsRequest(0x11, 0x01);
  assert.equal(req.valid, false);
  assert.equal(req.isAllowed, false);
  assert.ok(req.errorMessage?.includes('PLATFORM INVARIANT 1'));
});

test('UDS ISO-TP Ladder: Multi-frame VIN (0xF190) creates 5-step protocol exchange', () => {
  const req = composeUdsRequest(0x22, undefined, [0xF1, 0x90]);
  const ladder = generateIsoTpLadderTrace(req, 'VIN');

  assert.equal(ladder.length, 5);

  // Step 1: Tester SF
  assert.equal(ladder[0].frameType, 'SF');
  assert.equal(ladder[0].direction, 'tester_to_ecu');

  // Step 2: ECU First Frame (FF)
  assert.equal(ladder[1].frameType, 'FF');
  assert.equal(ladder[1].direction, 'ecu_to_tester');
  assert.equal(ladder[1].totalBytes, 20);
  assert.equal(ladder[1].bytesReceived, 6);

  // Step 3: Tester Flow Control (FC)
  assert.equal(ladder[2].frameType, 'FC');
  assert.equal(ladder[2].direction, 'tester_to_ecu');

  // Step 4: ECU Consecutive Frame 1 (CF)
  assert.equal(ladder[3].frameType, 'CF');
  assert.equal(ladder[3].bytesReceived, 13);

  // Step 5: ECU Consecutive Frame 2 (CF) - Complete
  assert.equal(ladder[4].frameType, 'CF');
  assert.equal(ladder[4].bytesReceived, 20);
  assert.equal(ladder[4].isComplete, true);
});
