import React from 'react';
import { cn } from './primitives';

export interface KeyHintSpec {
  k: string;
  label: string;
}

/** Bottom 24px key bar: key hints left, status right. */
export const KeyBar: React.FC<{ keys: KeyHintSpec[]; status?: React.ReactNode }> = ({ keys, status }) => (
  <footer className="flex h-keybar shrink-0 items-center whitespace-nowrap border-t border-term-ruleHi bg-term-raise">
    <div className="flex min-w-0 overflow-hidden">
      {keys.map((h) => (
        <span key={h.k + h.label} className="px-[10px] text-term-dim">
          <span className="mr-1 text-term-amber">{h.k}</span>
          {h.label}
        </span>
      ))}
    </div>
    {status !== undefined && <div className="ml-auto flex gap-4 px-[14px] text-term-dim">{status}</div>}
  </footer>
);

export interface HelpGroup {
  title: string;
  keys: KeyHintSpec[];
}

/** `?` overlay listing the shortcuts; closes on Escape, `?` or a click outside. */
export const KeyHelp: React.FC<{ groups: HelpGroup[]; onClose: () => void }> = ({ groups, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-term-bg/70" onClick={onClose}>
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="min-w-[360px] border border-term-ruleHi bg-term-raise"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between border-b border-term-rule px-[14px] pb-2 pt-[10px] font-semibold text-term-hi">
        <span>Keys</span>
        <button type="button" onClick={onClose} className="font-normal text-term-dim hover:text-term-fg">
          <span className="text-term-amber">esc</span> Close
        </button>
      </div>
      {groups.map((g, i) => (
        <div key={g.title} className={cn('px-[14px] py-2', i < groups.length - 1 && 'border-b border-term-rule')}>
          <div className="mb-1 text-term-dim">{g.title}</div>
          <dl className="grid grid-cols-[8ch_1fr] gap-x-3">
            {g.keys.map((h) => (
              <React.Fragment key={h.k}>
                <dt className="text-term-amber">{h.k}</dt>
                <dd className="text-term-fg">{h.label}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ))}
    </div>
  </div>
);
