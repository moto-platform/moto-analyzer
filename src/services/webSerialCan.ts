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
  private lastTimeMs: number = 0;

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

      this.isReading = true;
      this.readLoop();

      return true;
    } catch (err: any) {
      this.disconnect();
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    this.isReading = false;
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.port) {
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
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
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
      this.parseSlcanLine(trimmed);
    }
  }

  /**
   * Parses standard SLCAN frames:
   * t<id:3hex><dlc:1dec><data:2*dlchex>  e.g. t02080102030405060708
   * T<id:8hex><dlc:1dec><data:2*dlchex>  e.g. T18DAF11080102030405060708
   */
  private parseSlcanLine(line: string) {
    const isStd = line.startsWith('t');
    const isExt = line.startsWith('T');

    if (!isStd && !isExt) return;

    try {
      let id = 0;
      let dlc = 0;
      let dataHex = '';

      if (isStd) {
        id = parseInt(line.substring(1, 4), 16);
        dlc = parseInt(line.substring(4, 5), 10);
        dataHex = line.substring(5, 5 + dlc * 2);
      } else {
        id = parseInt(line.substring(1, 9), 16);
        dlc = parseInt(line.substring(9, 10), 10);
        dataHex = line.substring(10, 10 + dlc * 2);
      }

      if (isNaN(id) || isNaN(dlc)) return;

      const dataBytes: number[] = [];
      for (let i = 0; i < dataHex.length; i += 2) {
        dataBytes.push(parseInt(dataHex.substr(i, 2), 16));
      }

      const now = performance.now();
      const deltaMs = this.lastTimeMs > 0 ? Number((now - this.lastTimeMs).toFixed(2)) : 20.0;
      this.lastTimeMs = now;

      const messageDef = this.dbcMessages.find((m) => m.id === id);
      const decodedSignals = decodeFrameSignals(dataBytes, messageDef);

      const frame: CanFrame = {
        id,
        idHex: `0x${id.toString(16).toUpperCase().padStart(isExt ? 8 : 3, '0')}`,
        bus: 'usb-can0',
        dlc,
        data: dataBytes,
        timestamp: Number((now / 1000).toFixed(4)),
        deltaMs,
        isExtended: isExt,
        periodMs: deltaMs,
        frequencyHz: deltaMs > 0 ? Number((1000 / deltaMs).toFixed(1)) : 50.0,
        count: 1,
        name: messageDef ? messageDef.name : undefined,
        decodedSignals,
      };

      if (this.onFrameCallback) {
        this.onFrameCallback(frame);
      }
    } catch (err) {
      console.warn('Failed to parse SLCAN line:', line, err);
    }
  }
}
