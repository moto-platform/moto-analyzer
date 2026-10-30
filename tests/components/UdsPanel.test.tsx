// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UdsPanel } from '../../src/components/UdsPanel';
import { createStore } from './helpers';
import { CanFrame } from '../../src/types/can';

afterEach(cleanup);

const REQ = 0x18da10f1;
const RSP = 0x18daf110;

const frame = (id: number, data: number[], t: number): CanFrame => ({
  id,
  idHex: '',
  bus: 'vehicle',
  dlc: 8,
  data,
  timestamp: t,
  deltaMs: 0,
  isExtended: true,
  periodMs: 0,
  frequencyHz: 0,
  count: 1,
});

function ingestIsoTp(store: ReturnType<typeof createStore>, id: number, payload: number[], t: number) {
  const padded = (data: number[]) => [...data, ...Array(8 - data.length).fill(0xaa)];
  if (payload.length <= 7) {
    store.ingest(frame(id, padded([payload.length, ...payload]), t));
    return;
  }
  store.ingest(frame(id, [0x10 | (payload.length >> 8), payload.length & 0xff, ...payload.slice(0, 6)], t));
  let seq = 1;
  for (let i = 6; i < payload.length; i += 7) {
    store.ingest(frame(id, padded([0x20 | seq, ...payload.slice(i, i + 7)]), t + seq / 1000));
    seq++;
  }
}

function exchange(store: ReturnType<typeof createStore>, dtc: number, response: number[], t: number) {
  ingestIsoTp(store, REQ, [0x19, response[1], (dtc >> 16) & 0xff, (dtc >> 8) & 0xff, dtc & 0xff, 0x08], t);
  ingestIsoTp(store, RSP, response, t + 0.01);
}

describe('UdsPanel freeze frames', () => {
  it('shows decoded snapshot values, extended-data kind and a stopped walk', () => {
    const store = createStore();
    exchange(store, 0x123456, [0x59, 0x04, 0x12, 0x34, 0x56, 0x08, 0x01, 0x02, 0xf4, 0x0c, 0x1f, 0x40, 0xf4, 0x05, 0x5a], 0);
    exchange(store, 0x123456, [0x59, 0x06, 0x12, 0x34, 0x56, 0x08, 0x01, 0xaa, 0xbb], 1);
    exchange(store, 0x654321, [0x59, 0x04, 0x65, 0x43, 0x21, 0x08, 0x01, 0x02, 0xf4, 0x0c, 0x1f, 0x40, 0xab, 0xcd, 0x01, 0x02], 2);

    render(<UdsPanel store={store} canTransmit={false} onTransmit={() => ({ ok: true })} />);
    fireEvent.click(screen.getByRole('radio', { name: /dtcs/i }));

    expect(screen.getByText(/snapshot · 1 record · 2 values/)).toBeTruthy();
    expect(document.body.textContent).toContain('ENGINE_SPEED');
    expect(document.body.textContent).toContain('2000 rpm');
    expect(document.body.textContent).toContain('COOLANT_TEMP');
    expect(document.body.textContent).toContain('50 degC');
    expect(screen.getByText(/extended data · record 1 \(manufacturer-specific\)/)).toBeTruthy();
    expect(screen.getByText(/stopped at unknown DID/)).toBeTruthy();
    expect(document.body.textContent).toContain('rest AB CD 01 02');
  });
});
