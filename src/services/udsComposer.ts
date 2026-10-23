/**
 * ISO 14229 UDS Request Composer & ISO 15765-2 Packet Ladder Engine
 *
 * Implements strict Platform Invariant 1 enforcement (The ECU is read-only)
 * and generates ISO-TP packet ladders for multi-frame diagnostics.
 */

export interface UdsServiceDef {
  sid: number;
  sidHex: string;
  name: string;
  isAllowed: boolean;
  subFunctions?: { id: number; name: string }[];
  /** Sub-functions the tester policy allows (bit 7, suppressPosRsp, is ignored). Unset = no sub-function. */
  allowedSubFunctions?: number[];
  description: string;
}

/** Tester (client) request ID and ECU (server) response ID, ISO 15765-4 normal fixed: 0x18DA<TA><SA>. */
export const UDS_REQUEST_ID = 0x18da10f1;
export const UDS_RESPONSE_ID = 0x18daf110;
const SUPPRESS_POS_RSP_BIT = 0x80;

export const UDS_SERVICES_CATALOG: UdsServiceDef[] = [
  {
    sid: 0x10,
    sidHex: '0x10',
    name: 'DiagnosticSessionControl',
    isAllowed: true,
    subFunctions: [
      { id: 0x01, name: '0x01 — DefaultSession' },
      { id: 0x03, name: '0x03 — ExtendedDiagnosticSession' },
    ],
    allowedSubFunctions: [0x01, 0x03],
    description: 'Enables default or extended diagnostic test modes',
  },
  {
    sid: 0x22,
    sidHex: '0x22',
    name: 'ReadDataByIdentifier',
    isAllowed: true,
    description: 'Reads data values from ECU memory referenced by 2-byte DID',
  },
  {
    sid: 0x19,
    sidHex: '0x19',
    name: 'ReadDTCInformation',
    isAllowed: true,
    subFunctions: [
      { id: 0x01, name: '0x01 — reportNumberOfDTCByStatusMask' },
      { id: 0x02, name: '0x02 — reportDTCByStatusMask' },
    ],
    allowedSubFunctions: [0x01, 0x02],
    description: 'Retrieves active and stored diagnostic trouble codes and status masks',
  },
  {
    sid: 0x3E,
    sidHex: '0x3E',
    name: 'TesterPresent',
    isAllowed: true,
    subFunctions: [{ id: 0x00, name: '0x00 — zeroSubFunction' }],
    allowedSubFunctions: [0x00],
    description: 'Maintains active diagnostic session without timeout',
  },
  // Disallowed services (Blocked by Invariant 1)
  {
    sid: 0x2E,
    sidHex: '0x2E',
    name: 'WriteDataByIdentifier',
    isAllowed: false,
    description: 'BLOCKED: The ECU is Read-Only. Memory modification is strictly prohibited.',
  },
  {
    sid: 0x14,
    sidHex: '0x14',
    name: 'ClearDiagnosticInformation',
    isAllowed: false,
    description: 'BLOCKED: DTC clearing is prohibited on vehicle bus by tester policy.',
  },
  {
    sid: 0x11,
    sidHex: '0x11',
    name: 'ECUReset',
    isAllowed: false,
    description: 'BLOCKED: Resetting vehicle ECU is prohibited during SDV operation.',
  },
  {
    sid: 0x31,
    sidHex: '0x31',
    name: 'RoutineControl',
    isAllowed: false,
    description: 'BLOCKED: Routine execution and actuation is prohibited.',
  },
];

export interface IsoTpLadderStep {
  stepIndex: number;
  timestamp: string;
  direction: 'tester_to_ecu' | 'ecu_to_tester';
  frameType: 'SF' | 'FF' | 'FC' | 'CF';
  canIdHex: string;
  dataHex: string;
  pciDesc: string;
  bytesReceived: number;
  totalBytes: number;
  isComplete: boolean;
}

export interface UdsComposedRequest {
  valid: boolean;
  isAllowed: boolean;
  errorMessage?: string;
  rawPayload: number[];
  canFrameData: number[];
  isoTpType: 'SF' | 'FF';
}

/**
 * Validates and compiles a UDS request into CAN ISO-TP bytes
 */
