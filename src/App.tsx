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
import { BusRole, CanFrame, CockpitTab, TelemetrySource } from './types/can';
import { DEFS } from './defs';
import { CaptureStore } from './state/captureStore';
import { useCapture } from './state/useCapture';
import { VirtualCanBus } from './services/virtualBus';
import { WebSerialCanAdapter } from './services/webSerialCan';
import { WebSocketStreamClient } from './services/streamClient';

/** Frames replayed silently to rebuild the views after a backward seek. */
const REPLAY_REBUILD_WINDOW = 2000;
/** Longest real wait between two replayed frames (a gap in the log is not waited out). */
const REPLAY_MAX_GAP_MS = 1000;
const DEFAULT_WS_URL = 'ws://localhost:8000/ws/live';

export type WsStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export function App() {
  const [store] = useState(() => new CaptureStore(DEFS));
  useCapture(store);

  const [activeTab, setActiveTab] = useState<CockpitTab>('trace');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [source, setSource] = useState<TelemetrySource>('virtual');
  const [usbRole, setUsbRole] = useState<BusRole>('vehicle');
  const [wsUrl, setWsUrl] = useState<string>(DEFAULT_WS_URL);
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [showAttitudeHud, setShowAttitudeHud] = useState<boolean>(true);
  const [msgPerSec, setMsgPerSec] = useState<number>(0);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // Time Machine replay
  const [replayFrames, setReplayFrames] = useState<CanFrame[]>([]);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const replayIndexRef = useRef<number>(0);

  const [virtualBus] = useState(() => new VirtualCanBus(DEFS));
  const webSerialRef = useRef<WebSerialCanAdapter | null>(null);
  const webSocketRef = useRef<WebSocketStreamClient | null>(null);
  const rxCounterRef = useRef<number>(0);

  // Pause-on-trigger (fires on the first matching frame after arming).
  const triggerIdRef = useRef<number | null>(null);
  const [triggerArmed, setTriggerArmed] = useState<boolean>(false);
  const pauseRef = useRef<() => void>(() => undefined);

  const ingest = useCallback(
    (frame: CanFrame) => {
      store.ingest(frame);
      rxCounterRef.current += 1;
      if (triggerIdRef.current !== null && frame.id === triggerIdRef.current) {
        triggerIdRef.current = null;
        setTriggerArmed(false);
        pauseRef.current();
      }
    },
    [store]
  );

  const stopLiveSources = useCallback(() => {
    virtualBus.stop();
    webSerialRef.current?.disconnect();
    webSerialRef.current = null;
    webSocketRef.current?.disconnect();
    webSocketRef.current = null;
  }, [virtualBus]);

  const startLiveSource = useCallback(
    (s: TelemetrySource) => {
      setSourceError(null);
      if (s === 'virtual') {
        virtualBus.start(ingest);
      } else if (s === 'webserial') {
        const adapter = new WebSerialCanAdapter(usbRole);
        webSerialRef.current = adapter;
        adapter.connect(115200, ingest).catch((err: Error) => {
          setSourceError(`USB CAN: ${err.message}`);
          setIsRunning(false);
        });
      } else if (s === 'websocket') {
        const client = new WebSocketStreamClient({ url: wsUrl, onFrame: ingest, onStatusChange: setWsStatus });
        webSocketRef.current = client;
        client.connect();
      }
    },
    [virtualBus, ingest, usbRole, wsUrl]
  );

  // Start the default virtual source once; stop everything on unmount.
  useEffect(() => {
    virtualBus.start(ingest);
    return () => virtualBus.stop();
  }, [virtualBus, ingest]);

  const setRunning = useCallback(
    (next: boolean) => {
      setIsRunning(next);
      if (source === 'local_file') return;
      if (next) startLiveSource(source);
      else stopLiveSources();
    },
    [source, startLiveSource, stopLiveSources]
  );

  useEffect(() => {
    pauseRef.current = () => {
      setRunning(false);
      setIsReplaying(false);
    };
  }, [setRunning]);

  const handleSourceChange = (s: TelemetrySource) => {
    stopLiveSources();
    setIsReplaying(false);
    setSource(s);
    if (s === 'local_file') {
      setIsRunning(false);
      setActiveTab('sync');
      return;
    }
    setIsRunning(true);
    startLiveSource(s);
  };

  const handleClear = () => {
    store.clear();
    rxCounterRef.current = 0;
  };

  // ------------------------------------------------------------ replay

  useEffect(() => {
    replayIndexRef.current = replayIndex;
  }, [replayIndex]);

  const handleLogLoaded = (frames: CanFrame[]) => {
    stopLiveSources();
    setIsRunning(false);
    setIsReplaying(false);
    store.clear();
    setReplayFrames(frames);
    setReplayIndex(0);
    replayIndexRef.current = 0;
    setSource('local_file');
    if (frames.length > 0) ingest(frames[0]);
  };

  // Each frame is scheduled after the recorded gap to the previous one, divided by the
  // speed; frames closer than a timer tick are emitted together.
  useEffect(() => {
    if (!isReplaying || replayFrames.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      let idx = replayIndexRef.current;
      const startT = replayFrames[idx]?.timestamp ?? 0;
      while (idx + 1 < replayFrames.length) {
        const gapMs = ((replayFrames[idx + 1].timestamp - startT) * 1000) / playbackSpeed;
        if (gapMs > 4) break;
        idx += 1;
        ingest(replayFrames[idx]);
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
        ingest(replayFrames[idx + 1]);
        step();
      }, waitMs);
    };
    step();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isReplaying, replayFrames, playbackSpeed, ingest]);

  // Forward seeks feed the skipped frames; backward seeks rebuild the views from a
  // window before the target, so no view keeps frames from "the future".
  const seekTo = (index: number) => {
    if (index < 0 || index >= replayFrames.length) return;
    const current = replayIndexRef.current;
    if (index > current && index - current <= REPLAY_REBUILD_WINDOW) {
      for (let i = current + 1; i <= index; i++) ingest(replayFrames[i]);
    } else if (index !== current) {
      store.clear();
      for (let i = Math.max(0, index - REPLAY_REBUILD_WINDOW); i <= index; i++) ingest(replayFrames[i]);
    }
    replayIndexRef.current = index;
    setReplayIndex(index);
  };

  // ------------------------------------------------------------ 1 s sampling

  const isReplayingRef = useRef(isReplaying);
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => {
    isReplayingRef.current = isReplaying;
    playbackSpeedRef.current = playbackSpeed;
  }, [isReplaying, playbackSpeed]);

  useEffect(() => {
    let last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const wallSec = (now - last) / 1000;
      last = now;
      store.sampleSecond(wallSec * (isReplayingRef.current ? playbackSpeedRef.current : 1));
      setMsgPerSec(Math.round(rxCounterRef.current / wallSec));
      rxCounterRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, [store]);

  const currentReplayTime = replayFrames[replayIndex]?.timestamp ?? 0;
  const totalReplayDuration = replayFrames[replayFrames.length - 1]?.timestamp ?? 0;
  const canTransmit = source === 'virtual' && isRunning;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-slate-100 font-sans">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isRunning={isRunning}
        onTogglePlay={() => setRunning(!isRunning)}
        onClear={handleClear}
        busLoad={store.busLoad}
        msgPerSec={msgPerSec}
        totalRx={store.totalRx}
        source={source}
        onSourceChange={handleSourceChange}
        usbRole={usbRole}
        onUsbRoleChange={setUsbRole}
        wsUrl={wsUrl}
        onWsUrlChange={setWsUrl}
        wsStatus={wsStatus}
        defsRef={DEFS.ref}
        customDbc={store.customPlatformDbc}
        showAttitudeHud={showAttitudeHud}
        onToggleAttitudeHud={() => setShowAttitudeHud(!showAttitudeHud)}
      />

      {sourceError && (
        <div className="bg-rose-950/60 border-b border-rose-800 text-rose-200 text-xs font-mono px-4 py-1.5 flex justify-between">
          <span>{sourceError}</span>
          <button onClick={() => setSourceError(null)} className="text-rose-300 hover:text-white">
            dismiss
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 overflow-hidden">
          {activeTab === 'trace' && (
            <TracePanel
              store={store}
              triggerArmed={triggerArmed}
              onArmTrigger={(id) => {
                triggerIdRef.current = id;
                setTriggerArmed(id !== null);
              }}
            />
          )}
          {activeTab === 'sniffer' && <SnifferPanel store={store} />}
          {activeTab === 'oscilloscope' && <OscilloscopePanel store={store} />}
          {activeTab === 'uds' && (
            <UdsPanel
              store={store}
              canTransmit={canTransmit}
              onTransmit={(payload) => virtualBus.injectTesterRequest(payload)}
            />
          )}
          {activeTab === 'health' && <HealthPanel store={store} />}
          {activeTab === 'sync' && <SyncPanel store={store} onLogLoaded={handleLogLoaded} />}
        </main>

        {showAttitudeHud && (
          <div className="absolute bottom-4 right-4 z-20 w-80 shadow-2xl">
            <AttitudeGauge store={store} />
          </div>
        )}
      </div>

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
          onScrub={seekTo}
          onStepForward={() => seekTo(replayIndexRef.current + 1)}
          onStepBackward={() => seekTo(replayIndexRef.current - 1)}
          onRestart={() => seekTo(0)}
        />
      )}
    </div>
  );
}

export default App;
