import { describe, expect, it } from 'vitest';
import { csvRow, escapeCsvField, neutralizeFormula } from '../../src/lib/csv.js';

describe('escapeCsvField', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    ['cr\rlf', '"cr\rlf"'],
    [15.99, '15.99'],
    [null, ''],
    [undefined, ''],
  ] as const)('%j -> %j', (input, expected) => {
    expect(escapeCsvField(input)).toBe(expected);
  });
});

describe('neutralizeFormula', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx', '=HYPERLINK("http://evil","click")'])(
    'prefixes %j with an apostrophe',
    (input) => {
      expect(neutralizeFormula(input)).toBe(`'${input}`);
    },
  );

  it.each(['Netflix', 'iCloud+', 'Plan (=premium)', ''])('leaves %j alone', (input) => {
    expect(neutralizeFormula(input)).toBe(input);
  });
});

describe('csvRow', () => {
  it('joins escaped fields and ends with CRLF', () => {
    expect(csvRow(['Netflix', 'Family, 4 screens', 15.99, null])).toBe(
      'Netflix,"Family, 4 screens",15.99,\r\n',
    );
  });

  it('combines both protections for a hostile name', () => {
    expect(csvRow([neutralizeFormula('=cmd|"/c calc"!A1')])).toBe(`"'=cmd|""/c calc""!A1"\r\n`);
  });
});
