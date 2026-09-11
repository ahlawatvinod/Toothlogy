/**
 * TL-TEST-CSV-001 — the CSV reader used for extraction and district imports.
 */

import { describe, expect, it } from 'vitest';
import { csvRecords, parseCsv } from '@/lib/csv';

describe('csv', () => {
  it('reads quoted fields with commas, doubled quotes and line breaks, in CRLF or LF files', () => {
    const text = '﻿Name,Address,Phone\r\n"Dr. Anil, BDS","12, ""Main"" Road\nRaipur",9827012345\r\nSmile Dental,Station Road,\n\n';
    expect(parseCsv(text)).toEqual([
      ['Name', 'Address', 'Phone'],
      ['Dr. Anil, BDS', '12, "Main" Road\nRaipur', '9827012345'],
      ['Smile Dental', 'Station Road', ''],
    ]);
  });

  it('keys rows by the header and turns empty cells into null', () => {
    expect(csvRecords('State Name,District Name\nChhattisgarh,Raipur\nChhattisgarh,\n')).toEqual([
      { 'State Name': 'Chhattisgarh', 'District Name': 'Raipur' },
      { 'State Name': 'Chhattisgarh', 'District Name': null },
    ]);
    expect(csvRecords('')).toEqual([]);
  });
});
