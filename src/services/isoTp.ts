export type IsoTpFrameType = 'SF' | 'FF' | 'CF' | 'FC' | 'UNKNOWN';

export interface IsoTpMessage {
  id: number;
  totalLength: number;
  receivedBytes: number[];
  isComplete: boolean;
  expectedSequence: number;
  startTime: number;
}

export class IsoTpReassembler {
  private activeTransfers: Map<number, IsoTpMessage> = new Map();
  private onMessageCompleteCallback: ((id: number, payload: number[]) => void) | null = null;

  constructor(onComplete?: (id: number, payload: number[]) => void) {
    if (onComplete) {
      this.onMessageCompleteCallback = onComplete;
    }
  }

  public onComplete(callback: (id: number, payload: number[]) => void) {
    this.onMessageCompleteCallback = callback;
  }

  /**
   * Processes a CAN diagnostic frame (ISO 15765-2 PCI byte parsing)
   */
  public processFrame(id: number, data: number[]): {
    type: IsoTpFrameType;
    isComplete: boolean;
    reassembledPayload?: number[];
  } {
    if (data.length < 1) {
      return { type: 'UNKNOWN', isComplete: false };
    }

    const pciByte = data[0];
    const frameTypeNibble = (pciByte >> 4) & 0x0F;

    // 0: Single Frame (SF)
    if (frameTypeNibble === 0) {
      const length = pciByte & 0x0F;
      const payload = data.slice(1, 1 + length);
      if (this.onMessageCompleteCallback) {
        this.onMessageCompleteCallback(id, payload);
      }
      return { type: 'SF', isComplete: true, reassembledPayload: payload };
    }

    // 1: First Frame (FF)
    if (frameTypeNibble === 1) {
      if (data.length < 2) return { type: 'UNKNOWN', isComplete: false };
      const totalLength = ((pciByte & 0x0F) << 8) | data[1];
      const initialPayload = data.slice(2);

      this.activeTransfers.set(id, {
        id,
        totalLength,
        receivedBytes: initialPayload,
        isComplete: false,
        expectedSequence: 1,
        startTime: performance.now(),
      });

      return { type: 'FF', isComplete: false };
    }

    // 2: Consecutive Frame (CF)
    if (frameTypeNibble === 2) {
      const sequenceNumber = pciByte & 0x0F;
      const transfer = this.activeTransfers.get(id);

      if (!transfer) {
        return { type: 'CF', isComplete: false };
      }

      // Check sequence number
      if (sequenceNumber !== (transfer.expectedSequence & 0x0F)) {
        console.warn(`ISO-TP Sequence error for ID 0x${id.toString(16)}: expected ${transfer.expectedSequence & 0x0F}, got ${sequenceNumber}`);
      }

      transfer.expectedSequence = (transfer.expectedSequence + 1) % 16;
      const remainingBytesNeeded = transfer.totalLength - transfer.receivedBytes.length;
      const bytesToTake = Math.min(data.length - 1, remainingBytesNeeded);
      const newBytes = data.slice(1, 1 + bytesToTake);

      transfer.receivedBytes.push(...newBytes);

      if (transfer.receivedBytes.length >= transfer.totalLength) {
        transfer.isComplete = true;
        const finalPayload = transfer.receivedBytes.slice(0, transfer.totalLength);
        this.activeTransfers.delete(id);

        if (this.onMessageCompleteCallback) {
          this.onMessageCompleteCallback(id, finalPayload);
        }

        return { type: 'CF', isComplete: true, reassembledPayload: finalPayload };
      }

      return { type: 'CF', isComplete: false };
    }

    // 3: Flow Control (FC)
    if (frameTypeNibble === 3) {
      return { type: 'FC', isComplete: false };
    }

    return { type: 'UNKNOWN', isComplete: false };
  }

  public reset() {
    this.activeTransfers.clear();
  }
}
