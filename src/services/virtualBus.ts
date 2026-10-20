import { CanFrame } from '../types/can';
import { DEFAULT_MOTO_MESSAGES, decodeFrameSignals } from './dbcParser';

export class VirtualCanBus {
  private isRunning: boolean = false;
  private intervalId: number | null = null;
  private onFrameCallback: ((frame: CanFrame) => void) | null = null;

  // Simulation physics state
  private timeSec: number = 0;
  private rpm: number = 1800;
  private speedKmh: number = 0;
  private throttlePct: number = 20;
  private gear: number = 1;
  private leanAngleDeg: number = 0;
  private coolantTempC: number = 75;
  private aliveCounter: number = 0;
  private lastFrameTimes: Map<number, number> = new Map();

  constructor() {}

  public start(callback: (frame: CanFrame) => void) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.onFrameCallback = callback;

    // 50 Hz simulation loop (every 20 ms)
    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 20);
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  private tick() {
    if (!this.onFrameCallback) return;
    this.timeSec += 0.02;

    // Simulate motorcycle dynamics
    // Acceleration cycle: Rev up, shift gears 1 -> 6, then brake
    const cycleTime = this.timeSec % 30; // 30 second riding loop

    if (cycleTime < 18) {
      // Acceleration & Cruise
      this.throttlePct = Math.min(85, 20 + cycleTime * 3.5);
      this.gear = Math.min(6, Math.floor(1 + cycleTime / 3));
      this.speedKmh = Math.min(142, cycleTime * 7.8);
      this.rpm = 2000 + (this.speedKmh * 65 / this.gear) % 7500;
      // Gentle cornering weave
      this.leanAngleDeg = Math.sin(this.timeSec * 0.8) * 36;
    } else {
      // Braking & Deceleration
      this.throttlePct = 5;
      this.speedKmh = Math.max(0, this.speedKmh - 6.2);
      this.gear = Math.max(1, Math.floor(this.speedKmh / 20));
      this.rpm = Math.max(1300, this.speedKmh * 45);
      this.leanAngleDeg = Math.sin(this.timeSec * 0.4) * 8;
    }

    // Engine warming up
    this.coolantTempC = Math.min(89, 75 + Math.floor(this.timeSec * 0.1));
    this.aliveCounter = (this.aliveCounter + 1) % 256;

    const now = performance.now();

    // 1. Frame 0x020 (Engine & Vehicle Speed) - Sent at 50 Hz
    this.emitFrame(0x020, this.packEngineStatus(), now);

    // 2. Frame 0x021 (IMU Dynamics) - Sent at 50 Hz
    this.emitFrame(0x021, this.packImuDynamics(), now);

    // 3. Frame 0x110 (Wheel Speeds) - Sent at 25 Hz (every other tick)
    if (Math.floor(this.timeSec * 50) % 2 === 0) {
      this.emitFrame(0x110, this.packWheelSpeeds(), now);
    }

    // 4. Frame 0x081 & 0x082 (Heartbeats) - Sent at 10 Hz
    if (Math.floor(this.timeSec * 50) % 5 === 0) {
      this.emitFrame(0x081, [this.aliveCounter, 0x03, 0x00, 0x00], now);
      this.emitFrame(0x082, [this.aliveCounter, 0x01, 0x00, 0x00], now);
    }
  }

  private emitFrame(id: number, data: number[], now: number) {
    const lastTime = this.lastFrameTimes.get(id) || now;
    const deltaMs = Number((now - lastTime).toFixed(2));
    this.lastFrameTimes.set(id, now);

    const messageDef = DEFAULT_MOTO_MESSAGES.find((m) => m.id === id);
    const decoded = decodeFrameSignals(data, messageDef);

    const frame: CanFrame = {
      id,
      idHex: `0x${id.toString(16).toUpperCase().padStart(3, '0')}`,
      bus: 'can0',
      dlc: data.length,
      data,
      timestamp: Number((this.timeSec).toFixed(3)),
      deltaMs: deltaMs > 0 ? deltaMs : 20.0,
      isExtended: id > 0x7FF,
      periodMs: deltaMs > 0 ? deltaMs : 20.0,
      frequencyHz: deltaMs > 0 ? Number((1000 / deltaMs).toFixed(1)) : 50.0,
      count: 1,
      name: messageDef ? messageDef.name : `UNKNOWN_0x${id.toString(16).toUpperCase()}`,
      decodedSignals: decoded,
    };

    if (this.onFrameCallback) {
      this.onFrameCallback(frame);
    }
  }

  private packEngineStatus(): number[] {
    // RPM: 0.25 rpm per bit -> raw = rpm / 0.25 = rpm * 4
    const rawRpm = Math.floor(this.rpm * 4);
    // Speed: 0.01 km/h per bit -> raw = speed / 0.01 = speed * 100
    const rawSpeed = Math.floor(this.speedKmh * 100);
    // Throttle: 0.39215 % -> raw = throttle / 0.39215
    const rawThrottle = Math.floor(this.throttlePct * 2.55);
    // Coolant: offset -40 -> raw = temp + 40
    const rawCoolant = Math.floor(this.coolantTempC + 40);

    return [
      rawRpm & 0xFF,
      (rawRpm >> 8) & 0xFF,
      rawSpeed & 0xFF,
      (rawSpeed >> 8) & 0xFF,
      rawThrottle & 0xFF,
      (this.gear & 0x0F),
      rawCoolant & 0xFF,
      0x00, // Status flags
    ];
  }

  private packImuDynamics(): number[] {
    // Lean angle: 0.01 deg factor signed 16-bit
    let rawLean = Math.floor(this.leanAngleDeg * 100);
    if (rawLean < 0) rawLean = (0x10000 + rawLean) & 0xFFFF;

    // Roll rate
    const rollRate = Math.cos(this.timeSec * 0.8) * 45;
    let rawRoll = Math.floor(rollRate * 50);
    if (rawRoll < 0) rawRoll = (0x10000 + rawRoll) & 0xFFFF;

    // Lateral Accel: 0.001 g factor
    const latAccel = Math.sin(this.leanAngleDeg * Math.PI / 180) * 1.1;
    let rawAccel = Math.floor(latAccel * 1000);
    if (rawAccel < 0) rawAccel = (0x10000 + rawAccel) & 0xFFFF;

    return [
      rawLean & 0xFF,
      (rawLean >> 8) & 0xFF,
      rawRoll & 0xFF,
      (rawRoll >> 8) & 0xFF,
      0x00,
      0x00,
      rawAccel & 0xFF,
      (rawAccel >> 8) & 0xFF,
    ];
  }

  private packWheelSpeeds(): number[] {
    const rawFront = Math.floor(this.speedKmh * 100);
    // Slight rear wheel slip during acceleration
    const rearSpeed = this.throttlePct > 50 ? this.speedKmh * 1.02 : this.speedKmh;
    const rawRear = Math.floor(rearSpeed * 100);
    const brakeActive = this.throttlePct <= 5 && this.speedKmh > 10 ? 1 : 0;

    return [
      rawFront & 0xFF,
      (rawFront >> 8) & 0xFF,
      rawRear & 0xFF,
      (rawRear >> 8) & 0xFF,
      brakeActive ? 0x03 : 0x00, // Front + rear brake active
      0x00,
      0x00,
      0x00,
    ];
  }
}
