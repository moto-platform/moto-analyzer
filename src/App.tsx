import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { TracePanel } from './components/TracePanel';
import { SnifferPanel } from './components/SnifferPanel';
import { OscilloscopePanel } from './components/OscilloscopePanel';
import { UdsPanel } from './components/UdsPanel';
import { SyncPanel } from './components/SyncPanel';
import { AttitudeGauge } from './components/AttitudeGauge';
import {
  CockpitTab,
  CanFrame,
  BusStats,
  TelemetrySource,
  ByteSnifferRecord,
  ByteActivityStatus,
  DbcMessageDef,
} from './types/can';
import { VirtualCanBus } from './services/virtualBus';
import { DEFAULT_MOTO_MESSAGES } from './services/dbcParser';

export function App() {
  const [activeTab, setActiveTab] = useState<CockpitTab>('trace');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [source, setSource] = useState<TelemetrySource>('virtual');
  const [showAttitudeHud, setShowAttitudeHud] = useState<boolean>(true);

  // Live vehicle dynamics state from Frame 0x021
  const [vehicleDynamics, setVehicleDynamics] = useState<{
    leanAngle: number;
    rollRate: number;
    lateralAccel: number;
  }>({
    leanAngle: 0,
    rollRate: 0,
    lateralAccel: 0,
  });

  // Ring buffers and maps
  const [framesMap, setFramesMap] = useState<Map<number, CanFrame>>(new Map());
  const [framesLog, setFramesLog] = useState<CanFrame[]>([]);
  const [snifferMap, setSnifferMap] = useState<Map<number, ByteSnifferRecord>>(new Map());
  const [signalsHistory, setSignalsHistory] = useState<Map<string, { time: number; value: number }[]>>(new Map());
  const [activeDbcMessages, setActiveDbcMessages] = useState<DbcMessageDef[]>(DEFAULT_MOTO_MESSAGES);

  // Telemetry stats
  const [stats, setStats] = useState<BusStats>({
    busLoadPct: 32.4,
    msgPerSec: 0,
    errorFrames: 0,
    totalRx: 0,
    uptimeSec: 0,
  });

  const virtualBusRef = useRef<VirtualCanBus | null>(null);
  const rxCounterRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  // Frame processing callback
  const handleIncomingFrame = useCallback((frame: CanFrame) => {
    rxCounterRef.current += 1;

    // Update dynamics if frame is 0x021
    if (frame.id === 0x021 && frame.decodedSignals) {
      setVehicleDynamics({
        leanAngle: typeof frame.decodedSignals.LeanAngle === 'number' ? frame.decodedSignals.LeanAngle : 0,
        rollRate: typeof frame.decodedSignals.RollRate === 'number' ? frame.decodedSignals.RollRate : 0,
        lateralAccel: typeof frame.decodedSignals.LateralAccel === 'number' ? frame.decodedSignals.LateralAccel : 0,
      });
    }

    // 1. Update Overwrite Map
    setFramesMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(frame.id);

      // Check changed bytes
      const changedBytes: boolean[] = [];
      if (existing) {
        for (let i = 0; i < frame.data.length; i++) {
          changedBytes.push(existing.data[i] !== frame.data[i]);
        }
      }

      next.set(frame.id, {
        ...frame,
        count: existing ? existing.count + 1 : 1,
        prevData: existing ? existing.data : undefined,
        changedBytes: existing ? changedBytes : undefined,
      });
      return next;
    });

    // 2. Update Scroll Ring Buffer (limit to 300)
    setFramesLog((prev) => {
      const next = [...prev, frame];
      if (next.length > 300) next.shift();
      return next;
    });

    // 3. Update SavvyCAN Byte Sniffer Heatmap
    setSnifferMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(frame.id);

      const byteStatuses: ByteActivityStatus[] = [];
      const changeCounts: number[] = existing ? [...existing.changeCounts] : Array(8).fill(0);
      const notchedBytes: boolean[] = existing ? [...existing.notchedBytes] : Array(8).fill(false);

      for (let i = 0; i < 8; i++) {
        const currentByte = frame.data[i] ?? 0;
        const prevByte = existing ? existing.currentBytes[i] ?? currentByte : currentByte;

        if (currentByte === prevByte) {
          byteStatuses.push('static');
        } else if (currentByte > prevByte) {
          byteStatuses.push('inc');
          changeCounts[i] = (changeCounts[i] || 0) + 1;
        } else {
          byteStatuses.push('dec');
          changeCounts[i] = (changeCounts[i] || 0) + 1;
        }
      }

      next.set(frame.id, {
        id: frame.id,
        idHex: frame.idHex,
        name: frame.name,
        dlc: frame.dlc,
        currentBytes: frame.data,
        prevBytes: existing ? existing.currentBytes : frame.data,
        byteStatuses,
        changeCounts,
        notchedBytes,
        lastUpdated: performance.now(),
      });

      return next;
    });

    // 4. Update Oscilloscope Signals History
    if (frame.decodedSignals) {
      setSignalsHistory((prev) => {
        const next = new Map(prev);
        Object.entries(frame.decodedSignals!).forEach(([sigName, val]) => {
          if (typeof val === 'number') {
            const arr = next.get(sigName) || [];
            const newArr = [...arr, { time: frame.timestamp, value: val }];
            if (newArr.length > 400) newArr.shift();
            next.set(sigName, newArr);
          }
        });
        return next;
      });
    }
  }, []);

  // Initialize and manage Virtual Bus
  useEffect(() => {
    const vbus = new VirtualCanBus();
    virtualBusRef.current = vbus;

    if (isRunning && source === 'virtual') {
      vbus.start(handleIncomingFrame);
    }

    return () => {
      vbus.stop();
    };
  }, [handleIncomingFrame]);

  // Handle play/pause
  const togglePlay = () => {
    setIsRunning((prev) => {
      const next = !prev;
      if (virtualBusRef.current) {
        if (next && source === 'virtual') {
          virtualBusRef.current.start(handleIncomingFrame);
        } else {
          virtualBusRef.current.stop();
        }
      }
      return next;
    });
  };

  // Handle clear buffers
  const handleClear = () => {
    setFramesMap(new Map());
    setFramesLog([]);
    setSignalsHistory(new Map());
    setSnifferMap(new Map());
    rxCounterRef.current = 0;
  };

  // Notch filter toggle in Sniffer
  const handleToggleNotch = (id: number, byteIdx: number) => {
    setSnifferMap((prev) => {
      const next = new Map(prev);
      const rec = next.get(id);
      if (rec) {
        const notched = [...rec.notchedBytes];
        notched[byteIdx] = !notched[byteIdx];
        next.set(id, { ...rec, notchedBytes: notched });
      }
      return next;
    });
  };

  const handleClearNotches = () => {
    setSnifferMap((prev) => {
      const next = new Map(prev);
      next.forEach((rec, id) => {
        next.set(id, { ...rec, notchedBytes: Array(8).fill(false) });
      });
      return next;
    });
  };

  // 1-second interval to update stats
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const rate = rxCounterRef.current;
      rxCounterRef.current = 0;

      const calculatedLoad = Math.min(95, Math.max(12, (rate * 125 * 8 / 500000) * 100));

      setStats((prev) => ({
        busLoadPct: isRunning ? calculatedLoad : 0,
        msgPerSec: isRunning ? rate : 0,
        errorFrames: 0,
        totalRx: prev.totalRx + rate,
        uptimeSec: Math.floor(elapsedSec),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-slate-100 font-sans">
      {/* Top Header & Navigation */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isRunning={isRunning}
        onTogglePlay={togglePlay}
        onClear={handleClear}
        stats={stats}
        source={source}
        onSourceChange={(s) => {
          setSource(s);
          if (s === 'virtual' && isRunning) {
            virtualBusRef.current?.start(handleIncomingFrame);
          } else {
            virtualBusRef.current?.stop();
          }
        }}
        showAttitudeHud={showAttitudeHud}
        onToggleAttitudeHud={() => setShowAttitudeHud(!showAttitudeHud)}
      />

      {/* Main Cockpit Body with Optional Attitude HUD Widget */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 overflow-hidden">
          {activeTab === 'trace' && (
            <TracePanel
              framesMap={framesMap}
              framesLog={framesLog}
              onTriggerPause={() => {
                if (isRunning) togglePlay();
              }}
            />
          )}

          {activeTab === 'sniffer' && (
            <SnifferPanel
              snifferMap={snifferMap}
              onToggleNotch={handleToggleNotch}
              onClearNotches={handleClearNotches}
            />
          )}

          {activeTab === 'oscilloscope' && (
            <OscilloscopePanel signalsHistory={signalsHistory} />
          )}

          {activeTab === 'uds' && <UdsPanel />}

          {activeTab === 'sync' && (
            <SyncPanel
              onDbcLoaded={setActiveDbcMessages}
              activeDbcMessages={activeDbcMessages}
            />
          )}
        </main>

        {/* Floating / Docked Motorcycle Dynamics HUD */}
        {showAttitudeHud && (
          <div className="absolute bottom-4 right-4 z-20 w-80 shadow-2xl transition-all">
            <AttitudeGauge
              leanAngleDeg={vehicleDynamics.leanAngle}
              rollRateDegS={vehicleDynamics.rollRate}
              lateralAccelG={vehicleDynamics.lateralAccel}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
