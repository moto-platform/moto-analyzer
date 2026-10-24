# moto-analyzer roadmap

Live task list of the analyzer (2026-10-24). Scope: D-081. Layer split: D-085. Background (market benchmark, functional inventory): `external/moto-vehicle-defs/docs/ideas/can-analyzer-master-plan.md` §2-3; its task list is superseded by this file.

## Boundary (D-085)

The analyzer is the developer's engineering tool. It shows frames, decoded signals, UDS, E2E, timing and recorded sessions, and interprets nothing.

- No LLM, no fault-catalog matching, no rider wording. Those belong to moto-mcp (tools) and the rider layer (Q-037).
- It never transmits on a vehicle bus (invariant 1); the UDS composer reaches only the simulated ECU.
- It decodes only from the pinned defs (invariant 2).

## Built (main)

| Area | What exists |
|---|---|
| Trace | overwrite view per bus and ID, chronological log, E2E status, pause-on-ID, ASC/CSV/JSON export |
| Sniffer | byte heatmap, notch filter, flow view, bit-flip classes |
| Oscilloscope | platform signals and DIDs, dual cursors, math channels, CSV/PNG export |
| UDS observer | ISO-TP reassembly, request/response pairing, DIDs, DTCs with status bits, NRCs, `tester_policy` and second-tester alerts; 0x19 snapshot and extended data shown as raw bytes |
| Health | D-079 windows W1-W5, E2E supervisor, heartbeats |
| HUD | cornering level from 0x023; UNAVAILABLE without a fresh, E2E-valid status |
| Sources | virtual bus (simulated CL250 + platform bus), log replay, SLCAN listen-only, WebSocket client (`StreamMessageDto`) |
| Quality | 53 vitest tests (services), CI on push and PR (analyzer#10) |

## Tasks (in order)

| # | Task | Depends on | Done when |
|---|---|---|---|
| A1 | **Instrument cluster**, rebuilt from defs signals only (RPM, speed, gear estimate, coolant, battery, lean); the Antigravity panel on `ext/antigravity-cluster-tauri` used signals defs does not define | — | every value comes from a defs name; missing or stale inputs show "no data", never a guessed value; `vss-schema-guardian` clean |
| A2 | **Live source end to end:** moto-server `/ws/live` (subscription, per-client ring buffer, slow-consumer drop) feeding the existing WebSocket client | moto-server C4 | analyzer shows the server mock stream live; reconnect after a server restart; server tests for handshake, subscription, disconnect |
| A3 | **Recorded sessions from moto-server** as an engineering source: session list (`GET /sessions`), report summary, signal series (`/sessions/{id}/series`, downsampled) into the oscilloscope and replay | A2, server series endpoint | a stored session opens in the scope and replays; token kept out of the repo and the URL |
| A4 | **Session comparison:** two recordings on a common time or distance axis, overlay and difference per signal | A3 | ride A vs ride B with a difference trace; export CSV |
| A5 | **Decoded freeze frames (D-080):** turn the 0x19 snapshot bytes into named values | the snapshot record layout in defs (CONFIRM it exists; otherwise a `/signal-change` first) | snapshot cards show names and units from defs, raw bytes as fallback |
| A6 | **Desktop (Tauri 2) and native HAL:** SocketCAN with `listen-only on`, SLCAN `L`, candleLight/gs_usb; the HAL refuses any interface it cannot open listen-only | rustup on the dev machine; red zone, Claude only | a test proves the refusal; the shell runs the same frontend; `.dmg`, AppImage/`.deb`, `.msi` from CI |
| A7 | **Offline GPS track** (D-076): local or self-hosted tiles, colour by speed or lean | GPS in recorded sessions | zero requests to third-party hosts (test); coordinates never committed |
| A8 | **Quality:** component tests, a Playwright smoke test of each view, layout persistence, frame ingest in a Web Worker for high-rate logs (Q-036 bursts) | — | smoke test in CI; ingest benchmark unchanged or better |
| A9 | **Repo hygiene:** analyzer CI as a required check (GitHub setting, user); consume per-signal tables from defs instead of parsing the DBC once defs generates them (ISSUES E-20) | defs E-20 item 1 | `src/services/dbcParser.ts` used only for "custom DBC" |

Not in the analyzer (D-085): rider explanations, the "master mechanic", fault-catalog matching, anything that talks to an LLM.
