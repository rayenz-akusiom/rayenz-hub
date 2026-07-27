import { beforeEach, describe, expect, it } from 'vitest';
import {
  markAcquired,
  getAcquired,
  resetAcquisitionStoreForTests,
  acquiredIidSet,
} from '../../../packages/web/src/dailies/acquisition-store.ts';
import {
  buildCatalogIndexes,
  imageKeyFromUrl,
  matchObservation,
  matchObservations,
  normalizeItemName,
  observationsFromBooksReadHtml,
  observationsFromHtmlImages,
  stampPageKeyFromLocation,
} from '../../../packages/web/src/dailies/progress-match.ts';
import { OFFICIAL_DAILIES_LISTS, resolveOfficialWishlists, migrateTrackingLists } from '@rayenz-hub/shared';
import {
  formatSyncResultSummary,
  isHubSyncableListId,
  progressUrlForList,
} from '../../../packages/web/src/dailies/progress-sync.ts';

describe('progress-match', () => {
  it('normalizes image keys from CDN urls (extension stripped)', () => {
    expect(imageKeyFromUrl('https://images.neopets.com/items/foo_bar.gif?x=1')).toBe('foo_bar');
    expect(imageKeyFromUrl('//images.neopets.com/items/food_sardlanket.gif')).toBe('food_sardlanket');
    expect(imageKeyFromUrl('food_sardlanket')).toBe('food_sardlanket');
    expect(imageKeyFromUrl(null)).toBe(null);
  });

  it('normalizeItemName strips punctuation and leading the', () => {
    expect(normalizeItemName("The Wizard's Guide")).toBe('wizards guide');
    expect(normalizeItemName('  Alpha   Book ')).toBe('alpha book');
  });

  it('matches by name then image with description disambiguation', () => {
    const catalog = [
      { itemIid: 1, name: 'Alpha Book', image: 'https://images.neopets.com/items/a.gif', description: 'First' },
      { itemIid: 2, name: 'Beta Book', image: 'https://images.neopets.com/items/a.gif', description: 'Second' },
      { itemIid: 3, name: 'Gamma Food', image: 'https://images.neopets.com/items/g.gif', description: null },
    ];
    const indexes = buildCatalogIndexes(catalog);
    expect(matchObservation({ name: 'Alpha Book' }, indexes)).toBe(1);
    expect(
      matchObservation(
        { imageUrl: 'https://images.neopets.com/items/a.gif', description: 'Second' },
        indexes,
        { preferImage: true },
      ),
    ).toBe(2);
    expect(matchObservation({ imageUrl: 'https://images.neopets.com/items/g.gif' }, indexes, { preferImage: true })).toBe(
      3,
    );
  });

  it('leaves shared images unmatched without description', () => {
    const catalog = [
      { itemIid: 1, name: 'A', image: 'https://images.neopets.com/items/same.gif', description: null },
      { itemIid: 2, name: 'B', image: 'https://images.neopets.com/items/same.gif', description: null },
    ];
    expect(
      matchObservation({ imageUrl: '//images.neopets.com/items/same.gif' }, buildCatalogIndexes(catalog), {
        preferImage: true,
      }),
    ).toBe(null);
  });

  it('collects unmatched observations but ignores chrome-only names', () => {
    const result = matchObservations(
      [{ name: 'Known' }, { name: 'Unknown' }, { name: 'Neopets' }, { name: 'Home' }],
      [{ itemIid: 9, name: 'Known', image: null, description: null }],
    );
    expect(result.matchedIids).toEqual([9]);
    expect(result.unmatched).toHaveLength(1);
    expect(normalizeItemName(result.unmatched[0].name)).toBe('unknown');
  });

  it('parses protocol-relative and unquoted item images', () => {
    const html =
      '<img src="//images.neopets.com/items/food_x.gif" width="80">' +
      '<img src=https://images.neopets.com/items/food_y.gif border=0>' +
      '<img src="https://www.neopets.com/images/header.png">';
    const obs = observationsFromHtmlImages(html);
    expect(obs.map((o) => imageKeyFromUrl(o.imageUrl)).sort()).toEqual(['food_x', 'food_y']);
  });

  it('books parser pairs img with adjacent name and ignores nav links', () => {
    const html = `
      <a href="/">Neopets</a>
      <b>Home</b>
      <td>
        <img src="//images.neopets.com/items/boo_alpha.gif" width="80" height="80" border="0">
        Alpha Book<br>
      </td>
      <td>
        <img src="https://images.neopets.com/items/boo_beta.gif">
        The Beta Scroll
      </td>
    `;
    const obs = observationsFromBooksReadHtml(html);
    expect(obs).toHaveLength(2);
    expect(normalizeItemName(obs[0].name)).toBe('alpha book');
    expect(normalizeItemName(obs[1].name)).toBe('beta scroll');
    expect(obs.some((o) => normalizeItemName(o.name) === 'neopets')).toBe(false);

    const catalog = [
      { itemIid: 1, name: 'Alpha Book', image: 'boo_alpha.gif', description: null },
      { itemIid: 2, name: 'Beta Scroll', image: 'https://images.neopets.com/items/boo_beta.gif', description: null },
    ];
    const matched = matchObservations(obs, catalog);
    expect(matched.matchedIids.sort()).toEqual([1, 2]);
    expect(matched.unmatched).toHaveLength(0);
  });

  it('books parser reads Title: blurb from next td when image cell is times-read only', () => {
    const html = `
      <tr>
        <td align="center" style="border:1px solid black;">
          <img src="//images.neopets.com/items/boo_slorg.gif" width="80" height="80" border="0">
          <br><font size="1">(496)</font>
        </td>
        <td align="center" style="border:1px solid black;">
          The Evil Slorg: &nbsp;  <i>I always thought there was something sinister about Slorgs... now I know...</i>
        </td>
      </tr>
    `;
    const obs = observationsFromBooksReadHtml(html);
    expect(obs).toHaveLength(1);
    expect(normalizeItemName(obs[0].name)).toBe('evil slorg');
    expect(obs[0].name).toBe('The Evil Slorg');
    expect(normalizeItemName(obs[0].name)).not.toBe('496');
    expect(String(obs[0].description)).toMatch(/sinister about Slorgs/i);
    expect(imageKeyFromUrl(obs[0].imageUrl)).toBe('boo_slorg');

    const catalog = [
      {
        itemIid: 63943,
        name: 'The Evil Slorg',
        image: 'https://images.neopets.com/items/boo_slorg.gif',
        description: 'I always thought there was something sinister about Slorgs... now I know...',
      },
      {
        itemIid: 99,
        name: 'Other Slorg Book',
        image: 'https://images.neopets.com/items/boo_slorg.gif',
        description: 'A different blurb entirely',
      },
    ];
    // Name match wins even when image is shared
    const matched = matchObservations(obs, catalog);
    expect(matched.matchedIids).toEqual([63943]);
    expect(matched.unmatched).toHaveLength(0);
  });

  it('stampPageKeyFromLocation keeps path+query', () => {
    expect(stampPageKeyFromLocation('https://www.neopets.com/stamps.phtml?type=album&page=1')).toContain(
      'stamps.phtml',
    );
  });
});

