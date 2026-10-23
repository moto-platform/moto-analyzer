import React, { useEffect, useRef, useState } from 'react';
import { ByteActivityStatus, ByteSnifferRecord } from '../types/can';
import { CaptureStore } from '../state/captureStore';
import { frameKey } from '../services/capture';
import { classifyBit, BitClass } from '../services/sniffer';
import { ByteCell, KeyValues, Na, Note, Pane, Segmented, TermButton, Toolbar, cn } from '../ui/primitives';
import { useHotkeys } from '../ui/keys';
import { GutterMark, PanelFooter } from '../ui/trace-parts';

interface SnifferPanelProps {
  store: CaptureStore;
}

type SnifferViewMode = 'heatmap' | 'flow';

const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

/** Text tone and trailing glyph of a heatmap byte, per activity. */
const BYTE_LOOK: Record<ByteActivityStatus, { tone: string; glyph: string; label: string }> = {
  inc: { tone: 'text-term-hi', glyph: '↑', label: 'increasing' },
  dec: { tone: 'text-term-hi', glyph: '↓', label: 'decreasing' },
  toggling: { tone: 'text-term-amber', glyph: '~', label: 'reversed direction' },
  static: { tone: 'text-term-faint', glyph: ' ', label: 'static' },
};

/** Bit classes by colour only: static faint, rare dim, active fg, fast hi. */
const BIT_TONE: Record<BitClass, string> = {
  STATIC: 'text-term-faint',
  RARE: 'text-term-dim',
  ACTIVE: 'text-term-fg',
  FAST: 'text-term-hi',
};

/** One heatmap byte: value plus a one-character activity glyph; notched bytes are struck through. */
const HeatByte: React.FC<{ value: number; status: ByteActivityStatus; notched: boolean; changes: number; idx: number; onToggle: () => void }> = ({
  value,
  status,
  notched,
  changes,
  idx,
  onToggle,
}) => {
  const look = BYTE_LOOK[status];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={notched}
      title={`Byte ${idx}: 0x${hex2(value)} (${value}), ${look.label}\nChanges: ${changes}\nClick to ${notched ? 'un-notch' : 'notch (mute)'} this byte`}
      className={cn('inline-block w-[3.4ch] text-left hover:bg-term-row', notched ? 'text-term-faint line-through' : look.tone)}
    >
      {hex2(value)}
      <span className={cn(notched ? 'text-term-faint' : status === 'toggling' ? 'text-term-amber' : 'text-term-dim')}>{notched ? ' ' : look.glyph}</span>
    </button>
  );
};

