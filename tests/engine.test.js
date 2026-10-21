import test from 'node:test';
import assert from 'node:assert/strict';

// Test ISO-TP Logic directly
test('ISO-TP Single Frame (SF) parsing', () => {
  // PCI: 0x07 (Type 0, Length 7), followed by 7 bytes: 0x62 0xF1 0x90 ...
  const sfData = [0x07, 0x62, 0xF1, 0x90, 0x4A, 0x48, 0x32, 0x4D];
  const pciByte = sfData[0];
  const type = (pciByte >> 4) & 0x0F;
  const len = pciByte & 0x0F;

  assert.equal(type, 0); // Single Frame
  assert.equal(len, 7);
  const payload = sfData.slice(1, 1 + len);
  assert.equal(payload.length, 7);
  assert.equal(payload[0], 0x62); // Positive Response ReadDataByIdentifier
});

test('ISO-TP Multi-Frame (FF + CF) reassembly', () => {
  // First Frame: 0x10, 0x11 (Length = 17 bytes) + 6 data bytes
  const ff = [0x10, 0x11, 0x62, 0xF1, 0x90, 0x4A, 0x48, 0x32];
  const ffLength = ((ff[0] & 0x0F) << 8) | ff[1];
  assert.equal(ffLength, 17);

  const buffer = [...ff.slice(2)];
  assert.equal(buffer.length, 6);

  // Consecutive Frame 1: 0x21 (Seq 1) + 7 data bytes
  const cf1 = [0x21, 0x4D, 0x43, 0x35, 0x34, 0x31, 0x30, 0x30];
  buffer.push(...cf1.slice(1));
  assert.equal(buffer.length, 13);

  // Consecutive Frame 2: 0x22 (Seq 2) + 4 remaining bytes
  const cf2 = [0x22, 0x30, 0x30, 0x31, 0x32, 0xAA, 0xAA, 0xAA];
  const remainingNeeded = ffLength - buffer.length;
  buffer.push(...cf2.slice(1, 1 + remainingNeeded));

  assert.equal(buffer.length, 17);
  assert.equal(buffer[0], 0x62); // Service
  assert.equal(buffer[1], 0xF1); // DID MSB
  assert.equal(buffer[2], 0x90); // DID LSB (VIN)
});

test('Little-Endian CAN Signal Extraction (EngineSpeed RPM)', () => {
  // 0.25 rpm/bit, 16-bit at bit 0
  // Suppose RPM = 4000 rpm -> raw = 4000 * 4 = 16000 = 0x3E80
  // Byte 0: 0x80, Byte 1: 0x3E
  const data = [0x80, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const rawRpm = data[0] | (data[1] << 8);
  assert.equal(rawRpm, 16000);
  const physicalRpm = rawRpm * 0.25;
  assert.equal(physicalRpm, 4000);
});

test('Signed 16-bit Lean Angle Extraction', () => {
  // Factor 0.01 deg, signed 16-bit at bit 0
  // Suppose Lean Angle = -35.25 deg -> raw = -3525
  // -3525 in two's complement 16-bit = 65536 - 3525 = 62011 = 0xF23B
  // Byte 0: 0x3B, Byte 1: 0xF2
  const data = [0x3B, 0xF2];
  let raw = data[0] | (data[1] << 8);
  if (raw & 0x8000) {
    raw = raw - 0x10000;
  }
  assert.equal(raw, -3525);
  const physicalAngle = raw * 0.01;
  assert.equal(physicalAngle, -35.25);
});
