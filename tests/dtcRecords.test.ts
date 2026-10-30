import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DEFS } from '../src/defs';
import { decodeDtcExtData, decodeDtcSnapshot } from '../src/services/dtcRecords';

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

describe('D-090 freeze-frame vectors from the pinned defs', () => {
  it('runs every vector in the file', () => {
    expect(vectors.snapshot.length + vectors.ext_data.length + vectors.invalid.length).toBe(16);
  });

  for (const vector of vectors.snapshot) {
    it(`snapshot: ${vector.name}`, () => {
      const expected = {
        ...vector.expect,
        records: vector.expect.records.map((record: any) => ({
          ...record,
          values: record.values.map((value: any) => ({ ...value, data: bytes(value.data) })),
        })),
      };
      const actual = decodeDtcSnapshot(DEFS, bytes(vector.response));
      expect({ ...actual, rest: hex(actual.rest) }).toEqual(expected);
    });
  }

  for (const vector of vectors.ext_data) {
    it(`extended data: ${vector.name}`, () => {
      const actual = decodeDtcExtData(DEFS, bytes(vector.response));
      expect({ ...actual, rest: hex(actual.rest) }).toEqual(vector.expect);
    });
  }

  for (const vector of vectors.invalid) {
    it(`rejects ${vector.decoder}: ${vector.response}`, () => {
      const decode = vector.decoder === 'snapshot' ? decodeDtcSnapshot : decodeDtcExtData;
      expect(() => decode(DEFS, bytes(vector.response))).toThrow();
    });
  }
});
