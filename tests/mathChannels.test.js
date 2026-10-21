import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMathChannel,
  exportOscilloscopeCsv,
  DEFAULT_MATH_CHANNELS
} from '../src/services/mathChannels.ts';

test('Math Channel: Wheel Slip calculates absolute differential speed', () => {
  const wheelSlipDef = DEFAULT_MATH_CHANNELS.find((m) => m.type === 'wheel_slip');
  assert.ok(wheelSlipDef, 'Wheel slip channel definition should exist');

  const history = new Map();
  history.set('FrontWheelSpeed', [
    { time: 1.0, value: 50.0 },
    { time: 2.0, value: 52.0 },
    { time: 3.0, value: 60.0 },
  ]);
  history.set('RearWheelSpeed', [
    { time: 1.0, value: 50.0 },
    { time: 2.0, value: 50.0 },
    { time: 3.0, value: 54.0 },
  ]);

  const result = computeMathChannel(wheelSlipDef, history);
  assert.equal(result.length, 3);
  assert.equal(result[0].value, 0.0); // |50 - 50|
  assert.equal(result[1].value, 2.0); // |52 - 50|
  assert.equal(result[2].value, 6.0); // |60 - 54|
});

test('Math Channel: Lean Velocity calculates numerical derivative dθ/dt', () => {
  const leanVelDef = DEFAULT_MATH_CHANNELS.find((m) => m.type === 'lean_velocity');
  assert.ok(leanVelDef, 'Lean velocity channel definition should exist');

  const history = new Map();
  history.set('LeanAngle', [
    { time: 10.0, value: 0.0 },
    { time: 10.1, value: 2.0 },  // dt = 0.1, dVal = 2.0 => rate = 20.0 deg/s
    { time: 10.2, value: 5.0 },  // dt = 0.1, dVal = 3.0 => rate = 30.0 deg/s
  ]);

  const result = computeMathChannel(leanVelDef, history);
  assert.equal(result.length, 2);
  assert.equal(result[0].value, 20.0);
  assert.equal(result[1].value, 30.0);
});

test('Math Channel: Power Demand Index computes scaled product', () => {
  const powerDef = DEFAULT_MATH_CHANNELS.find((m) => m.type === 'power_index');
  assert.ok(powerDef, 'Power demand index channel definition should exist');

  const history = new Map();
  history.set('EngineSpeed', [
    { time: 5.0, value: 5000 },
  ]);
  history.set('ThrottlePosition', [
    { time: 5.0, value: 80 },
  ]);

  const result = computeMathChannel(powerDef, history);
  assert.equal(result.length, 1);
  // (5000 * 80) * 0.001 = 400
  assert.equal(result[0].value, 400);
});

test('Oscilloscope CSV Exporter formats valid aligned CSV', () => {
  const channels = [
    {
      name: 'EngineSpeed',
      label: 'Engine RPM',
      unit: 'rpm',
      data: [
        { time: 1.0, value: 3000 },
        { time: 2.0, value: 3500 },
      ],
    },
    {
      name: 'VehicleSpeed',
      label: 'Vehicle Speed',
      unit: 'km/h',
      data: [
        { time: 1.0, value: 45 },
        { time: 2.5, value: 55 },
      ],
    },
  ];

  const csv = exportOscilloscopeCsv(channels);
  assert.ok(csv.includes('Time_s,"Engine RPM (rpm)","Vehicle Speed (km/h)"'));
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 4); // Header + 3 timestamps (1.000, 2.000, 2.500)
  assert.equal(lines[1], '1.000,3000,45');
  assert.equal(lines[2], '2.000,3500,45'); // 45 held from previous
  assert.equal(lines[3], '2.500,3500,55'); // 3500 held from previous
});
