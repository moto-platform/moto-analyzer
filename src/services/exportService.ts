import { CanFrame } from '../types/can';

/**
 * Exports captured CAN frames to Vector ASCII (.asc) format
 * Compatible with Vector CANoe, CANalyzer, SavvyCAN, and asammdf
 */
export function exportToVectorAsc(frames: CanFrame[]): string {
  const dateStr = new Date().toUTCString();
  const lines: string[] = [
    `date ${dateStr}`,
    `base hex  timestamps absolute`,
    `internal events logged`,
    `// MOTO ANALYZER - Vector ASC Export`,
    `// Total Frames: ${frames.length}`,
    `------------------------------------------------------------------`,
  ];

  frames.forEach((f) => {
    const timeFormatted = f.timestamp.toFixed(6).padStart(10, ' ');
    const channel = '1';
    const idFormatted = f.isExtended ? `${f.idHex}x` : f.idHex;
    const dir = 'Rx';
    const dlc = `d ${f.dlc}`;
    const dataFormatted = f.data
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');

    lines.push(`${timeFormatted} ${channel}  ${idFormatted.padEnd(8, ' ')} ${dir} ${dlc} ${dataFormatted}`);
  });

  return lines.join('\n');
}

/**
 * Exports captured CAN frames to standard CSV format
 */
export function exportToCsv(frames: CanFrame[]): string {
  const headers = ['Timestamp', 'DeltaMs', 'Bus', 'CAN_ID', 'Name', 'DLC', 'DataHex', 'DecodedSignals'];
  const rows: string[] = [headers.join(',')];

  frames.forEach((f) => {
    const dataHex = f.data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
    const decodedStr = f.decodedSignals
      ? `"${Object.entries(f.decodedSignals).map(([k, v]) => `${k}=${v}`).join('; ')}"`
      : '""';

    const row = [
      f.timestamp.toFixed(4),
      f.deltaMs.toFixed(2),
      f.bus,
      f.idHex,
      `"${f.name || ''}"`,
      f.dlc,
      dataHex,
      decodedStr,
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * Exports captured CAN frames to JSON format
 */
export function exportToJson(frames: CanFrame[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      platform: 'moto-platform',
      frameCount: frames.length,
      frames: frames.map((f) => ({
        timestamp: f.timestamp,
        deltaMs: f.deltaMs,
        bus: f.bus,
        idHex: f.idHex,
        name: f.name,
        dlc: f.dlc,
        data: f.data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
        signals: f.decodedSignals || {},
      })),
    },
    null,
    2
  );
}

/**
 * Triggers a browser download of the generated file
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
