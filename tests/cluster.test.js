import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTachometerAngle,
  getRpmStatus,
  formatGearDisplay,
  calculateWheelSlip,
} from '../src/services/clusterCalculations.ts';

test('Cluster: calculateTachometerAngle maps 0-10000 RPM across 270 deg sweep', () => {
  assert.equal(calculateTachometerAngle(0), 135);
  assert.equal(calculateTachometerAngle(5000), 135 + 135); // 270
  assert.equal(calculateTachometerAngle(10000), 405);
  assert.equal(calculateTachometerAngle(12000), 405); // clamped
});

test('Cluster: getRpmStatus detects normal, warning, and redline states', () => {
  const normal = getRpmStatus(4500);
  assert.equal(normal.isRedline, false);
  assert.equal(normal.isWarning, false);
  assert.equal(normal.colorHex, '#06b6d4');

  const warning = getRpmStatus(7200);
  assert.equal(warning.isRedline, false);
  assert.equal(warning.isWarning, true);
  assert.equal(warning.colorHex, '#f59e0b');

  const redline = getRpmStatus(9200);
  assert.equal(redline.isRedline, true);
  assert.equal(redline.colorHex, '#ef4444');
});

test('Cluster: formatGearDisplay correctly returns Neutral or Gear number', () => {
  assert.deepEqual(formatGearDisplay(0), { label: 'N', isNeutral: true });
  assert.deepEqual(formatGearDisplay(1), { label: '1', isNeutral: false });
  assert.deepEqual(formatGearDisplay(4), { label: '4', isNeutral: false });
});

test('Cluster: calculateWheelSlip computes slip differential', () => {
  const lowSlip = calculateWheelSlip(60.2, 59.8);
  assert.equal(lowSlip.slipKmh, 0.4);
  assert.equal(lowSlip.hasSignificantSlip, false);

  const highSlip = calculateWheelSlip(68.0, 58.0);
  assert.equal(highSlip.slipKmh, 10.0);
  assert.equal(highSlip.hasSignificantSlip, true);
});
