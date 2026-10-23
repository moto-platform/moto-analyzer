# moto-analyzer

Real-time CAN bus analyzer and telemetry cockpit (Web Host & Cross-Platform Desktop) for the [`moto-platform`](https://github.com/moto-platform) motorcycle SDV diagnostics & telemetry architecture.

Benchmarked against automotive OEM and open-source standards: **Vector CANalyzer**, **SavvyCAN**, **Cabana**, and **Foxglove Studio**.

---

## Features

Every CAN ID, signal, scaling, cycle time, E2E DataID, DID, UDS address and tester rule comes from the pinned [`moto-vehicle-defs`](https://github.com/moto-platform/moto-vehicle-defs) copy in `external/moto-vehicle-defs` (Invariant 2). The analyzer has no built-in signal catalog.

- **Trace:** overwrite view per bus and ID (period, frequency, count, changed bytes, E2E status, decoded signals with value-table names) and a chronological log; pause-on-ID trigger; export to Vector ASC, CSV and JSON.
- **Sniffer:** byte heatmap (up, down, direction reversal, static), notch filter, flow view and bit-flip classes by flip rate.
- **Oscilloscope:** any platform signal or vehicle DID, dual cursors with per-channel values, host-side math channels (derivative, difference, product, ratio), CSV and PNG export.
- **UDS observer:** passive decoding of the tester's ISO 14229 conversation on the vehicle bus (ISO-TP reassembly, request/response pairing, DID values with stale state, DTCs with status bits, NRC names), alerts for a request outside `tester_policy` or a functional request (a second tester). The request composer sends only to the simulated ECU.
- **Health:** the D-079 window entry conditions (W1-W5) evaluated on the observed inputs, the E2E supervisor of the platform bus (CRC-8/SAE-J1850, alive counter, timeout) and node heartbeats.
- **Sources:** virtual bus (simulated CL250 vehicle bus with the UDS conversation, platform bus with E2E), log replay at recorded timing, moto-server WebSocket stream (`StreamMessageDto`), and USB SLCAN adapters opened listen-only.

## Quick start

Requires Node.js 18+.

```bash
git submodule update --init      # external/moto-vehicle-defs at the pinned tag
npm install
npm run dev                      # http://localhost:5173
npm test                         # vitest
npm run build
```

To move to a newer defs tag: `git -C external/moto-vehicle-defs fetch --tags && git -C external/moto-vehicle-defs checkout vX.Y.Z`, run the tests, commit the submodule pointer and record the combination in `moto-workspace/manifest.yaml`.

## Architecture

```
external/moto-vehicle-defs ──► src/defs        (DBC + YAML -> typed Defs, bundled at build time)
sources (virtual bus, log replay, WebSocket, SLCAN)
        │ raw frames + bus role (vehicle | platform)
        ▼
src/services/pipeline.ts   timing per ID, decode with the bus's DBC, E2E check
src/services/udsMonitor.ts passive UDS observer of the vehicle bus
        ▼
src/state/captureStore.ts  frames, 50k-frame log ring, sniffer, Float64Array signal rings;
                           UI notified at most every 66 ms, however fast frames arrive
        ▼
src/components/*           Trace, Sniffer, Oscilloscope, UDS, Health, Defs & Logs, HUD
```

- **Throughput:** ingest is O(1) per frame and independent of rendering (`npm test` measures it; about 130k frames/s in CI-class hardware, ~30x a fully loaded 500 kbit/s bus). The scroll log renders only visible rows; the oscilloscope draws on its own animation frames (at most 30 fps for new data) with min-max decimation per pixel column.
- **Invariant 1:** the analyzer never transmits on a vehicle bus. SLCAN adapters open in listen-only mode (`L`); the UDS composer only reaches the simulated ECU.
- **Invariant 2:** decoding uses only the pinned defs. Loading another DBC is possible for analysis and is shown as "custom DBC" in the header.
- **Safety outputs:** the HUD shows the cornering level the safety partition sent (0x023); without a fresh, E2E-valid status it shows UNAVAILABLE, never GREEN.
- **Not** `moto-mcp` (LLM tools) and **not** `moto-ml` (training).

---

## License

MIT, see [LICENSE](LICENSE) (D-036). Copyright (c) 2026 The moto-platform authors.
