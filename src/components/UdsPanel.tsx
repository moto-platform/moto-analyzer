import React, { useState } from 'react';
import { Send, AlertTriangle, Clock, ShieldCheck, Terminal } from 'lucide-react';
import { DtcRecord } from '../types/can';

interface UdsLogEntry {
  timestamp: string;
  type: 'req' | 'resp';
  service: string;
  dataHex: string;
  decodedDesc: string;
}

export const UdsPanel: React.FC = () => {
  const [selectedDid, setSelectedDid] = useState<string>('0xFD01');
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
      dataHex: '22 FD 01 (EngineState)',
      decodedDesc: 'Read live engine state telemetry block',
    },
    {
      timestamp: '14:20:06.035',
      type: 'resp',
      service: '0x62 PositiveResponse',
      dataHex: '62 FD 01 1E 40 00 58',
      decodedDesc: 'RPM=7744, Coolant=88°C, Throttle=35%',
    },
  ]);

  // Mock Active DTCs matching platform definitions
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

  const handleSendRequest = () => {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + Math.floor(Math.random() * 900 + 100);
    const newReq: UdsLogEntry = {
      timestamp: timeStr,
      type: 'req',
      service: '0x22 ReadDataByIdentifier',
      dataHex: `22 ${selectedDid.replace('0x', '').slice(0, 2)} ${selectedDid.replace('0x', '').slice(2, 4)}`,
      decodedDesc: `Polled DID ${selectedDid}`,
    };

    const newResp: UdsLogEntry = {
      timestamp: timeStr,
      type: 'resp',
      service: '0x62 PositiveResponse',
      dataHex: `62 ${selectedDid.replace('0x', '')} 00 1A 4F`,
      decodedDesc: `DID ${selectedDid} response valid`,
    };

    setUdsLogs((prev) => [...prev, newReq, newResp]);
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      {/* Top Banner */}
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">ISO 14229 UDS Diagnostic Console</span>
          <span className="text-[10px] text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800">
            Passive Diagnostic Client
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Platform Invariant 1 Gated (Read-Only)</span>
        </div>
      </div>

      {/* Main Grid: DTCs on Left, Live DID Request & Terminal Log on Right */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Panel: Diagnostic Trouble Codes & Freeze Frames */}
        <div className="w-full md:w-1/2 border-r border-surface-border p-4 flex flex-col gap-4 overflow-auto">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-slate-200">DTC Fault Codes (0x19 0x02)</span>
            </div>
            <span className="text-[10px] bg-surface-elevated px-2 py-0.5 rounded border border-surface-border text-slate-400">
              {dtcs.length} Recorded
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {dtcs.map((dtc) => (
              <div
                key={dtc.code}
                className="bg-surface/60 border border-surface-border rounded-lg p-3.5 flex flex-col gap-2 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-rose-400">{dtc.code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${dtc.confirmed ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                      {dtc.confirmed ? 'CONFIRMED' : 'PENDING'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Mask: 0x{dtc.statusMask.toString(16).toUpperCase()}</span>
                </div>

                <div className="text-slate-300 text-[11px] leading-relaxed">
                  {dtc.description}
                </div>

                {/* Status Mask Bits */}
                <div className="grid grid-cols-4 gap-1.5 text-[10px] pt-1">
                  <div className={`p-1 rounded text-center border ${dtc.active ? 'bg-rose-950/40 text-rose-400 border-rose-800' : 'bg-background text-slate-600 border-surface-border'}`}>
                    TestFailed (b0)
                  </div>
                  <div className={`p-1 rounded text-center border ${dtc.pending ? 'bg-amber-950/40 text-amber-400 border-amber-800' : 'bg-background text-slate-600 border-surface-border'}`}>
                    Pending (b2)
                  </div>
                  <div className={`p-1 rounded text-center border ${dtc.confirmed ? 'bg-rose-950/40 text-rose-400 border-rose-800' : 'bg-background text-slate-600 border-surface-border'}`}>
                    Confirmed (b3)
                  </div>
                  <div className="p-1 rounded text-center border bg-background text-slate-600 border-surface-border">
                    WarningReq (b7)
                  </div>
                </div>

                {/* Freeze Frame Card */}
                {dtc.freezeFrame && (
                  <div className="bg-background/80 rounded border border-surface-border p-2.5 mt-2 flex flex-col gap-1.5">
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
        </div>

        {/* Right Panel: DID Polling & Raw UDS Logger */}
        <div className="w-full md:w-1/2 p-4 flex flex-col gap-4 overflow-hidden">
          {/* DID Query Bar */}
          <div className="bg-surface/60 border border-surface-border rounded-lg p-3 flex flex-col gap-2">
            <span className="text-slate-200 font-semibold text-xs">Read Data By Identifier (Service 0x22)</span>
            <div className="flex items-center gap-2">
              <select
                value={selectedDid}
                onChange={(e) => setSelectedDid(e.target.value)}
                className="bg-background border border-surface-border rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 flex-1 font-mono"
              >
                <option value="0xFD01">0xFD01 — Engine State & RPM (CL250)</option>
                <option value="0xFD03">0xFD03 — Lean Angle Health (Safety Node)</option>
                <option value="0xF190">0xF190 — VIN (Vehicle Identification Number)</option>
                <option value="0xF187">0xF187 — ECU Hardware Number</option>
                <option value="0xF189">0xF189 — ECU Calibration Software Number</option>
              </select>

              <button
                onClick={handleSendRequest}
                className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-900 font-semibold px-4 py-1.5 rounded transition-colors text-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>POLL</span>
              </button>
            </div>
          </div>

          {/* Raw Terminal Console */}
          <div className="flex-1 bg-surface/40 border border-surface-border rounded-lg p-3 flex flex-col gap-2 overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-border pb-1.5">
              <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-[11px]">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Diagnostic Communication Log</span>
              </div>
              <span className="text-[10px] text-slate-500">ISO-TP CAN Filter 0x18DAF110</span>
            </div>

            <div className="flex-1 overflow-auto flex flex-col gap-1.5 text-[11px] font-mono">
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
                    <span>{log.timestamp} • {log.type.toUpperCase()}</span>
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