export const SnifferPanel: React.FC<SnifferPanelProps> = ({ store }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<SnifferViewMode>('heatmap');
  const listRef = useRef<HTMLDivElement | null>(null);

  const snifferMap = store.sniffer;
  const keyOf = (rec: { id: number; bus: string }) => frameKey(rec.bus, rec.id);
  const records = Array.from(snifferMap.values()).sort((a, b) => a.bus.localeCompare(b.bus) || a.id - b.id);
  const selectedRecord = (selectedKey !== null ? snifferMap.get(selectedKey) : undefined) ?? records[0];
  const selKey = selectedRecord ? keyOf(selectedRecord) : null;
  const onToggleNotch = (key: string, idx: number) => store.toggleNotch(key, idx);
  const onInvertNotch = (key: string) => store.invertNotch(key);
  const onClearNotches = () => store.clearNotches();

  const moveSelection = (delta: number) => {
    if (records.length === 0) return;
    const idx = selKey === null ? -1 : records.findIndex((r) => keyOf(r) === selKey);
    const next = idx < 0 ? 0 : Math.min(records.length - 1, Math.max(0, idx + delta));
    setSelectedKey(keyOf(records[next]));
  };

  useEffect(() => {
    if (selectedKey === null || viewMode !== 'heatmap') return;
    listRef.current?.querySelector<HTMLElement>(`[data-row-key="${selectedKey}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey, viewMode]);

  useHotkeys({
    j: () => moveSelection(1),
    k: () => moveSelection(-1),
    ArrowDown: () => moveSelection(1),
    ArrowUp: () => moveSelection(-1),
    v: () => setViewMode((m) => (m === 'heatmap' ? 'flow' : 'heatmap')),
    i: () => {
      if (selKey) onInvertNotch(selKey);
    },
    r: onClearNotches,
  });

  return (
    <div className="flex h-full select-none flex-col bg-term-bg">
      <Toolbar>
        <Segmented<SnifferViewMode>
          label="Sniffer view"
          value={viewMode}
          onChange={setViewMode}
          hotkey="V"
          options={[
            { value: 'heatmap', label: 'heatmap', title: 'Byte activity of every id' },
            { value: 'flow', label: 'flow', title: 'Last frames of the selected id' },
          ]}
        />
        <span className="hidden gap-[14px] text-term-dim xl:inline-flex">
          <span>
            <span className="text-term-hi">3C</span>
            <span>↑</span> inc
          </span>
          <span>
            <span className="text-term-hi">3C</span>
            <span>↓</span> dec
          </span>
          <span>
            <span className="text-term-amber">3C~</span> reversed
          </span>
          <span>
            <span className="text-term-faint">3C</span> static
          </span>
          <span>
            <span className="text-term-faint line-through">3C</span> notched
          </span>
        </span>
        <span className="ml-auto flex items-center gap-[10px]">
          <TermButton hotkey="I" onClick={() => selKey && onInvertNotch(selKey)} disabled={!selKey} title="Invert the notched bytes of the selected id">
            Invert notch
          </TermButton>
          <TermButton hotkey="R" onClick={onClearNotches} title="Remove every notch">
            Reset notches
          </TermButton>
        </span>
      </Toolbar>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto" ref={listRef}>
          {viewMode === 'heatmap' ? (
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col style={{ width: 20 }} />
                <col style={{ width: '13ch' }} />
                <col style={{ width: '24ch' }} />
                {Array.from({ length: 8 }, (_, i) => (
                  <col key={i} style={{ width: '4.4ch' }} />
                ))}
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-term-bg">
                <tr>
                  <th className={TH} aria-label="Marker" />
                  <th className={TH}>id</th>
                  <th className={TH}>name</th>
                  {Array.from({ length: 8 }, (_, i) => (
                    <th key={i} className={TH}>
                      b{i}
                    </th>
                  ))}
                  <th className={cn(TH, 'text-right')}>changes</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-[14px] py-6 italic text-term-dim">
                      No CAN activity yet. Run a source to fill the byte heatmap.
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => {
                    const key = keyOf(rec);
                    const sel = key === selKey;
                    const total = rec.changeCounts.reduce((a, b) => a + b, 0);
                    return (
                      <tr
                        key={key}
                        data-row-key={key}
                        onClick={() => setSelectedKey(key)}
                        className={cn('cursor-pointer align-top', sel ? 'bg-term-row' : 'hover:bg-term-raise')}
                      >
                        <td className={cn(TD, 'pl-[6px] pr-0')}>
                          <GutterMark cursor={sel} />
                        </td>
                        <td className={TD}>
                          <span className="block text-term-hi">{rec.idHex}</span>
                          <span className="block text-term-faint">{rec.bus}</span>
                        </td>
                        <td className={cn(TD, 'overflow-hidden text-ellipsis', rec.bus === 'vehicle' ? 'text-term-dim' : 'text-term-fg')} title={rec.name}>
                          {rec.name || <Na />}
                        </td>
                        {Array.from({ length: 8 }, (_, bIdx) => (
                          <td key={bIdx} className={TD}>
                            {bIdx < rec.currentBytes.length ? (
                              <HeatByte
                                idx={bIdx}
                                value={rec.currentBytes[bIdx] ?? 0}
                                status={rec.byteStatuses[bIdx] ?? 'static'}
                                notched={rec.notchedBytes[bIdx] ?? false}
                                changes={rec.changeCounts[bIdx] ?? 0}
                                onToggle={() => onToggleNotch(key, bIdx)}
                              />
                            ) : (
                              <Na />
                            )}
                          </td>
                        ))}
                        <td className={cn(TD, 'text-right text-term-dim')}>{total.toLocaleString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <FlowView record={selectedRecord} />
          )}
        </div>

        <aside aria-label="Bit transitions" className="w-[300px] shrink-0 overflow-y-auto border-l border-term-rule bg-term-raise">
          <BitPane record={selectedRecord} />
        </aside>
      </div>

      <PanelFooter
        keys={[
          { k: 'j/k', label: 'Select id' },
          { k: 'V', label: viewMode === 'heatmap' ? 'Flow' : 'Heatmap' },
          { k: 'I', label: 'Invert notch' },
          { k: 'R', label: 'Reset notches' },
        ]}
        legend={<span className="text-term-faint">click a byte to notch (mute) it</span>}
      />
    </div>
  );
};

/** Last frames of one id, bytes changed against the frame above highlighted. */
const FlowView: React.FC<{ record?: ByteSnifferRecord }> = ({ record }) => {
  const hist = record?.frameHistory ?? [];
  return (
    <>
      <div className="flex justify-between border-b border-term-rule px-[14px] py-[6px]">
        <span>
          <span className="font-semibold text-term-hi">Flow</span>{' '}
          {record ? (
            <>
              <span className="text-term-hi">{record.idHex}</span> <span className="text-term-fg">{record.name || ''}</span>
            </>
          ) : (
            <Na />
          )}
        </span>
        <span className="text-term-dim">last {hist.length} frames</span>
      </div>
      {hist.length === 0 ? (
        <p className="px-[14px] py-6 italic text-term-dim">No frame history for this id yet.</p>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <colgroup>
            <col style={{ width: '6ch' }} />
            <col style={{ width: '12ch' }} />
            <col style={{ width: '31ch' }} />
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-term-bg">
            <tr>
              <th className={cn(TH, 'text-right')}>#</th>
              <th className={cn(TH, 'text-right')}>time s</th>
              <th className={TH}>data</th>
              <th className={cn(TH, 'text-right')}>changed</th>
            </tr>
          </thead>
          <tbody>
            {hist.map((h, idx) => {
              const prev = idx > 0 ? hist[idx - 1] : null;
              const changed = h.data.map((b, i) => prev !== null && prev.data[i] !== b);
              const n = changed.filter(Boolean).length;
              return (
                <tr key={idx} className="hover:bg-term-raise">
                  <td className={cn(TD, 'text-right text-term-faint')}>{idx + 1}</td>
                  <td className={cn(TD, 'text-right text-term-dim')}>{h.timestamp.toFixed(3)}</td>
                  <td className={TD}>
                    {h.data.map((b, i) => (
                      <ByteCell key={i} value={b} changed={changed[i]} />
                    ))}
                  </td>
                  <td className={cn(TD, 'text-right', n > 0 ? 'text-term-fg' : 'text-term-faint')}>{prev === null ? 'anchor' : n === 0 ? '–' : `${n} B`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
};

/** 64-bit transition matrix of the selected id: bit values and flip counts as a text grid. */
const BitPane: React.FC<{ record?: ByteSnifferRecord }> = ({ record }) => {
  if (!record) {
    return (
      <Pane title="Bit transitions">
        <Note>Select an id to inspect its bit transitions.</Note>
      </Pane>
    );
  }
  return (
    <>
      <Pane title="Bit transitions" aside={record.idHex}>
        <KeyValues
          rows={[
            ['name', record.name || <Na />],
            ['bus', record.bus],
            ['dlc', record.dlc],
            ['frames compared', record.framesCompared.toLocaleString()],
          ]}
        />
        <div className="mt-2 grid grid-cols-2 gap-x-4">
          <span className={BIT_TONE.FAST}>FAST ≥ 45 %</span>
          <span className={BIT_TONE.ACTIVE}>ACTIVE 5–45 %</span>
          <span className={BIT_TONE.RARE}>RARE &lt; 5 %</span>
          <span className={BIT_TONE.STATIC}>STATIC never</span>
        </div>
      </Pane>
      <section className="px-[14px] pb-3 pt-[10px]">
        <div className="grid grid-cols-[5ch_repeat(8,3.4ch)_1fr] text-right">
          <span className="text-left text-term-dim">bit</span>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="text-term-dim">
              {7 - i}
            </span>
          ))}
          <span className="text-term-dim">hex</span>
        </div>
        {record.currentBytes.map((byte, bIdx) => (
          <div key={bIdx} className="border-t border-term-rule py-[2px]">
            <div className="grid grid-cols-[5ch_repeat(8,3.4ch)_1fr] text-right">
              <span className="text-left text-term-dim">b{bIdx}</span>
              {Array.from({ length: 8 }, (_, bitIdx) => {
                const bitPos = 7 - bitIdx;
                const set = (byte & (1 << bitPos)) !== 0;
                const flips = record.bitFlips[bIdx * 8 + bitIdx] ?? 0;
                const cls = classifyBit(flips, record.framesCompared);
                return (
                  <span key={bitIdx} className={BIT_TONE[cls]} title={`Bit ${bIdx}.${bitPos}: ${set ? 1 : 0}, ${flips} transitions, ${cls}`}>
                    {set ? '1' : '0'}
                  </span>
                );
              })}
              <span className="text-term-fg">{hex2(byte)}</span>
            </div>
            <div className="grid grid-cols-[5ch_repeat(8,3.4ch)_1fr] text-right text-term-faint">
              <span className="text-left">flips</span>
              {Array.from({ length: 8 }, (_, bitIdx) => {
                const flips = record.bitFlips[bIdx * 8 + bitIdx] ?? 0;
                return <span key={bitIdx}>{flips > 99 ? '99+' : flips}</span>;
              })}
              <span>{byte}</span>
            </div>
          </div>
        ))}
      </section>
    </>
  );
};

/** Column head: lowercase, dim, 24px, rule-hi underline. */
const TH = 'h-6 whitespace-nowrap border-b border-term-ruleHi px-2 font-normal text-term-dim';
/** Dense cell: 3px 8px, 1px rule underneath. */
const TD = 'whitespace-nowrap border-b border-term-rule px-2 py-[3px]';
