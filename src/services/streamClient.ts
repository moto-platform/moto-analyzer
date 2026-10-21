import { CanFrame, BusStats, DbcMessageDef } from '../types/can';
import { decodeFrameSignals } from './dbcParser';

export interface WebSocketStreamOptions {
  url: string;
  onFrame: (frame: CanFrame) => void;
  onStats?: (stats: Partial<BusStats>) => void;
  onStatusChange?: (status: 'connected' | 'connecting' | 'disconnected' | 'error') => void;
  dbcMessages: DbcMessageDef[];
}

export class WebSocketStreamClient {
  private ws: WebSocket | null = null;
  private options: WebSocketStreamOptions;
  private reconnectTimeoutId: any = null;
  private shouldReconnect: boolean = true;
  private lastTimeMs: number = 0;

  constructor(options: WebSocketStreamOptions) {
    this.options = options;
  }

  public connect() {
    this.shouldReconnect = true;
    this.cleanup();

    if (this.options.onStatusChange) {
      this.options.onStatusChange('connecting');
    }

    try {
      this.ws = new WebSocket(this.options.url);

      this.ws.onopen = () => {
        if (this.options.onStatusChange) {
          this.options.onStatusChange('connected');
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleIncomingMessage(message);
        } catch (err) {
          console.warn('Failed to parse incoming WebSocket JSON:', err);
        }
      };

      this.ws.onclose = () => {
        if (this.options.onStatusChange) {
          this.options.onStatusChange('disconnected');
        }
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket stream error:', err);
        if (this.options.onStatusChange) {
          this.options.onStatusChange('error');
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.shouldReconnect = false;
    this.cleanup();
    if (this.options.onStatusChange) {
      this.options.onStatusChange('disconnected');
    }
  }

  private cleanup() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimeoutId && this.shouldReconnect) {
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectTimeoutId = null;
        this.connect();
      }, 3000);
    }
  }

  private handleIncomingMessage(msg: any) {
    // 1. Single frame format
    if (msg.id !== undefined && msg.data !== undefined) {
      this.emitFrame(msg);
      return;
    }

    // 2. Batch format (StreamBatchDto)
    if (msg.frames && Array.isArray(msg.frames)) {
      for (const f of msg.frames) {
        this.emitFrame(f);
      }
    }

    // 3. Stats update
    if (msg.stats && this.options.onStats) {
      this.options.onStats(msg.stats);
    }
  }

  private emitFrame(raw: any) {
    const id = typeof raw.id === 'string' ? parseInt(raw.id.replace('0x', ''), 16) : raw.id;
    const dataBytes = Array.isArray(raw.data) ? raw.data : [];
    const now = performance.now();
    const deltaMs = this.lastTimeMs > 0 ? Number((now - this.lastTimeMs).toFixed(2)) : 20.0;
    this.lastTimeMs = now;

    const messageDef = this.options.dbcMessages.find((m) => m.id === id);
    const decodedSignals = decodeFrameSignals(dataBytes, messageDef);

    const frame: CanFrame = {
      id,
      idHex: `0x${id.toString(16).toUpperCase().padStart(id > 0x7FF ? 8 : 3, '0')}`,
      bus: raw.bus || 'can0',
      dlc: dataBytes.length,
      data: dataBytes,
      timestamp: raw.timestamp || Number((now / 1000).toFixed(4)),
      deltaMs: raw.delta_ms || deltaMs,
      isExtended: id > 0x7FF,
      periodMs: deltaMs,
      frequencyHz: deltaMs > 0 ? Number((1000 / deltaMs).toFixed(1)) : 50.0,
      count: 1,
      name: messageDef ? messageDef.name : raw.name,
      decodedSignals,
    };

    this.options.onFrame(frame);
  }
}
