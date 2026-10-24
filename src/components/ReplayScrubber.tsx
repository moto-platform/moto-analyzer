import React from 'react';
import { Segmented, TermButton } from '../ui/primitives';

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
  /** Noun for the position counter: frames of a log, samples of a session. */
  itemLabel?: string;
}

const SPEEDS = [0.25, 0.5, 1.0, 2.0, 5.0];

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
};

/** Log replay transport: text buttons, a 1px rule scrubber and speed segments. */
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
  itemLabel = 'frame',
}) => (
  <div className="flex h-tool shrink-0 select-none items-center gap-[22px] whitespace-nowrap border-t border-term-rule bg-term-raise px-[14px]">
    <span className="text-term-dim">replay</span>
    <span className="flex items-center gap-1">
      <TermButton onClick={onRestart} title="Restart replay">
        |&lt; Restart
      </TermButton>
      <TermButton onClick={onStepBackward} title="Step one frame back">
        &lt; Step
      </TermButton>
      <TermButton boxed hotkey="space" onClick={onToggleReplay} title={isReplaying ? 'Pause replay' : 'Play replay'}>
        {isReplaying ? 'Pause' : 'Play'}
      </TermButton>
      <TermButton onClick={onStepForward} title="Step one frame forward">
        Step &gt;
      </TermButton>
    </span>

    <Segmented
      label="Replay speed"
      options={SPEEDS.map((s) => ({ value: s, label: `${s}x` }))}
      value={playbackSpeed}
      onChange={onSpeedChange}
    />

    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="text-term-hi">{formatTime(currentTimeSec)}</span>
      <input
        type="range"
        aria-label="Replay position"
        min={0}
        max={Math.max(1, totalFrames - 1)}
        value={currentIndex}
        onChange={(e) => onScrub(parseInt(e.target.value, 10))}
        className="term-range min-w-0 flex-1"
      />
      <span className="text-term-dim">{formatTime(totalDurationSec)}</span>
    </span>

    <span className="text-term-dim">
      {itemLabel} <span className="text-term-hi">{totalFrames > 0 ? currentIndex + 1 : 0}</span> / {totalFrames}
    </span>
  </div>
);
