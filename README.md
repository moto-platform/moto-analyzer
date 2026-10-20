# moto-analyzer

Real-time CAN bus analyzer and telemetry cockpit (Web Host & Cross-Platform Desktop) for the [`moto-platform`](https://github.com/moto-platform) motorcycle SDV diagnostics & telemetry architecture.

Benchmarked against automotive OEM and open-source standards: **Vector CANalyzer**, **SavvyCAN**, **Cabana**, and **Foxglove Studio**.

---

## Features

- **CAN Bus Monitor & Trace:**
  - **Overwrite Mode (CANalyzer Matrix):** Grouped by CAN ID showing Period (ms), Frequency (Hz), Count, and 8-byte payload with visual change-flash highlighting.
  - **Scroll Mode (Chronological Log):** High-speed virtualized timeline log with microsecond timestamps and deltas.
- **SavvyCAN Byte Sniffer & Heatmap:**
  - Color-coded byte activity heatmap (green: increasing, red: decreasing, yellow: fluctuating, gray: static).
  - Notch filter to suppress repetitive steady-state frames and isolate mystery signals.
- **Multi-Channel Signal Oscilloscope:**
  - 60 FPS Canvas-rendered waveforms with dual measurement cursors (A & B) calculating $\Delta t$ and $\Delta y$.
  - Integrated signal picker linked to decoded DBC definitions.
- **UDS Diagnostic Console & DTC Inspector:**
  - ISO 14229 request/response console (`0x22` ReadDataByIdentifier, `0x19` ReadDTCInformation).
  - Freeze-frame cards and active DTC status mask inspector.
- **Local Synchronization & Standalone Operation:**
  - Syncs directly with local DBC definitions (`platform.dbc`, `cl250.dbc`).
  - Built-in Virtual CAN Streamer simulating realistic Honda CL250 powertrain and chassis dynamics.
  - Replay engine supporting Vector `.asc`, `.csv`, and `.json` log formats.

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Installation & Development

```bash
# Install dependencies
npm install

# Start local Web Host dev server
npm run dev
```

Open your browser at `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview
```

---

## Architecture & System Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                       moto-analyzer                         │
│             (Web Host / Tauri Cross-Platform)               │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │   Modular Automotive UI Cockpit (Dark Theme)        │   │
│   │   • Trace (Overwrite / Scroll)                      │   │
│   │   • SavvyCAN Heatmap & Diff Inspector               │   │
│   │   • Signal Oscilloscope (uPlot Canvas 60 FPS)       │   │
│   │   • UDS Diagnostics & DTC Freeze Frames             │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────┴──────────────────────────┐   │
│   │          Telemetry Engine & Buffer Layer            │   │
│   │   • High-throughput circular ring buffer            │   │
│   │   • DBC Decoder & Local File Synchronizer           │   │
│   │   • Virtual CAN Generator (Honda CL250)             │   │
│   └──────────────────────────┬──────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
   ┌─────────────────────────┐   ┌─────────────────────────┐
   │    Local DBC Files      │   │   Live Backend Stream   │
   │  (platform.dbc / cl250) │   │ (FastAPI /ws/live D-077)│
   └─────────────────────────┘   └─────────────────────────┘
```

- **Not `moto-mcp`:** This is an automotive engineering cockpit, decoupled from the read-only LLM RPC tool server.
- **Not `moto-ml`:** ML training is offline; this tool visualizes raw and decoded vehicle telemetry.
- **Safety Invariant 1:** Passive monitoring only on the vehicle bus. Transmit is restricted to HIL simulation.

---

## License

MIT, see [LICENSE](LICENSE) (D-036). Copyright (c) 2026 The moto-platform authors.
