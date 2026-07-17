import { describe, it, expect } from 'vitest';
import {
  colourIdentitySection,
  colourIdentitySectionsFor,
  groupByColourIdentity,
} from '../../../packages/shared/src/deck-builder/colour-identity.ts';

describe('colourIdentitySection', () => {
  it('puts lands in their colour identity section', () => {
    expect(
      colourIdentitySection({
        typeLine: 'Land — Plains Island',
        colourIdentity: ['W', 'U'],
      }),
    ).toBe('Azorius');
  });

  it('puts lands in Lands when separateLands is set', () => {
    expect(
      colourIdentitySection(
        {
          typeLine: 'Land — Plains Island',
          colourIdentity: ['W', 'U'],
        },
        { separateLands: true },
      ),
    ).toBe('Lands');
    expect(
      colourIdentitySection(
        {
          name: 'Forest',
          typeLine: null,
          colourIdentity: [],
        },
        { separateLands: true },
      ),
    ).toBe('Lands');
    // Without type line, non-basic duals still follow CI until enrich/import fills typeLine.
    expect(
      colourIdentitySection(
        {
          typeLine: null,
          colourIdentity: ['W', 'U'],
        },
        { separateLands: true },
      ),
    ).toBe('Azorius');
  });

  it('appends Lands last when separateLands is set', () => {
    const sections = colourIdentitySectionsFor({ separateLands: true });
    expect(sections[sections.length - 1]).toBe('Lands');
    expect(sections[sections.length - 2]).toBe('Colourless');
  });

  it('maps mono colours', () => {
    expect(colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['U'] })).toBe('Blue');
  });

  it('maps guilds, shards, wedges, 4-colour, and Prismatic', () => {
    expect(colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['W', 'U'] })).toBe(
      'Azorius',
    );
    expect(colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['W', 'U', 'G'] })).toBe(
      'Bant',
    );
    expect(colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['W', 'B', 'G'] })).toBe(
      'Abzan',
    );
    expect(
      colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['W', 'U', 'B', 'G'] }),
    ).toBe('Red-less');
    expect(
      colourIdentitySection({
        typeLine: 'Creature',
        colourIdentity: ['W', 'U', 'B', 'R', 'G'],
      }),
    ).toBe('Prismatic');
    expect(colourIdentitySection({ typeLine: 'Artifact', colourIdentity: [] })).toBe('Colourless');
  });

  it('uses Capenna and Ikoria naming when requested', () => {
    const style = { allyThreeColourNames: 'capenna', enemyThreeColourNames: 'ikoria' };
    expect(
      colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['W', 'U', 'G'] }, style),
    ).toBe('Brokers');
    expect(
      colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['W', 'B', 'G'] }, style),
    ).toBe('Indatha');
  });

  it('infers basic land colour when CI is empty', () => {
    expect(
      colourIdentitySection({
        name: 'Forest',
        typeLine: null,
        colourIdentity: [],
      }),
    ).toBe('Green');
    expect(
      colourIdentitySection({
        name: 'Wastes',
        typeLine: 'Basic Land',
        colourIdentity: [],
      }),
    ).toBe('Colourless');
  });

  it('lists Capenna sections when ally style is capenna', () => {
    const sections = colourIdentitySectionsFor({ allyThreeColourNames: 'capenna' });
    expect(sections).toContain('Brokers');
    expect(sections).not.toContain('Bant');
    expect(sections).toContain('Abzan');
  });

  it('groups a cube fixture', async () => {
    const cube = await import('../../fixtures/deck-builder/cube-slice.json');
    const groups = groupByColourIdentity(cube.cards);
    expect(groups.White).toHaveLength(1);
    expect(groups.Azorius).toHaveLength(1);
    expect(groups.Colourless).toHaveLength(1);
  });

  it('groups cube lands separately in spells mode', async () => {
    const cube = await import('../../fixtures/deck-builder/cube-slice.json');
    const groups = groupByColourIdentity(cube.cards, { separateLands: true });
    expect(groups.Azorius || []).toHaveLength(0);
    expect(groups.Lands).toHaveLength(1);
    expect(groups.White).toHaveLength(1);
    expect(groups.Colourless).toHaveLength(1);
  });
});
