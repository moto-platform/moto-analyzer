import { Defs } from '../defs/model';
import { decodeDtcExtDataRecords, decodeDtcSnapshotRecords } from './dtcRecords';
import { DtcEntry } from './udsMonitor';

const CSV_HEADER = ['dtc', 'status', 'record_number', 'did', 'name', 'field', 'value', 'unit', 'raw'];

const hexByte = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
const hexBytes = (data: number[]) => data.map(hexByte).join('');
const hexDtc = (dtc: number) => `0x${dtc.toString(16).toUpperCase().padStart(6, '0')}`;
const hexStatus = (status: number) => `0x${hexByte(status)}`;
const hexDid = (did: number) => `0x${did.toString(16).toUpperCase().padStart(4, '0')}`;

const csvCell = (text: string): string => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
const csvRow = (cells: string[]): string => cells.map(csvCell).join(',');

const valueText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

export function dtcReportToJson(defs: Defs, dtcs: DtcEntry[]): string {
  return JSON.stringify(
    {
      ref: defs.ref,
      dtcs: dtcs.map((d) => ({
        dtc: hexDtc(d.dtc),
        status: d.status,
        statusNames: d.statusNames,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        snapshot: d.snapshot ? decodeDtcSnapshotRecords(defs, d.snapshot) : null,
        extData: d.extData ? decodeDtcExtDataRecords(defs, d.extData) : null,
        snapshotRaw: d.snapshot ? hexBytes(d.snapshot) : null,
        extDataRaw: d.extData ? hexBytes(d.extData) : null,
      })),
    },
    null,
    2
  );
}

export function dtcReportToCsv(defs: Defs, dtcs: DtcEntry[]): string {
  const rows: string[] = [CSV_HEADER.join(',')];

  for (const d of dtcs) {
    const dtc = hexDtc(d.dtc);
    const status = hexStatus(d.status);
    const decoded = d.snapshot ? decodeDtcSnapshotRecords(defs, d.snapshot) : null;
    let wrote = false;

    for (const record of decoded?.records ?? []) {
      for (const value of record.values) {
        const def = defs.catalogByDid.get(value.did);
        const did = hexDid(value.did);
        const raw = hexBytes(value.data);
        const fields = def?.fields;
        if (fields && value.value !== null && typeof value.value === 'object') {
          for (const field of fields) {
            rows.push(
              csvRow([dtc, status, String(record.recordNumber), did, value.name, field.name, valueText(value.value[field.name]), field.unit, raw])
            );
            wrote = true;
          }
        } else {
          rows.push(csvRow([dtc, status, String(record.recordNumber), did, value.name, '', valueText(value.value), def?.unit ?? '', raw]));
          wrote = true;
        }
      }
    }

    if (decoded?.stop) {
      rows.push(csvRow([dtc, status, '', '', `stop:${decoded.stop}`, '', '', '', hexBytes(decoded.rest)]));
      wrote = true;
    }
    if (!wrote) rows.push(csvRow([dtc, status, '', '', '', '', '', '', '']));
  }

  return rows.join('\n');
}
