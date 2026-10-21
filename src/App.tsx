import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { TracePanel } from './components/TracePanel';
import { SnifferPanel } from './components/SnifferPanel';
import { OscilloscopePanel } from './components/OscilloscopePanel';
import { UdsPanel } from './components/UdsPanel';
import { SyncPanel } from './components/SyncPanel';
import { AttitudeGauge } from './components/AttitudeGauge';
import { ReplayScrubber } from './components/ReplayScrubber';
import { HealthPanel } from './components/HealthPanel';
import { ClusterPanel } from './components/ClusterPanel';
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
import { WebSerialCanAdapter } from './services/webSerialCan';
import { WebSocketStreamClient } from './services/streamClient';
import { IsoTpReassembler } from './services/isoTp';

export function App() {
  const [activeTab, setActiveTab] = useState<CockpitTab>('trace');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [source, setSource] = useState<TelemetrySource>('virtual');
  const [showAttitudeHud, setShowAttitudeHud] = useState<boolean>(true);

  // Time Machine Replay state
  const [replayFrames, setReplayFrames] = useState<CanFrame[]>([]);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

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

  // Subsystem health state for W1-W5
  const [vehicleHealth, setVehicleHealth] = useState({
    rpm: 0,
    speed: 0,
    throttlePct: 0,
    gear: 1,
    coolantTemp: 75,
    frontWheelSpeed: 0,
    rearWheelSpeed: 0,
    absActive: false,
    rtCoreAlive: 0,
    safetyNodeAlive: 0,
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
  const webSerialRef = useRef<WebSerialCanAdapter | null>(null);
  const webSocketRef = useRef<WebSocketStreamClient | null>(null);
  const isoTpRef = useRef<IsoTpReassembler | null>(null);
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

    // Update subsystem health parameters
    if (frame.id === 0x020 && frame.decodedSignals) {
      setVehicleHealth((prev) => ({
        ...prev,
        rpm: typeof frame.decodedSignals?.EngineSpeed === 'number' ? frame.decodedSignals.EngineSpeed : prev.rpm,
        speed: typeof frame.decodedSignals?.VehicleSpeed === 'number' ? frame.decodedSignals.VehicleSpeed : prev.speed,
        throttlePct: typeof frame.decodedSignals?.ThrottlePosition === 'number' ? frame.decodedSignals.ThrottlePosition : prev.throttlePct,
        gear: typeof frame.decodedSignals?.GearPosition === 'number' ? frame.decodedSignals.GearPosition : prev.gear,
        coolantTemp: typeof frame.decodedSignals?.EngineCoolantTemp === 'number' ? frame.decodedSignals.EngineCoolantTemp : prev.coolantTemp,
      }));
    } else if (frame.id === 0x110 && frame.decodedSignals) {
      setVehicleHealth((prev) => ({
        ...prev,
        frontWheelSpeed: typeof frame.decodedSignals?.FrontWheelSpeed === 'number' ? frame.decodedSignals.FrontWheelSpeed : prev.frontWheelSpeed,
        rearWheelSpeed: typeof frame.decodedSignals?.RearWheelSpeed === 'number' ? frame.decodedSignals.RearWheelSpeed : prev.rearWheelSpeed,
        absActive: frame.decodedSignals?.AbsIntervention === 1,
      }));
    } else if (frame.id === 0x081 && frame.decodedSignals) {
      setVehicleHealth((prev) => ({
        ...prev,
        rtCoreAlive: typeof frame.decodedSignals?.AliveCounter === 'number' ? frame.decodedSignals.AliveCounter : prev.rtCoreAlive,
      }));
    } else if (frame.id === 0x082 && frame.decodedSignals) {
      setVehicleHealth((prev) => ({
        ...prev,
        safetyNodeAlive: typeof frame.decodedSignals?.AliveCounter === 'number' ? frame.decodedSignals.AliveCounter : prev.safetyNodeAlive,
      }));
    }

    // 1. Update Overwrite Map
    setFramesMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(frame.id);

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

      // 64-bit flip counters
      const bitFlips = existing ? [...existing.bitFlips] : Array(64).fill(0);
      if (existing) {
        for (let b = 0; b < 8; b++) {
          const cur = frame.data[b] ?? 0;
          const prv = existing.currentBytes[b] ?? 0;
          const xor = cur ^ prv;
          if (xor !== 0) {
            for (let bit = 0; bit < 8; bit++) {
              if ((xor & (1 << bit)) !== 0) {
                const bitIndex = b * 8 + (7 - bit);
                bitFlips[bitIndex] = (bitFlips[bitIndex] || 0) + 1;
              }
            }
          }
        }
      }

      const frameHistory = existing
        ? [...existing.frameHistory, { timestamp: frame.timestamp, data: frame.data }]
        : [{ timestamp: frame.timestamp, data: frame.data }];
      if (frameHistory.length > 16) frameHistory.shift();

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
        frameHistory,
        bitFlips,
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

    // 5. Route diagnostic frames to ISO-TP reassembler
    if (frame.id === 0x18DAF110 || frame.id === 0x7E8) {
      isoTpRef.current?.processFrame(frame.id, frame.data);
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

  const handleInvertNotch = (id: number) => {
    setSnifferMap((prev) => {
      const next = new Map(prev);
      const rec = next.get(id);
      if (rec) {
        const inverted = rec.notchedBytes.map((n) => !n);
        next.set(id, { ...rec, notchedBytes: inverted });
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

  // Time Machine Log File Loader
  const handleLogLoaded = (frames: CanFrame[]) => {
    setReplayFrames(frames);
    setReplayIndex(0);
    setSource('local_file');
    setIsReplaying(false);
    // Pause virtual bus when log is loaded
    virtualBusRef.current?.stop();
    setIsRunning(false);
    // Feed the first frame
    if (frames.length > 0) {
      handleIncomingFrame(frames[0]);
    }
  };

  // Time Machine Playback Timer
  useEffect(() => {
    if (!isReplaying || replayFrames.length === 0) return;

    const intervalMs = Math.max(5, 20 / playbackSpeed);
    const interval = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev + 1 >= replayFrames.length) {
          setIsReplaying(false);
          return prev;
        }
        const nextIndex = prev + 1;
        handleIncomingFrame(replayFrames[nextIndex]);
        return nextIndex;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isReplaying, replayFrames, playbackSpeed, handleIncomingFrame]);

  // Handle manual scrub
  const handleScrub = (index: number) => {
    if (index >= 0 && index < replayFrames.length) {
      setReplayIndex(index);
      handleIncomingFrame(replayFrames[index]);
    }
  };

  // Step controls
  const handleStepForward = () => {
    if (replayIndex + 1 < replayFrames.length) {
      const next = replayIndex + 1;
      setReplayIndex(next);
      handleIncomingFrame(replayFrames[next]);
    }
  };

  const handleStepBackward = () => {
    if (replayIndex - 1 >= 0) {
      const prev = replayIndex - 1;
      setReplayIndex(prev);
      handleIncomingFrame(replayFrames[prev]);
    }
  };

  // 1-second interval to update stats
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const rate = rxCounterRef.current;
      rxCounterRef.current = 0;

      const calculatedLoad = Math.min(95, Math.max(12, (rate * 125 * 8 / 500000) * 100));

      setStats((prev) => ({
        busLoadPct: isRunning || isReplaying ? calculatedLoad : 0,
        msgPerSec: isRunning || isReplaying ? rate : 0,
        errorFrames: 0,
        totalRx: prev.totalRx + rate,
        uptimeSec: Math.floor(elapsedSec),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isReplaying]);

  const currentReplayTime = replayFrames[replayIndex]?.timestamp || 0;
  const totalReplayDuration = replayFrames[replayFrames.length - 1]?.timestamp || 0;

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
          // Stop running sources cleanly
          virtualBusRef.current?.stop();
          webSerialRef.current?.disconnect();
          webSocketRef.current?.disconnect();
          setIsReplaying(false);

          if (s === 'virtual') {
            if (isRunning) virtualBusRef.current?.start(handleIncomingFrame);
          } else if (s === 'webserial') {
            webSerialRef.current = new WebSerialCanAdapter(activeDbcMessages);
            webSerialRef.current
              .connect(115200, handleIncomingFrame)
              .catch((err: any) => {
                alert('WebSerial connection error: ' + err.message);
                setSource('virtual');
                virtualBusRef.current?.start(handleIncomingFrame);
              });
          } else if (s === 'websocket') {
            webSocketRef.current = new WebSocketStreamClient({
              url: 'ws://localhost:8000/ws/live',
              onFrame: handleIncomingFrame,
              onStats: (newStats) => setStats((prev) => ({ ...prev, ...newStats })),
              dbcMessages: activeDbcMessages,
            });
            webSocketRef.current.connect();
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
                if (isReplaying) setIsReplaying(false);
              }}
            />
          )}

          {activeTab === 'sniffer' && (
            <SnifferPanel
              snifferMap={snifferMap}
              onToggleNotch={handleToggleNotch}
              onInvertNotch={handleInvertNotch}
              onClearNotches={handleClearNotches}
            />
          )}

          {activeTab === 'oscilloscope' && (
            <OscilloscopePanel signalsHistory={signalsHistory} />
          )}

          {activeTab === 'uds' && <UdsPanel />}

          {activeTab === 'health' && (
            <HealthPanel
              stats={stats}
              currentRpm={vehicleHealth.rpm}
              currentSpeed={vehicleHealth.speed}
              currentLeanAngle={vehicleDynamics.leanAngle}
              currentCoolantTemp={vehicleHealth.coolantTemp}
              gear={vehicleHealth.gear}
              throttlePct={vehicleHealth.throttlePct}
              frontWheelSpeed={vehicleHealth.frontWheelSpeed}
              rearWheelSpeed={vehicleHealth.rearWheelSpeed}
              absActive={vehicleHealth.absActive}
              rtCoreAlive={vehicleHealth.rtCoreAlive}
              safetyNodeAlive={vehicleHealth.safetyNodeAlive}
            />
          )}

          {activeTab === 'cluster' && (
            <ClusterPanel
              telemetry={vehicleHealth}
              dynamics={vehicleDynamics}
            />
          )}

          {activeTab === 'sync' && (
            <SyncPanel
              onDbcLoaded={setActiveDbcMessages}
              activeDbcMessages={activeDbcMessages}
              onLogLoaded={handleLogLoaded}
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

      {/* Bottom Replay Scrubber (Shown whenever a log file is loaded or source is local_file) */}
      {(source === 'local_file' || replayFrames.length > 0) && (
        <ReplayScrubber
          isReplaying={isReplaying}
          onToggleReplay={() => setIsReplaying(!isReplaying)}
          currentIndex={replayIndex}
          totalFrames={replayFrames.length}
          currentTimeSec={currentReplayTime}
          totalDurationSec={totalReplayDuration}
          playbackSpeed={playbackSpeed}
          onSpeedChange={setPlaybackSpeed}
          onScrub={handleScrub}
          onStepForward={handleStepForward}
          onStepBackward={handleStepBackward}
          onRestart={() => handleScrub(0)}
        />
      )}
    </div>
  );
}

export default App;
