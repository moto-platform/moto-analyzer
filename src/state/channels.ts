import { CaptureStore } from './captureStore';
import { didKey, signalKey } from '../services/pipeline';

export interface ChannelInfo {
  key: string;
  label: string;
  group: string;
  unit: string;
  min: number;
  max: number;
}

const HIDDEN = new Set(['E2E_CRC', 'E2E_COUNTER']);

/**
 * Plottable channels: every signal of the active platform catalog, every vehicle DID
 * of the defs, and anything else that has history (e.g. from a custom DBC).
 */
export function availableChannels(store: CaptureStore): ChannelInfo[] {
  const out: ChannelInfo[] = [];
  const seen = new Set<string>();
  const add = (c: ChannelInfo) => {
    if (seen.has(c.key)) return;
    seen.add(c.key);
    out.push(c);
  };

  for (const msg of store.pipeline.catalog('platform')) {
    for (const s of msg.signals) {
      if (HIDDEN.has(s.name)) continue;
      add({ key: signalKey(msg.name, s.name), label: `${msg.name}.${s.name}`, group: `platform · ${msg.name}`, unit: s.unit, min: s.min, max: s.max });
    }
  }
  for (const d of store.defs.vehicle.dids) {
    add({ key: didKey(d.name), label: `DID ${d.name}`, group: d.verified ? 'vehicle DID (verified)' : 'vehicle DID (unverified)', unit: d.unit, min: d.min, max: d.max });
  }
  for (const key of store.history.keys()) {
    add({ key, label: key, group: 'other', unit: '', min: 0, max: 0 });
  }
  return out;
}
