import React, { useState } from 'react';
import {
  Send,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Terminal,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Radio,
} from 'lucide-react';
import { DtcRecord } from '../types/can';
import {
  UDS_SERVICES_CATALOG,
  composeUdsRequest,
  generateIsoTpLadderTrace,
  IsoTpLadderStep,
} from '../services/udsComposer';

interface UdsLogEntry {
  timestamp: string;
  type: 'req' | 'resp';
  service: string;
  dataHex: string;
  decodedDesc: string;
}

export const UdsPanel: React.FC = () => {
  const [selectedSid, setSelectedSid] = useState<number>(0x22);
  const [selectedSubFunction, setSelectedSubFunction] = useState<number>(0x03);
  const [selectedDid, setSelectedDid] = useState<string>('0xF190');
  const [customDidHex, setCustomDidHex] = useState<string>('0xFD01');
  const [useCustomDid, setUseCustomDid] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'composer' | 'dtcs'>('composer');

  // Active ISO-TP Ladder sequence
  const [ladderSteps, setLadderSteps] = useState<IsoTpLadderStep[]>(() => {
    const initialReq = composeUdsRequest(0x22, undefined, [0xF1, 0x90]);
    return generateIsoTpLadderTrace(initialReq, 'VIN');
  });

  const [udsLogs, setUdsLogs] = useState<UdsLogEntry[]>([
    {
      timestamp: '14:20:05.120',
      type: 'req',
      service: '0x10 DiagnosticSessionControl',
      dataHex: '10 03 (ExtendedSession)',
      decodedDesc: 'Tester requested transition to ISO 14229 Extended Diagnostic Session',
    },
    {
      timestamp: '14:20:05.142',
      type: 'resp',
      service: '0x50 PositiveResponse',
      dataHex: '50 03 00 32 01 F4',
      decodedDesc: 'Session accepted. P2=50ms, P2*=500ms',
    },
    {
      timestamp: '14:20:06.010',
      type: 'req',
      service: '0x22 ReadDataByIdentifier',
      dataHex: '22 F1 90 (VIN)',
      decodedDesc: 'Multi-frame ISO-TP read of Vehicle Identification Number',
    },
    {
      timestamp: '14:20:06.040',
      type: 'resp',
      service: '0x62 PositiveResponse',
      dataHex: '62 F1 90 4A 48 32 4D 43 35 38 31 32 33 34 35 36 37 38',
      decodedDesc: 'VIN = "JH2MC5812345678" (Honda CL250 SDV Prototype)',
    },
  ]);

  // Active DTCs
  const dtcs: DtcRecord[] = [
    {
      code: 'P0115',
      description: 'Engine Coolant Temperature Sensor 1 Circuit Malfunction',
      statusMask: 0x2F,
      active: true,
      pending: false,
      confirmed: true,
      freezeFrame: {
        'Engine Speed': '4250 rpm',
        'Vehicle Speed': '62.4 km/h',
        'Coolant Temp': '112 °C',
        'Throttle Pos': '42 %',
      },
    },
    {
      code: 'P0500',
      description: 'Vehicle Speed Sensor "A" Intermittent Signal',
      statusMask: 0x24,
      active: false,
      pending: true,
      confirmed: false,
      freezeFrame: {
        'Engine Speed': '6100 rpm',
        'Vehicle Speed': '0.0 km/h',
        'Coolant Temp': '82 °C',
        'Throttle Pos': '68 %',
      },
    },
  ];

  const currentServiceDef = UDS_SERVICES_CATALOG.find((s) => s.sid === selectedSid);

  const handleTransmit = () => {
    let params: number[] = [];

    if (selectedSid === 0x22) {
      const didString = useCustomDid ? customDidHex : selectedDid;
      const clean = didString.replace('0x', '').padStart(4, '0');
      const b1 = parseInt(clean.substring(0, 2), 16) || 0;
      const b2 = parseInt(clean.substring(2, 4), 16) || 0;
      params = [b1, b2];
    }

    const subFn = currentServiceDef?.subFunctions ? selectedSubFunction : undefined;
    const compiled = composeUdsRequest(selectedSid, subFn, params);

    if (!compiled.valid) {
      alert(compiled.errorMessage || 'Invalid UDS Request');
      return;
    }

    // Generate ISO-TP Ladder
    const didName = selectedSid === 0x22 ? (useCustomDid ? customDidHex : selectedDid) : undefined;
    const newLadder = generateIsoTpLadderTrace(compiled, didName);
    setLadderSteps(newLadder);

    // Append to log
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + Math.floor(Math.random() * 900 + 100);
    const reqLog: UdsLogEntry = {
      timestamp: timeStr,
      type: 'req',
      service: `0x${selectedSid.toString(16).toUpperCase()} ${currentServiceDef?.name || ''}`,
      dataHex: compiled.rawPayload.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
      decodedDesc: `ISO-TP Transmit on 0x18DAF110 (${compiled.isoTpType})`,
    };

    setUdsLogs((prev) => [...prev, reqLog]);
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      {/* Top Banner */}
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">ISO 14229 UDS Diagnostic Console & ISO 15765-2 Packet Ladder</span>
          <span className="text-[10px] text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800">
            Automotive Tester Mode
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-400 font-semibold">Platform Invariant 1 Active: Read-Only Gated</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Composer & DTCs */}
        <div className="w-full md:w-1/2 border-r border-surface-border p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Sub-tab navigation */}
          <div className="flex items-center bg-surface border border-surface-border rounded p-0.5">
            <button
              onClick={() => setActiveTab('composer')}
              className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'composer' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Interactive Request Composer</span>
            </button>
            <button
              onClick={() => setActiveTab('dtcs')}
              className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'dtcs' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>DTC Faults & Freezes ({dtcs.length})</span>
            </button>
          </div>

          {activeTab === 'composer' ? (
            <div className="flex flex-col gap-4">
              {/* Service Selection */}
              <div className="bg-surface/60 border border-surface-border rounded-lg p-3.5 flex flex-col gap-3">
                <span className="text-slate-300 font-semibold text-xs flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>Diagnostic Service (SID)</span>
                </span>

                <select
                  value={selectedSid}
                  onChange={(e) => setSelectedSid(parseInt(e.target.value))}
                  className="bg-background border border-surface-border rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {UDS_SERVICES_CATALOG.map((svc) => (
                    <option key={svc.sid} value={svc.sid} disabled={!svc.isAllowed}>
                      {svc.sidHex} — {svc.name} {!svc.isAllowed ? '[BLOCKED: INVARIANT 1]' : ''}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-slate-400">{currentServiceDef?.description}</p>

                {/* Subfunction selector if present */}
                {currentServiceDef?.subFunctions && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400">Sub-Function:</span>
                    <select
                      value={selectedSubFunction}
                      onChange={(e) => setSelectedSubFunction(parseInt(e.target.value))}
                      className="bg-background border border-surface-border rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      {currentServiceDef.subFunctions.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* DID selector for ReadDataByIdentifier (0x22) */}
                {selectedSid === 0x22 && (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Data Identifier (DID):</span>
                      <button
                        onClick={() => setUseCustomDid((prev) => !prev)}
                        className="text-[10px] text-cyan-400 hover:underline"
                      >
                        {useCustomDid ? 'Use Catalog Preset' : 'Enter Custom Hex'}
                      </button>
                    </div>

                    {useCustomDid ? (
                      <input
                        type="text"
                        value={customDidHex}
                        onChange={(e) => setCustomDidHex(e.target.value)}
                        placeholder="0xFD01"
                        className="bg-background border border-surface-border rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    ) : (
                      <select
                        value={selectedDid}
                        onChange={(e) => setSelectedDid(e.target.value)}
                        className="bg-background border border-surface-border rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      >
                        <option value="0xF190">0xF190 — VIN (Multi-Frame ISO-TP, 20 Bytes)</option>
                        <option value="0xFD01">0xFD01 — Engine State & RPM (CL250 Primary)</option>
                        <option value="0xFD03">0xFD03 — Lean Angle Health (Safety Node IMU)</option>
                        <option value="0xF187">0xF187 — ECU Hardware Part Number</option>
                        <option value="0xF189">0xF189 — ECU Calibration Software Number</option>
                      </select>
                    )}
                  </div>
                )}

                {/* Transmit Button */}
                <div className="pt-2">
                  <button
                    onClick={handleTransmit}
                    disabled={!currentServiceDef?.isAllowed}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded font-semibold text-xs transition-all ${
                      currentServiceDef?.isAllowed
                        ? 'bg-cyan-600 hover:bg-cyan-500 text-slate-900 shadow-md shadow-cyan-950/40 cursor-pointer'
                        : 'bg-rose-950/40 text-rose-400 border border-rose-800 cursor-not-allowed opacity-70'
                    }`}
                  >
                    {currentServiceDef?.isAllowed ? (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>TRANSMIT ISO-TP DIAGNOSTIC REQUEST</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>BLOCKED BY INVARIANT 1</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Safety Architecture Callout */}
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-3 text-[11px] text-emerald-300 leading-relaxed">
                <strong className="block mb-1 text-emerald-200">ISO 14229 Safety Protocol Compliance:</strong>
                All diagnostic communications strictly pass through <code className="bg-emerald-950/60 px-1 py-0.5 rounded text-[10px]">moto-vehicle-defs</code> verified gates. Writes, clears, and ECU reprogramming are permanently rejected at the hardware layer.
              </div>
            </div>
          ) : (
            /* DTCs View */
            <div className="flex flex-col gap-3">
              {dtcs.map((dtc) => (
                <div
                  key={dtc.code}
                  className="bg-surface/60 border border-surface-border rounded-lg p-3.5 flex flex-col gap-2 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-rose-400">{dtc.code}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          dtc.confirmed
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {dtc.confirmed ? 'CONFIRMED' : 'PENDING'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Status Mask: 0x{dtc.statusMask.toString(16).toUpperCase()}
                    </span>
                  </div>

                  <div className="text-slate-300 text-[11px] leading-relaxed">{dtc.description}</div>

                  {/* Freeze Frame Snapshot Card */}
                  {dtc.freezeFrame && (
                    <div className="bg-background/80 rounded border border-surface-border p-2.5 mt-1 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold border-b border-surface-border pb-1">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        <span>Freeze Frame Snapshot (D-080)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                        {Object.entries(dtc.freezeFrame).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between">
                            <span className="text-slate-400">{k}:</span>
                            <span className="text-cyan-300 font-bold">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: ISO-TP Packet Ladder Sequence Diagram & Communication Log */}
        <div className="w-full md:w-1/2 p-4 flex flex-col gap-4 overflow-hidden">
          {/* ISO-TP Ladder Card */}
          <div className="bg-surface/60 border border-surface-border rounded-lg p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-border pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="text-slate-200 font-semibold text-xs">ISO 15765-2 Packet Ladder Diagram</span>
              </div>
              <span className="text-[10px] bg-purple-950/40 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-mono">
                {ladderSteps.length} Frames
              </span>
            </div>

            {/* Sequence Ladder Rails */}
            <div className="flex items-center justify-between px-6 text-[11px] font-semibold text-slate-400 border-b border-surface-border/40 pb-1">
              <span className="text-cyan-400">TESTER CLIENT [0x18DAF110]</span>
              <span className="text-emerald-400">CL250 ECU [0x18DA10F1]</span>
            </div>

            {/* Steps Container */}
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto px-1 py-1">
              {ladderSteps.map((step) => {
                const isTesterToEcu = step.direction === 'tester_to_ecu';
                return (
                  <div
                    key={step.stepIndex}
                    className="flex items-center justify-between gap-3 text-[11px] bg-background/60 p-2 rounded border border-surface-border/70 hover:border-slate-500 transition-colors"
                  >
                    {/* Step number badge */}
                    <span className="text-[10px] text-slate-500 font-bold w-4">#{step.stepIndex}</span>

                    {/* Arrow & Payload display */}
                    <div className="flex-1 flex items-center justify-between gap-2">
                      {isTesterToEcu ? (
                        <>
                          <div className="flex flex-col">
                            <span className="font-bold text-cyan-300">{step.frameType}</span>
                            <span className="text-[9px] text-slate-400">{step.pciDesc}</span>
                          </div>
                          <div className="flex items-center gap-1 text-cyan-400 flex-1 justify-center">
                            <span className="h-[1px] bg-cyan-500/60 flex-1"></span>
                            <span className="font-mono text-[10px] bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800 text-cyan-200">
                              {step.dataHex}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                          <div className="w-12 text-right text-[10px] text-slate-500">ECU</div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 text-left text-[10px] text-slate-500">Tester</div>
                          <div className="flex items-center gap-1 text-emerald-400 flex-1 justify-center">
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span className="font-mono text-[10px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800 text-emerald-200">
                              {step.dataHex}
                            </span>
                            <span className="h-[1px] bg-emerald-500/60 flex-1"></span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="font-bold text-emerald-300">{step.frameType}</span>
                            <span className="text-[9px] text-slate-400">{step.pciDesc}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reassembly Completion Banner */}
            {ladderSteps.length > 0 && (
              <div className="bg-surface-elevated/70 border border-surface-border rounded p-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300 font-semibold">ISO-TP Reassembly Status:</span>
                </div>
                <span className="text-emerald-300 font-bold font-mono">100% COMPLETE</span>
              </div>
            )}
          </div>

          {/* Diagnostic Communication Terminal Log */}
          <div className="flex-1 bg-surface/40 border border-surface-border rounded-lg p-3 flex flex-col gap-2 overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-border pb-1.5">
              <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-[11px]">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Diagnostic Transaction Log</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Filtered 0x18DAF110</span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 text-[11px] font-mono">
              {udsLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded border ${
                    log.type === 'req'
                      ? 'bg-cyan-950/20 border-cyan-500/20 text-cyan-300'
                      : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>
                      {log.timestamp} • {log.type.toUpperCase()}
                    </span>
                    <span className="font-semibold">{log.service}</span>
                  </div>
                  <div className="font-bold">{log.dataHex}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{log.decodedDesc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
