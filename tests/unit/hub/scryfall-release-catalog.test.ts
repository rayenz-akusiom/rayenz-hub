import { describe, expect, it } from 'vitest';
import {
  buildReleaseCatalog,
  expandBlockSetCodes,
  expandGroupSetCodes,
  familyRootCode,
  getReleaseCatalog,
} from '../../../packages/shared/src/scryfall/index.ts';

describe('release catalog builders', () => {
  const sets = [
    {
      code: 'ltr',
      name: 'The Lord of the Rings: Tales of Middle-earth',
      set_type: 'draft_innovation',
      released_at: '2023-06-23',
      parent_set_code: null,
      block_code: null,
      block: null,
      digital: false,
    },
    {
      code: 'ltc',
      name: 'Tales of Middle-earth Commander',
      set_type: 'commander',
      released_at: '2023-06-23',
      parent_set_code: 'ltr',
      block_code: 'cmd',
      block: 'Commander',
      digital: false,
    },
    {
      code: 'tltr',
      name: 'Tales of Middle-earth Tokens',
      set_type: 'token',
      released_at: '2023-06-23',
      parent_set_code: 'ltr',
      block_code: null,
      block: null,
      digital: false,
    },
    {
      code: 'zen',
      name: 'Zendikar',
      set_type: 'expansion',
      released_at: '2009-10-02',
      parent_set_code: null,
      block_code: 'zen',
      block: 'Zendikar',
      digital: false,
    },
    {
      code: 'wwk',
      name: 'Worldwake',
      set_type: 'expansion',
      released_at: '2010-02-05',
      parent_set_code: null,
      block_code: 'zen',
      block: 'Zendikar',
      digital: false,
    },
  ];

  it('expands group families via parent_set_code', () => {
    const codes = expandGroupSetCodes('ltc', sets);
    expect(codes).toEqual(expect.arrayContaining(['LTR', 'LTC', 'TLTR']));
  });

  it('expands block members by block_code', () => {
    expect(expandBlockSetCodes('zen', sets)).toEqual(['WWK', 'ZEN']);
  });

  it('builds group + block catalog entries', () => {
    const catalog = buildReleaseCatalog(sets, '2026-08-16T00:00:00.000Z');
    expect(catalog.formatVersion).toBe(1);
    const ltr = catalog.releases.find((r) => r.id === 'group:ltr');
    expect(ltr?.name).toMatch(/Middle-earth/i);
    expect(ltr?.set_codes).toEqual(expect.arrayContaining(['LTR', 'LTC']));
    const zen = catalog.releases.find((r) => r.id === 'block:zen');
    expect(zen?.kind).toBe('block');
    expect(zen?.set_codes).toEqual(expect.arrayContaining(['ZEN', 'WWK']));
  });

  it('walks family roots', () => {
    const byCode = new Map(sets.map((s) => [s.code.toUpperCase(), s]));
    expect(familyRootCode('ltc', byCode)).toBe('LTR');
  });
});

describe('getReleaseCatalog', () => {
  it('loads generated catalog with groups and blocks', () => {
    const catalog = getReleaseCatalog();
    expect(catalog.releases.length).toBeGreaterThan(100);
    expect(catalog.releases.some((r) => r.kind === 'group')).toBe(true);
    expect(catalog.releases.some((r) => r.kind === 'block')).toBe(true);
    const hob = catalog.releases.find((r) => r.id === 'group:hob');
    expect(hob?.name).toMatch(/Hobbit/i);
  });
});
