# CLAUDE.md — moto-analyzer

@.claude/PLATFORM-RULES.md

## What this repo is

Real-time CAN bus analyzer and telemetry cockpit (Web Host & Cross-Platform Desktop) for `moto-platform`.
- Interactive automotive engineering tool benchmarked against Vector CANalyzer, SavvyCAN, Cabana, and Foxglove Studio.
- Modular dockable panels: Bus Monitor / Trace (Overwrite & Scroll modes), SavvyCAN Byte Sniffer heatmap & diff inspector, multi-channel Signal Oscilloscope, and UDS ISO 14229 Diagnostic console.
- Supports local file synchronization (DBC definitions from `moto-vehicle-defs`, log playback for ASC, CSV, JSON) and live streaming.
- Self-contained architecture: includes a high-fidelity virtual CAN generator (Honda CL250 dynamics) for zero-dependency standalone operation.

## What this repo is NOT

- No vehicle bus write access outside designated simulation modes (Platform Invariant 1: passive monitoring).
- Not `moto-mcp` (read-only LLM RPC tool server) — this is a deterministic automotive engineering cockpit.
- Not `moto-ml` (offline ML training) — no machine learning model training here.
- No invented signals or hardcoded CAN IDs (Platform Invariant 2: decoded signals derive strictly from `moto-vehicle-defs`).
- No unauthorized GPS position leak (Platform Invariant 7 / D-076: strictly local / self-hosted auth).

## Build / run

```bash
git submodule update --init   # external/moto-vehicle-defs, pinned to a tag
npm install
npm run dev      # Web Host dev server on http://localhost:5173
npm test         # vitest (tests/), runs against the pinned defs
npm run build    # Production bundle
npm run preview  # Preview production build
```

Defs are read at build time from `external/moto-vehicle-defs` (`src/defs/index.ts`, Vite `?raw` imports); there is no built-in signal catalog.

## Context

- Master Plan: `moto-vehicle-defs/docs/ideas/can-analyzer-master-plan.md`
- DBC Definitions: `external/moto-vehicle-defs/dbc/platform.dbc`, `external/moto-vehicle-defs/dbc/cl250.dbc`
- UDS Specifications: `external/moto-vehicle-defs/uds/vehicle_cl250.yaml`, `uds/iso14229.yaml`, `uds/obd_catalog.yaml`
- D-079 windows and limits: `external/moto-vehicle-defs/derived/cl250_derived.yaml`, `limits/platform_limits.yaml`
- E2E profile: `external/moto-vehicle-defs/docs/e2e-profile.md` (`src/services/e2e.ts`)
