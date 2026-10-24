import { CanFrame, BusStats } from '../types/can';

export type StreamStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | 'rejected';

/** Server heartbeat of /ws/live: which producer feeds the stream and how many batches this client lost. */
export interface StreamHeartbeat {
  source: string;
  dropped: number;
}

/** moto-server close codes of /ws/live: bad hello or token, and no token configured. Not retried. */
const CLOSE_REJECTED = new Set([1008, 1011]);

export interface WebSocketStreamOptions {
  url: string;
  /** MOTO_API_TOKEN, sent in the first (hello) message, never in the URL. */
  token: string;
  onFrame: (frame: CanFrame) => void;
  onStats?: (stats: Partial<BusStats>) => void;
  onHeartbeat?: (heartbeat: StreamHeartbeat) => void;
  onStatusChange?: (status: StreamStatus) => void;
}

export class WebSocketStreamClient {
  private ws: WebSocket | null = null;
  private options: WebSocketStreamOptions;
  private reconnectTimeoutId: any = null;
  private shouldReconnect: boolean = true;

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
        this.ws?.send(JSON.stringify({ type: 'hello', token: this.options.token }));
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

      this.ws.onclose = (event) => {
        if (CLOSE_REJECTED.has(event.code)) {
          // Wrong token or a server without one: retrying would only repeat the refusal.
          this.shouldReconnect = false;
          if (this.options.onStatusChange) this.options.onStatusChange('rejected');
          return;
        }
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

  private handleIncomingMessage(msg: unknown) {
    const parsed = parseStreamMessage(msg);
    parsed.frames.forEach((f) => this.options.onFrame(f));
    if (parsed.stats && this.options.onStats) this.options.onStats(parsed.stats);
    if (parsed.heartbeat && this.options.onHeartbeat) this.options.onHeartbeat(parsed.heartbeat);
  }
}

/** moto-server channel index (CanFrameDto.channel): 1 = vehicle bus, 2 = platform bus. */
export function channelToBus(channel: unknown): string {
  if (channel === 1) return 'vehicle';
  if (channel === 2) return 'platform';
  return typeof channel === 'number' ? `can${channel}` : 'can0';
}

function hexToBytes(hex: string): number[] | null {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0 || (clean.length > 0 && !/^[0-9a-fA-F]+$/.test(clean))) return null;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.substring(i, i + 2), 16));
  return out;
}

/** Converts one moto-server CanFrameDto (schemas/stream.py) into a CanFrame. */
export function frameFromDto(raw: any): CanFrame | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'number') return null;
  const data = typeof raw.data_hex === 'string' ? hexToBytes(raw.data_hex) : null;
  if (!data) return null;
  const id: number = raw.id;
  const isExtended = raw.is_extended === true;
  const bus = channelToBus(raw.channel);
  return {
    id,
    idHex: `0x${id.toString(16).toUpperCase().padStart(isExtended ? 8 : 3, '0')}`,
    bus,
    dlc: typeof raw.dlc === 'number' ? raw.dlc : data.length,
    data,
    timestamp: typeof raw.timestamp_us === 'number' ? raw.timestamp_us / 1e6 : performance.now() / 1000,
    deltaMs: 0,
    isExtended,
    periodMs: 0,
    frequencyHz: 0,
    count: 1,
  };
}

function statsFromDto(raw: any): Partial<BusStats> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<BusStats> = {};
  if (typeof raw.bus_load_pct === 'number') out.busLoadPct = raw.bus_load_pct;
  if (typeof raw.frame_rate_hz === 'number') out.msgPerSec = raw.frame_rate_hz;
  if (typeof raw.error_frames === 'number') out.errorFrames = raw.error_frames;
  return out;
}

/**
 * Parses one WebSocket message of the moto-server stream protocol: a StreamMessageDto
 * envelope ({type, payload}) carrying a frame, a batch, stats or a heartbeat. A bare StreamBatchDto
 * or CanFrameDto is accepted too. Unknown or malformed content yields nothing.
 */
export function parseStreamMessage(msg: unknown): { frames: CanFrame[]; stats?: Partial<BusStats>; heartbeat?: StreamHeartbeat } {
  const result: { frames: CanFrame[]; stats?: Partial<BusStats>; heartbeat?: StreamHeartbeat } = { frames: [] };
  if (!msg || typeof msg !== 'object') return result;
  const m: any = msg;

  const handleBatch = (batch: any) => {
    if (Array.isArray(batch?.frames)) {
      for (const f of batch.frames) {
        const frame = frameFromDto(f);
        if (frame) result.frames.push(frame);
      }
    }
    if (batch?.stats) result.stats = statsFromDto(batch.stats);
  };

  if (typeof m.type === 'string' && 'payload' in m) {
    if (m.type === 'frame') {
      const frame = frameFromDto(m.payload);
      if (frame) result.frames.push(frame);
    } else if (m.type === 'batch') {
      handleBatch(m.payload);
    } else if (m.type === 'stats') {
      result.stats = statsFromDto(m.payload);
    } else if (m.type === 'heartbeat' && typeof m.payload?.source === 'string') {
      result.heartbeat = { source: m.payload.source, dropped: typeof m.payload.dropped === 'number' ? m.payload.dropped : 0 };
    }
    return result;
  }

  if (Array.isArray(m.frames)) {
    handleBatch(m);
    return result;
  }

  const frame = frameFromDto(m);
  if (frame) result.frames.push(frame);
  return result;
}
