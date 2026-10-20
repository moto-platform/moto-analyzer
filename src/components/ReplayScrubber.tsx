import React from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RotateCcw, 
  Clock
} from 'lucide-react';

interface ReplayScrubberProps {
  isReplaying: boolean;
  onToggleReplay: () => void;
  currentIndex: number;
  totalFrames: number;
  currentTimeSec: number;
  totalDurationSec: number;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  onScrub: (index: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onRestart: () => void;
}

export const ReplayScrubber: React.FC<ReplayScrubberProps> = ({
  isReplaying,
  onToggleReplay,
  currentIndex,
  totalFrames,
  currentTimeSec,
  totalDurationSec,
  playbackSpeed,
  onSpeedChange,
  onScrub,
  onStepForward,
  onStepBackward,
  onRestart,
}) => {
  const speeds = [0.25, 0.5, 1.0, 2.0, 5.0];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
  };

  return (
    <div className="bg-surface border-t border-surface-border px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3 font-mono text-xs select-none">
      {/* VCR Playback Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onRestart}
          className="p-1.5 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 border border-surface-border transition-colors"
          title="Restart Replay"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onStepBackward}
          className="p-1.5 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 border border-surface-border transition-colors"
          title="Step 1 Frame Backward"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleReplay}
          className={`px-3 py-1.5 rounded font-bold flex items-center gap-1.5 transition-all shadow-sm ${
            isReplaying
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
          }`}
          title={isReplaying ? 'Pause Replay' : 'Play Replay'}
        >
          {isReplaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isReplaying ? 'PAUSE' : 'REPLAY'}</span>
        </button>

        <button
          onClick={onStepForward}
          className="p-1.5 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 border border-surface-border transition-colors"
          title="Step 1 Frame Forward"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        {/* Speed Selector */}
        <div className="flex items-center gap-0.5 ml-2 bg-background border border-surface-border rounded p-0.5">
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                playbackSpeed === s
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Scrubber Timeline Slider */}
      <div className="flex-1 flex items-center gap-3 w-full md:max-w-2xl px-2">
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-cyan-300 font-bold">{formatTime(currentTimeSec)}</span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(1, totalFrames - 1)}
          value={currentIndex}
          onChange={(e) => onScrub(parseInt(e.target.value, 10))}
          className="flex-1 h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-surface-border"
        />

        <div className="text-[11px] text-slate-400">
          <span>{formatTime(totalDurationSec)}</span>
        </div>
      </div>

      {/* Frame Counter Status */}
      <div className="flex items-center gap-2 text-slate-400 text-xs">
        <span>Frame:</span>
        <strong className="text-slate-200">
          {totalFrames > 0 ? currentIndex + 1 : 0}
        </strong>
        <span>/</span>
        <span>{totalFrames}</span>
      </div>
    </div>
  );
};