export function composeUdsRequest(
  sid: number,
  subFunction?: number,
  parameterBytes?: number[]
): UdsComposedRequest {
  const service = UDS_SERVICES_CATALOG.find((s) => s.sid === sid);

  if (!service) {
    return {
      valid: false,
      isAllowed: false,
      errorMessage: `Unknown service 0x${sid.toString(16).toUpperCase()}`,
      rawPayload: [],
      canFrameData: [],
      isoTpType: 'SF',
    };
  }

  // Hard Invariant 1 check
  if (!service.isAllowed) {
    return {
      valid: false,
      isAllowed: false,
      errorMessage: `BLOCKED BY PLATFORM INVARIANT 1: Service 0x${sid.toString(16).toUpperCase()} (${service.name}) writes or modifies ECU state. The vehicle bus tester is strictly Read-Only.`,
      rawPayload: [],
      canFrameData: [],
      isoTpType: 'SF',
    };
  }

  // Sub-function gate: a service with sub-functions needs one from its allow-list,
  // checked without the suppressPosRsp bit (0x10 0x02 programming session stays refused).
  if (service.allowedSubFunctions) {
    const sub = subFunction === undefined ? undefined : subFunction & ~SUPPRESS_POS_RSP_BIT;
    if (sub === undefined || !service.allowedSubFunctions.includes(sub)) {
      return {
        valid: false,
        isAllowed: false,
        errorMessage: `BLOCKED BY PLATFORM INVARIANT 1: sub-function ${
          subFunction === undefined ? '(none)' : '0x' + subFunction.toString(16).toUpperCase()
        } of service 0x${sid.toString(16).toUpperCase()} is not in the tester policy.`,
        rawPayload: [],
        canFrameData: [],
        isoTpType: 'SF',
      };
    }
  } else if (subFunction !== undefined) {
    return {
      valid: false,
      isAllowed: true,
      errorMessage: `Service 0x${sid.toString(16).toUpperCase()} takes no sub-function.`,
      rawPayload: [],
      canFrameData: [],
      isoTpType: 'SF',
    };
  }

  const payload: number[] = [sid];

  if (subFunction !== undefined) {
    payload.push(subFunction);
  }

  if (parameterBytes && parameterBytes.length > 0) {
    payload.push(...parameterBytes);
  }

  if (payload.length > 7) {
    // Requests stay Single Frame (D-059): the frame gate refuses a tester First Frame.
    return {
      valid: false,
      isAllowed: false,
      errorMessage: `Request of ${payload.length} bytes does not fit a Single Frame; the tester sends Single Frames only (D-059).`,
      rawPayload: [],
      canFrameData: [],
      isoTpType: 'SF',
    };
  }

  // Single Frame (SF)
  const canFrameData = [payload.length, ...payload];
  while (canFrameData.length < 8) {
    canFrameData.push(0xAA); // 0xAA padding per automotive tester convention
  }

  return {
    valid: true,
    isAllowed: true,
    rawPayload: payload,
    canFrameData,
    isoTpType: 'SF',
  };
}

/**
 * Generates an ISO-TP ladder sequence trace for a given UDS transaction
 */
