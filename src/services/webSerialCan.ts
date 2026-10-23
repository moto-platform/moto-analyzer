import { CanFrame, DbcMessageDef } from '../types/can';
import { decodeFrameSignals } from './dbcParser';

/**
 * WebSerial CAN Adapter supporting standard SLCAN (Lawicel ASCII protocol)
 * Compatible with CANable, Candlelight, USB-to-CAN, ESP32 USB-CDC, and ST-Link VCP bridges.
 */
export class WebSerialCanAdapter {
  private port: any = null;
  private reader: any = null;
  private isReading: boolean = false;
  private onFrameCallback: ((frame: CanFrame) => void) | null = null;
  private buffer: string = '';
  private dbcMessages: DbcMessageDef[] = [];
  private readableStreamClosed: Promise<void> | null = null;

  constructor(dbcMessages: DbcMessageDef[]) {
    this.dbcMessages = dbcMessages;
  }

  public updateDbc(dbcMessages: DbcMessageDef[]) {
    this.dbcMessages = dbcMessages;
  }

  public isSupported(): boolean {
    return 'serial' in navigator;
  }

  public isConnected(): boolean {
    return this.port !== null && this.isReading;
  }

  public async connect(
    baudRate: number = 115200,
    onFrame: (frame: CanFrame) => void
  ): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('WebSerial API is not supported in this browser. Please use Chrome, Edge, or Brave.');
    }

    try {
      this.onFrameCallback = onFrame;
      // Request serial port from user prompt
      // @ts-ignore
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate });

      // Invariant 1: on the vehicle bus the analyzer only listens. Open the SLCAN
      // channel in listen-only mode (`L`), never in normal mode (`O`), so the adapter
      // neither transmits nor acknowledges frames. `C` first closes a channel an
      // earlier session may have left open; `S6` selects 500 kbit/s (D-009, D-019).
      await this.sendCommands(['C', 'S6', 'L']);

      this.isReading = true;
      this.readLoop();

      return true;
    } catch (err: any) {
      this.disconnect();
      throw err;
    }
  }

  private async sendCommands(commands: string[]): Promise<void> {
    if (!this.port?.writable) return;
    const writer = this.port.writable.getWriter();
    try {
      const enc = new TextEncoder();
      for (const cmd of commands) {
        await writer.write(enc.encode(cmd + '\r'));
      }
    } finally {
      writer.releaseLock();
    }
  }

  public async disconnect(): Promise<void> {
    this.isReading = false;
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.readableStreamClosed) {
        await this.readableStreamClosed.catch(() => undefined);
        this.readableStreamClosed = null;
      }
      if (this.port) {
        await this.sendCommands(['C']).catch(() => undefined);
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn('Error during serial port disconnect:', err);
    }
  }

  private async readLoop() {
    const textDecoder = new TextDecoderStream();
    // @ts-ignore
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.processIncomingChunk(value);
        }
      }
    } catch (err) {
      console.error('Serial read error:', err);
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
      }
    }
  }

  private processIncomingChunk(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split('\r');
    this.buffer = lines.pop() || ''; // Keep unfinished line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const frame = parseSlcanLine(trimmed, this.dbcMessages);
      if (frame && this.onFrameCallback) this.onFrameCallback(frame);
    }
  }
}

/**
 * Parses one SLCAN (Lawicel) receive line:
 *   t<id:3 hex><dlc:1><data:2*dlc hex>[ts:4 hex]   e.g. t0208112233445566778
 *   T<id:8 hex><dlc:1><data:2*dlc hex>[ts:4 hex]
 * Remote frames (r/R), status replies and anything malformed return null.
 * Timing (delta, period, frequency) is filled in by the capture pipeline.
 */
export function parseSlcanLine(line: string, dbcMessages: DbcMessageDef[]): CanFrame | null {
  const isStd = line.startsWith('t');
  const isExt = line.startsWith('T');
  if (!isStd && !isExt) return null;

  const idLen = isStd ? 3 : 8;
  const idStr = line.substring(1, 1 + idLen);
  const dlcStr = line.substring(1 + idLen, 2 + idLen);
  if (!/^[0-9A-Fa-f]+$/.test(idStr) || idStr.length !== idLen || !/^[0-8]$/.test(dlcStr)) return null;

  const id = parseInt(idStr, 16);
  const dlc = parseInt(dlcStr, 10);
  const dataHex = line.substring(2 + idLen, 2 + idLen + dlc * 2);
  if (dataHex.length !== dlc * 2 || (dlc > 0 && !/^[0-9A-Fa-f]+$/.test(dataHex))) return null;
  if (isStd && id > 0x7ff) return null;

  const data: number[] = [];
  for (let i = 0; i < dataHex.length; i += 2) data.push(parseInt(dataHex.substring(i, i + 2), 16));

  const messageDef = dbcMessages.find((m) => m.id === id);
  const now = performance.now();
  return {
    id,
    idHex: `0x${id.toString(16).toUpperCase().padStart(idLen, '0')}`,
    bus: 'usb-can0',
    dlc,
    data,
    timestamp: now / 1000,
    deltaMs: 0,
    isExtended: isExt,
    periodMs: 0,
    frequencyHz: 0,
    count: 1,
    name: messageDef?.name,
    decodedSignals: decodeFrameSignals(data, messageDef),
  };
}

