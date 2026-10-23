export type IsoTpFrameType = 'SF' | 'FF' | 'CF' | 'FC' | 'UNKNOWN';

export interface IsoTpMessage {
  id: number;
  totalLength: number;
  receivedBytes: number[];
  isComplete: boolean;
  expectedSequence: number;
  lastFrameTimeMs: number;
}

export interface IsoTpResult {
  type: IsoTpFrameType;
  isComplete: boolean;
  reassembledPayload?: number[];
  /** Set when a reception in progress was dropped (sequence skip, N_Cr timeout, bad length). */
  aborted?: string;
}

/** ISO 15765-2 N_Cr: maximum time between two Consecutive Frames of one reception. */
export const ISO_TP_N_CR_MS = 1000;

/**
 * Passive ISO 15765-2 reassembler (classic CAN, normal addressing, 8-byte frames).
 * One reception per CAN ID. A Consecutive Frame whose sequence number skips aborts the
 * reception, as does a gap longer than N_Cr; a new First Frame replaces an unfinished one.
 */
export class IsoTpReassembler {
  private activeTransfers: Map<number, IsoTpMessage> = new Map();
  private onMessageCompleteCallback: ((id: number, payload: number[]) => void) | null = null;
  private readonly nCrMs: number;

  constructor(onComplete?: (id: number, payload: number[]) => void, nCrMs: number = ISO_TP_N_CR_MS) {
    if (onComplete) this.onMessageCompleteCallback = onComplete;
    this.nCrMs = nCrMs;
  }

  public onComplete(callback: (id: number, payload: number[]) => void) {
    this.onMessageCompleteCallback = callback;
  }

  /**
   * Processes one CAN frame. `nowMs` is the frame's receive time in milliseconds
   * (log time on replay, so timeouts follow the recording, not the wall clock).
   */
  public processFrame(id: number, data: number[], nowMs: number = 0): IsoTpResult {
    if (data.length < 1) {
      return { type: 'UNKNOWN', isComplete: false };
    }

    const pciByte = data[0];
    const frameTypeNibble = (pciByte >> 4) & 0x0f;

    // 0: Single Frame
    if (frameTypeNibble === 0) {
      const length = pciByte & 0x0f;
      if (length === 0 || length > 7 || length > data.length - 1) {
        return { type: 'SF', isComplete: false, aborted: `invalid SF length ${length}` };
      }
      const payload = data.slice(1, 1 + length);
      this.onMessageCompleteCallback?.(id, payload);
      return { type: 'SF', isComplete: true, reassembledPayload: payload };
    }

    // 1: First Frame
    if (frameTypeNibble === 1) {
      if (data.length < 8) {
        return { type: 'FF', isComplete: false, aborted: 'FF shorter than 8 bytes' };
      }
      const totalLength = ((pciByte & 0x0f) << 8) | data[1];
      if (totalLength < 8) {
        return { type: 'FF', isComplete: false, aborted: `invalid FF_DL ${totalLength}` };
      }
      const replaced = this.activeTransfers.has(id);
      this.activeTransfers.set(id, {
        id,
        totalLength,
        receivedBytes: data.slice(2, 8),
        isComplete: false,
        expectedSequence: 1,
        lastFrameTimeMs: nowMs,
      });
      return replaced
        ? { type: 'FF', isComplete: false, aborted: 'unfinished reception replaced by a new FF' }
        : { type: 'FF', isComplete: false };
    }

    // 2: Consecutive Frame
    if (frameTypeNibble === 2) {
      const sequenceNumber = pciByte & 0x0f;
      const transfer = this.activeTransfers.get(id);
      if (!transfer) {
        return { type: 'CF', isComplete: false };
      }

      if (nowMs - transfer.lastFrameTimeMs > this.nCrMs) {
        this.activeTransfers.delete(id);
        return { type: 'CF', isComplete: false, aborted: 'N_Cr timeout' };
      }

      if (sequenceNumber !== (transfer.expectedSequence & 0x0f)) {
        this.activeTransfers.delete(id);
        return {
          type: 'CF',
          isComplete: false,
          aborted: `sequence error: expected ${transfer.expectedSequence & 0x0f}, got ${sequenceNumber}`,
        };
      }

      transfer.expectedSequence = (transfer.expectedSequence + 1) & 0x0f;
      transfer.lastFrameTimeMs = nowMs;
      const remaining = transfer.totalLength - transfer.receivedBytes.length;
      transfer.receivedBytes.push(...data.slice(1, 1 + Math.min(data.length - 1, remaining)));

      if (transfer.receivedBytes.length >= transfer.totalLength) {
        transfer.isComplete = true;
        const finalPayload = transfer.receivedBytes.slice(0, transfer.totalLength);
        this.activeTransfers.delete(id);
        this.onMessageCompleteCallback?.(id, finalPayload);
        return { type: 'CF', isComplete: true, reassembledPayload: finalPayload };
      }
      return { type: 'CF', isComplete: false };
    }

    // 3: Flow Control
    if (frameTypeNibble === 3) {
      return { type: 'FC', isComplete: false };
    }

    return { type: 'UNKNOWN', isComplete: false };
  }

  public reset() {
    this.activeTransfers.clear();
  }
}