export function generateIsoTpLadderTrace(
  request: UdsComposedRequest,
  didName?: string
): IsoTpLadderStep[] {
  if (!request.valid) return [];

  const now = new Date();
  const formatTime = (msOffset: number) => {
    const t = new Date(now.getTime() + msOffset);
    return t.toISOString().substring(11, 23);
  };

  const steps: IsoTpLadderStep[] = [];

  // Step 1: Request from Tester -> ECU
  steps.push({
    stepIndex: 1,
    timestamp: formatTime(0),
    direction: 'tester_to_ecu',
    frameType: 'SF',
    canIdHex: '0x18DA10F1',
    dataHex: request.canFrameData.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
    pciDesc: `Single Frame (SF, Len=${request.rawPayload.length})`,
    bytesReceived: request.rawPayload.length,
    totalBytes: request.rawPayload.length,
    isComplete: true,
  });

  const sid = request.rawPayload[0];

  // If Reading VIN (0xF190): Simulate Multi-Frame ISO-TP Response (20 bytes)
  if (sid === 0x22 && request.rawPayload[1] === 0xF1 && request.rawPayload[2] === 0x90) {
    const vinBytes = [
      0x62, 0xF1, 0x90, // Positive response 0x62 + DID 0xF190
      0x4A, 0x48, 0x32, 0x4D, 0x43, 0x35, 0x38, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x00, 0x00 // ASCII 'JH2MC5812345678'
    ];
    const totalLen = vinBytes.length; // 20 bytes

    // Step 2: ECU -> Tester: First Frame (FF)
    const ffPciHigh = 0x10 | ((totalLen >> 8) & 0x0F);
    const ffPciLow = totalLen & 0xFF;
    const ffData = [ffPciHigh, ffPciLow, ...vinBytes.slice(0, 6)];
    steps.push({
      stepIndex: 2,
      timestamp: formatTime(25),
      direction: 'ecu_to_tester',
      frameType: 'FF',
      canIdHex: '0x18DAF110',
      dataHex: ffData.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
      pciDesc: `First Frame (FF, Total Len=${totalLen}B, Payload: 6B)`,
      bytesReceived: 6,
      totalBytes: totalLen,
      isComplete: false,
    });

    // Step 3: Tester -> ECU: Flow Control (FC) ContinueToSend
    const fcData = [0x30, 0x00, 0x05, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA]; // FC: CTS, BlockSize=0, STmin=5ms
    steps.push({
      stepIndex: 3,
      timestamp: formatTime(30),
      direction: 'tester_to_ecu',
      frameType: 'FC',
      canIdHex: '0x18DA10F1',
      dataHex: fcData.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
      pciDesc: 'Flow Control (FC: CTS, BlockSize=0, STmin=5ms)',
      bytesReceived: 6,
      totalBytes: totalLen,
      isComplete: false,
    });

    // Step 4: ECU -> Tester: Consecutive Frame 1 (CF Seq=1)
    const cf1Data = [0x21, ...vinBytes.slice(6, 13)];
    steps.push({
      stepIndex: 4,
      timestamp: formatTime(35),
      direction: 'ecu_to_tester',
      frameType: 'CF',
      canIdHex: '0x18DAF110',
      dataHex: cf1Data.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
      pciDesc: 'Consecutive Frame 1 (CF, Seq=1, +7B)',
      bytesReceived: 13,
      totalBytes: totalLen,
      isComplete: false,
    });

    // Step 5: ECU -> Tester: Consecutive Frame 2 (CF Seq=2)
    const cf2Data = [0x22, ...vinBytes.slice(13, 20)];
    while (cf2Data.length < 8) cf2Data.push(0xAA);
    steps.push({
      stepIndex: 5,
      timestamp: formatTime(40),
      direction: 'ecu_to_tester',
      frameType: 'CF',
      canIdHex: '0x18DAF110',
      dataHex: cf2Data.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
      pciDesc: 'Consecutive Frame 2 (CF, Seq=2, +7B) [REASSEMBLY COMPLETE]',
      bytesReceived: 20,
      totalBytes: totalLen,
      isComplete: true,
    });

    return steps;
  }

  // Standard Single Frame Positive Response
  const respPayload = [sid + 0x40];
  if (sid === 0x10) {
    respPayload.push(request.rawPayload[1] || 0x01, 0x00, 0x32, 0x01, 0xF4); // P2=50ms, P2*=500ms
  } else if (sid === 0x22) {
    respPayload.push(request.rawPayload[1] || 0xFD, request.rawPayload[2] || 0x01, 0x1E, 0x40, 0x00, 0x58);
  } else if (sid === 0x19) {
    respPayload.push(0x02, 0x2F, 0x01, 0x15, 0x2F); // DTC P0115 mask 0x2F
  } else {
    respPayload.push(0x00);
  }

  const sfRespData = [respPayload.length, ...respPayload];
  while (sfRespData.length < 8) sfRespData.push(0xAA);

  steps.push({
    stepIndex: 2,
    timestamp: formatTime(18),
    direction: 'ecu_to_tester',
    frameType: 'SF',
    canIdHex: '0x18DAF110',
    dataHex: sfRespData.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
    pciDesc: `Positive Response (SF, Len=${respPayload.length}) [0x${(sid + 0x40).toString(16).toUpperCase()} ${didName || ''}]`,
    bytesReceived: respPayload.length,
    totalBytes: respPayload.length,
    isComplete: true,
  });

  return steps;
}
