import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DEFS } from '../src/defs';
import { decodeDtcExtData, decodeDtcSnapshot } from '../src/services/dtcRecords';
import { dtcReportToCsv, dtcReportToJson } from '../src/services/dtcReport';
import { formatDtc, DtcEntry } from '../src/services/udsMonitor';

const vectors = parse(
  readFileSync(new URL('../external/vehicle-defs/tools/codegen/tests/vectors/dtc_records.yaml', import.meta.url), 'utf8')
);

const bytes = (text: string): number[] => {
  const clean = text.replace(/\s/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
};

const hex = (data: number[]): string => data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
const vector = (name: string) => vectors.snapshot.find((v: any) => v.name === name);

const statusNames = (status: number): string[] =>
  DEFS.iso.dtcStatusBits.filter((bit) => status & bit.mask).map((bit) => bit.name);

const entry = (name: string): DtcEntry => {
  const response = bytes(vector(name).response);
  const decoded = decodeDtcSnapshot(DEFS, response);
  const header = 2 + DEFS.iso.dtcRecordReports.dtcAndStatusLength;
  return {
    dtc: decoded.dtc,
    code: formatDtc(decoded.dtc),
    status: decoded.status,
    statusNames: statusNames(decoded.status),
    firstSeen: 1.25,
    lastSeen: 2.5,
    snapshot: response.slice(header),
  };
};

const extEntry = (name: string): DtcEntry => {
  const v = vectors.ext_data.find((x: any) => x.name === name);
  const response = bytes(v.response);
  const decoded = decodeDtcExtData(DEFS, response);
  const header = 2 + DEFS.iso.dtcRecordReports.dtcAndStatusLength;
  return {
    dtc: decoded.dtc,
    code: formatDtc(decoded.dtc),
    status: decoded.status,
    statusNames: statusNames(decoded.status),
    firstSeen: 3,
    lastSeen: 4,
    extData: response.slice(header),
  };
};

describe('DTC report from the pinned defs vectors', () => {
  it('writes one JSON object per DTC with the decoded snapshot, extended data and raw bytes', () => {
    const multi = entry('undefined_number_runs_to_the_end');
    const stopped = entry('unknown_did_stops_the_walk');
    const extended = extEntry('manufacturer_record_first');
    const report = JSON.parse(dtcReportToJson(DEFS, [multi, stopped, extended]));

    expect(report.ref).toBe(DEFS.ref);
    expect(report.dtcs).toHaveLength(3);

    const [m, s, e] = report.dtcs;
    expect(m.dtc).toBe('0x123456');
    expect(m.status).toBe(0x08);
    expect(m.statusNames).toEqual(statusNames(0x08));
    expect(m.firstSeen).toBe(1.25);
    expect(m.lastSeen).toBe(2.5);
    expect(m.snapshot.stop).toBeNull();
    expect(m.snapshot.rest).toEqual([]);
    expect(m.snapshot.records[0].values).toMatchObject([
      { did: 0xf40d, name: 'VEHICLE_SPEED', data: [0x3c], value: 60 },
      {
        did: 0xf403,
        name: 'FUEL_SYSTEM_STATUS',
        data: [0x02, 0x00],
        value: { FUEL_SYSTEM_1: 'CLOSED_LOOP', FUEL_SYSTEM_2: 'NOT_REPORTED' },
      },
    ]);
    expect(m.snapshotRaw).toBe('0000F40D3CF4030200');
    expect(m.extData).toBeNull();
    expect(m.extDataRaw).toBeNull();

    expect(s.snapshot.stop).toBe('unknown_did');
    expect(s.snapshot.rest).toEqual([0xab, 0xcd, 0x01, 0x02]);
    expect(s.snapshot.records[0].values[0]).toMatchObject({ name: 'ENGINE_SPEED', value: 2000 });
    expect(s.snapshotRaw).toBe('0102F40C1F40ABCD0102');

    expect(e.snapshot).toBeNull();
    expect(e.snapshotRaw).toBeNull();
    expect(e.extData).toEqual({ firstRecordNumber: 0x01, firstRecordKind: 'manufacturer', rest: [0x01, 0xaa, 0xbb, 0x92, 0xcc] });
    expect(e.extDataRaw).toBe('01AABB92CC');
  });

  it('writes a CSV row per decoded value, per multi-value field, plus a stop row and a bare DTC row', () => {
    const multi = entry('undefined_number_runs_to_the_end');
    const stopped = entry('unknown_did_stops_the_walk');
    const bare = entry('no_record_stored');
    const rows = dtcReportToCsv(DEFS, [multi, stopped, bare]).split('\n');

    expect(rows[0]).toBe('dtc,status,record_number,did,name,field,value,unit,raw');
    expect(rows).toContain('0x123456,0x08,0,0xF40D,VEHICLE_SPEED,,60,km/h,3C');
    expect(rows).toContain('0x123456,0x08,0,0xF403,FUEL_SYSTEM_STATUS,FUEL_SYSTEM_1,CLOSED_LOOP,,0200');
    expect(rows).toContain('0x123456,0x08,0,0xF403,FUEL_SYSTEM_STATUS,FUEL_SYSTEM_2,NOT_REPORTED,,0200');
    expect(rows).toContain('0x123456,0x08,,,stop:unknown_did,,,,ABCD0102');
    expect(rows).toContain('0x123456,0x0C,,,,,,,');
    expect(rows.filter((row) => row.startsWith('0x123456,0x08') && !row.includes('stop:'))).toHaveLength(4);
  });

  it('writes a CSV row for extended data with the first record kind and the raw records', () => {
    const extended = extEntry('manufacturer_record_first');
    const dtc = `0x${extended.dtc.toString(16).toUpperCase().padStart(6, '0')}`;
    const status = `0x${extended.status.toString(16).toUpperCase().padStart(2, '0')}`;
    const rows = dtcReportToCsv(DEFS, [extended]).split('\n');

    expect(rows).toEqual(['dtc,status,record_number,did,name,field,value,unit,raw', `${dtc},${status},1,,ext:manufacturer,,,,${hex(extended.extData!)}`]);
  });
});