describe('acquisition-store', () => {
  beforeEach(async () => {
    await resetAcquisitionStoreForTests();
  });

  it('marks and reads acquired item iids', async () => {
    await markAcquired('gourmet-food', [10, 20], 'manual');
    const doc = await getAcquired('gourmet-food');
    expect(acquiredIidSet(doc).has(10)).toBe(true);
    expect(acquiredIidSet(doc).has(20)).toBe(true);
    expect(doc.byItemIid['10'].source).toBe('manual');
  });
});

describe('official lists + hub sync policy', () => {
  it('exports four official ItemDB catalogs', () => {
    expect(OFFICIAL_DAILIES_LISTS).toHaveLength(4);
    expect(OFFICIAL_DAILIES_LISTS.every((d) => d.user === 'official')).toBe(true);
    expect(OFFICIAL_DAILIES_LISTS.map((d) => d.slug)).toEqual([
      'gourmet-food',
      'book-award',
      'booktastic-book-award',
      'all-collectibles',
    ]);
  });

  it('resolves overlays and migrates legacy gourmet checklist img', () => {
    const lists = resolveOfficialWishlists({
      wishlists: [
        {
          id: 'gourmet-food',
          label: 'Gourmet Food',
          listUrl: 'https://itemdb.com.br/lists/rayenz/gourmet-food-checklist',
          slug: 'gourmet-food-checklist',
          user: 'rayenz',
          img: 'https://example/g.gif',
        },
      ],
    });
    expect(lists.find((l) => l.id === 'gourmet-food')?.img).toBe('https://example/g.gif');
    expect(lists.find((l) => l.id === 'gourmet-food')?.slug).toBe('gourmet-food');
    const overlays = migrateTrackingLists({
      wishlists: [
        {
          id: 'books-checklist',
          label: 'Books',
          listUrl: 'https://itemdb.com.br/lists/official/book-award',
          slug: 'book-award',
          user: 'official',
        },
      ],
    });
    expect(overlays['books-checklist']?.enabled).not.toBe(false);
  });

  it('forbids hub sync for stamps; allows gourmet/books/booktastic', () => {
    expect(isHubSyncableListId('stamps-wishlist')).toBe(false);
    expect(isHubSyncableListId('gourmet-food')).toBe(true);
    expect(progressUrlForList('stamps-wishlist', 'Pet')).toBe(null);
    expect(progressUrlForList('books-checklist', 'Pet')).toContain('books_read.phtml');
  });

  it('formatSyncResultSummary shows acquired/catalog/remaining/unmatched', () => {
    expect(
      formatSyncResultSummary({
        listId: 'books-checklist',
        ok: true,
        matched: 10,
        unmatched: 2,
        catalogCount: 100,
        acquiredCount: 40,
        remainingCount: 60,
      }, 'Books'),
    ).toBe('Books: acquired 40 / catalog 100 · remaining 60 · unmatched 2');
  });
});
