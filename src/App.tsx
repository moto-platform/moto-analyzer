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
import {
  CockpitTab,
  CanFrame,
  BusStats,
  TelemetrySource,
  ByteSnifferRecord,
  DbcMessageDef,
} from './types/can';
import { VirtualCanBus } from './services/virtualBus';
import { DEFAULT_MOTO_MESSAGES } from './services/dbcParser';
import { WebSerialCanAdapter } from './services/webSerialCan';
import { WebSocketStreamClient } from './services/streamClient';
import { IsoTpReassembler } from './services/isoTp';
import { FrameTimingTracker, BusLoadMeter } from './services/capture';
import { updateSnifferRecord } from './services/sniffer';
import { UDS_REQUEST_ID, UDS_RESPONSE_ID } from './services/udsComposer';

/** Frames replayed silently to rebuild the views after a backward seek. */
const REPLAY_REBUILD_WINDOW = 500;
/** Longest real wait between two replayed frames (a gap in the log is not waited out). */
const REPLAY_MAX_GAP_MS = 1000;

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
    busLoadPct: 0,
    msgPerSec: 0,
    errorFrames: 0,
    totalRx: 0,
    uptimeSec: 0,
  });

  const virtualBusRef = useRef<VirtualCanBus | null>(null);
  const webSerialRef = useRef<WebSerialCanAdapter | null>(null);
  const webSocketRef = useRef<WebSocketStreamClient | null>(null);
  const isoTpRef = useRef<IsoTpReassembler>(new IsoTpReassembler());
  const timingRef = useRef<FrameTimingTracker>(new FrameTimingTracker());
  const busLoadRef = useRef<BusLoadMeter>(new BusLoadMeter());
  const triggerIdRef = useRef<number | null>(null);
  const [triggerArmed, setTriggerArmed] = useState<boolean>(false);
  const pauseRef = useRef<() => void>(() => undefined);
  const rxCounterRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  // Frame processing callback. Side effects (counters, trigger, ISO-TP) run here once
  // per frame, never inside a state updater: React may call updaters twice.
  const handleIncomingFrame = useCallback((incoming: CanFrame) => {
    const frame = timingRef.current.stamp(incoming);
    rxCounterRef.current += 1;
    busLoadRef.current.add(frame);

    // Pause-on-trigger: fires on the first matching frame after arming.
    if (triggerIdRef.current !== null && frame.id === triggerIdRef.current) {
      triggerIdRef.current = null;
      setTriggerArmed(false);
      pauseRef.current();
    }

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
      next.set(frame.id, updateSnifferRecord(prev.get(frame.id), frame));
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
    if (frame.id === UDS_RESPONSE_ID || frame.id === UDS_REQUEST_ID) {
      isoTpRef.current.processFrame(frame.id, frame.data, frame.timestamp * 1000);
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
  const setRunning = useCallback(
    (next: boolean) => {
      setIsRunning(next);
      if (!virtualBusRef.current) return;
      if (next && source === 'virtual') virtualBusRef.current.start(handleIncomingFrame);
      else virtualBusRef.current.stop();
    },
    [source, handleIncomingFrame]
  );
  const togglePlay = () => setRunning(!isRunning);

  // The trigger pauses whatever is streaming: the live source and the replay.
  useEffect(() => {
    pauseRef.current = () => {
      setRunning(false);
      setIsReplaying(false);
    };
  }, [setRunning]);

  // Handle clear buffers
  const handleClear = () => {
    setFramesMap(new Map());
    setFramesLog([]);
    setSignalsHistory(new Map());
    setSnifferMap(new Map());
    rxCounterRef.current = 0;
    timingRef.current.reset();
    busLoadRef.current.reset();
    isoTpRef.current.reset();
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
  const replayIndexRef = useRef<number>(0);
  useEffect(() => {
    replayIndexRef.current = replayIndex;
  }, [replayIndex]);

  const handleLogLoaded = (frames: CanFrame[]) => {
    virtualBusRef.current?.stop();
    setIsRunning(false);
    setIsReplaying(false);
    handleClear();
    setReplayFrames(frames);
    setReplayIndex(0);
    replayIndexRef.current = 0;
    setSource('local_file');
    if (frames.length > 0) handleIncomingFrame(frames[0]);
  };

  // Time Machine playback: each frame is scheduled after the recorded gap to the
  // previous one, divided by the speed. Frames closer than a timer tick go together.
  useEffect(() => {
    if (!isReplaying || replayFrames.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      let idx = replayIndexRef.current;
      const startT = replayFrames[idx]?.timestamp ?? 0;
      // Emit every frame due within the next 4 ms of log time (scaled).
      while (idx + 1 < replayFrames.length) {
        const gapMs = ((replayFrames[idx + 1].timestamp - startT) * 1000) / playbackSpeed;
        if (gapMs > 4) break;
        idx += 1;
        handleIncomingFrame(replayFrames[idx]);
      }
      replayIndexRef.current = idx;
      setReplayIndex(idx);
      if (idx + 1 >= replayFrames.length) {
        setIsReplaying(false);
        return;
      }
      const waitMs = Math.min(
        REPLAY_MAX_GAP_MS,
        Math.max(0, ((replayFrames[idx + 1].timestamp - replayFrames[idx].timestamp) * 1000) / playbackSpeed)
      );
      timer = setTimeout(() => {
        if (cancelled) return;
        replayIndexRef.current = idx + 1;
        handleIncomingFrame(replayFrames[idx + 1]);
        step();
      }, waitMs);
    };
    step();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isReplaying, replayFrames, playbackSpeed, handleIncomingFrame]);

  // Seek: forward seeks feed the skipped frames; backward seeks rebuild the views from
  // a window before the target, so no view keeps frames from "the future".
  const seekTo = (index: number) => {
    if (index < 0 || index >= replayFrames.length) return;
    const current = replayIndexRef.current;
    if (index > current && index - current <= REPLAY_REBUILD_WINDOW) {
      for (let i = current + 1; i <= index; i++) handleIncomingFrame(replayFrames[i]);
    } else if (index !== current) {
      handleClear();
      for (let i = Math.max(0, index - REPLAY_REBUILD_WINDOW); i <= index; i++) handleIncomingFrame(replayFrames[i]);
    }
    replayIndexRef.current = index;
    setReplayIndex(index);
  };

  const handleScrub = (index: number) => seekTo(index);
  const handleStepForward = () => seekTo(replayIndexRef.current + 1);
  const handleStepBackward = () => seekTo(replayIndexRef.current - 1);

  // 1-second interval to update stats. Load is measured from the frames' wire bits
  // per bus (the busiest bus is shown); replay time runs at the playback speed.
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    let last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const wallSec = (now - last) / 1000;
      last = now;
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const count = rxCounterRef.current;
      rxCounterRef.current = 0;
      const sourceSec = wallSec * (isReplaying ? playbackSpeedRef.current : 1);
      const perBus = busLoadRef.current.sample(sourceSec);
      let busLoadPct = 0;
      perBus.forEach((v) => {
        busLoadPct = Math.max(busLoadPct, v.loadPct);
      });

      setStats((prev) => ({
        busLoadPct,
        msgPerSec: Math.round(count / wallSec),
        errorFrames: prev.errorFrames,
        totalRx: prev.totalRx + count,
        uptimeSec: Math.floor(elapsedSec),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isReplaying]);

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
              triggerArmed={triggerArmed}
              onArmTrigger={(id) => {
                triggerIdRef.current = id;
                setTriggerArmed(id !== null);
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
