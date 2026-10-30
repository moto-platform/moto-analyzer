import { CatalogDidDef, Defs, DidFieldDef, decodeDid } from '../defs/model';

export type DtcStop = 'unknown_did' | 'variable_length' | 'truncated';
export type DtcExtDataKind = 'manufacturer' | 'obd' | 'reserved';
export type DtcFieldValue = number | string | null;
export type DtcValue = number | string | null | Record<string, DtcFieldValue>;

export interface DtcSnapshotValue {
  did: number;
  name: string;
  data: number[];
  value: DtcValue;
}

export interface DtcSnapshotRecord {
  record_number: number;
  number_of_identifiers: number;
  values: DtcSnapshotValue[];
}

export interface DtcSnapshot {
  dtc: number;
  status: number;
  records: DtcSnapshotRecord[];
  rest: number[];
  stop: DtcStop | null;
}

export interface DtcExtData {
  dtc: number;
  status: number;
  first_record_number: number | null;
  first_record_kind: DtcExtDataKind | null;
  rest: number[];
}

const intFromBytes = (data: number[]): number => data.reduce((value, byte) => value * 256 + byte, 0);

const decodeFields = (fields: DidFieldDef[], data: number[]): Record<string, DtcFieldValue> => {
  const out: Record<string, DtcFieldValue> = {};
  for (const field of fields) {
    let raw = 0;
    for (let i = 0; i < field.size; i++) raw = raw * 256 + (data[field.byte + i] ?? 0);
    raw = Math.floor(raw / 2 ** field.bit) & (2 ** field.bits - 1);
    if (field.notUsedRaw !== undefined && raw === field.notUsedRaw) out[field.name] = null;
    else if (field.enumNames !== undefined) out[field.name] = field.enumNames[raw] ?? raw;
    else if (field.factorNum === field.factorDen && field.offset === 0) out[field.name] = raw;
    else out[field.name] = (raw * field.factorNum) / field.factorDen + field.offset;
  }
  return out;
};

const decodeValue = (def: CatalogDidDef, data: number[]): DtcValue =>
  def.fields ? decodeFields(def.fields, data) : (decodeDid(def, data) ?? null);

export function decodeDtcSnapshotRecords(defs: Defs, records: number[]): Omit<DtcSnapshot, 'dtc' | 'status'> {
  const report = defs.iso.dtcRecordReports.snapshot;
  const decoded: DtcSnapshotRecord[] = [];
  let pos = 0;

  while (pos < records.length) {
    if (pos + report.recordHeaderLength > records.length) {
      return { records: decoded, rest: records.slice(pos), stop: 'truncated' };
    }

    const recordNumber = records[pos];
    const count = records[pos + 1];
    const values: DtcSnapshotValue[] = [];
    decoded.push({ record_number: recordNumber, number_of_identifiers: count, values });
    pos += report.recordHeaderLength;

    const undefinedCount = count === report.undefinedNumberOfIdentifiers;
    while (undefinedCount ? pos < records.length : values.length < count) {
      const dataPos = pos + report.identifierLength;
      if (dataPos > records.length) {
        return { records: decoded, rest: records.slice(pos), stop: 'truncated' };
      }

      const did = intFromBytes(records.slice(pos, dataPos));
      const def = defs.catalogByDid.get(did);
      if (!def) {
        const variableLength = defs.identification.some((ident) => ident.did === did);
        return { records: decoded, rest: records.slice(pos), stop: variableLength ? 'variable_length' : 'unknown_did' };
      }

      const end = dataPos + def.length;
      if (end > records.length) {
        return { records: decoded, rest: records.slice(pos), stop: 'truncated' };
      }
      const data = records.slice(dataPos, end);
      values.push({ did, name: def.name, data, value: decodeValue(def, data) });
      pos = end;
    }
  }

  return { records: decoded, rest: [], stop: null };
}

export function decodeDtcSnapshot(defs: Defs, response: number[]): DtcSnapshot {
  const reports = defs.iso.dtcRecordReports;
  const [sid, subfunction] = reports.snapshot.response;
  const headerLength = 2 + reports.dtcAndStatusLength;
  if (response.length < headerLength || response[0] !== sid || response[1] !== subfunction) {
    throw new Error(`not a ${sid.toString(16).toUpperCase()} ${subfunction.toString(16).toUpperCase()} response with a DTC and its status`);
  }
  const dtcLength = reports.dtcAndStatusLength - 1;
  return {
    dtc: intFromBytes(response.slice(2, 2 + dtcLength)),
    status: response[2 + dtcLength],
    ...decodeDtcSnapshotRecords(defs, response.slice(headerLength)),
  };
}

export function decodeDtcExtDataRecords(defs: Defs, records: number[]): Omit<DtcExtData, 'dtc' | 'status'> {
  const report = defs.iso.dtcRecordReports.extData;
  const first = records[0] ?? null;
  const [manufacturerLow, manufacturerHigh] = report.manufacturerRecords;
  const [obdLow, obdHigh] = report.obdRecords;
  const kind: DtcExtDataKind | null =
    first === null ? null : first >= manufacturerLow && first <= manufacturerHigh ? 'manufacturer' : first >= obdLow && first <= obdHigh ? 'obd' : 'reserved';
  return { first_record_number: first, first_record_kind: kind, rest: records.slice() };
}

export function decodeDtcExtData(defs: Defs, response: number[]): DtcExtData {
  const reports = defs.iso.dtcRecordReports;
  const [sid, subfunction] = reports.extData.response;
  const headerLength = 2 + reports.dtcAndStatusLength;
  if (response.length < headerLength || response[0] !== sid || response[1] !== subfunction) {
    throw new Error(`not a ${sid.toString(16).toUpperCase()} ${subfunction.toString(16).toUpperCase()} response with a DTC and its status`);
  }
  const dtcLength = reports.dtcAndStatusLength - 1;
  return {
    dtc: intFromBytes(response.slice(2, 2 + dtcLength)),
    status: response[2 + dtcLength],
    ...decodeDtcExtDataRecords(defs, response.slice(headerLength)),
  };
}
