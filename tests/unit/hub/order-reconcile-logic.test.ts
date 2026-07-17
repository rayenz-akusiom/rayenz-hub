import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ORDER_RECONCILE_SETTINGS } from '@rayenz-hub/shared';
import {
  acquiredCardImageSrc,
  autoAssignedDeckNote,
  buildAssignmentIndex,
  buildAssignmentPlan,
  buildReconcileItems,
  consumedByDeckForCard,
  disabledDecksForReviewRow,
  expandToCopies,
  findCandidatesForName,
  findMaybeboardCandidatesForName,
  slotCountByDeckForCard,
} from '../../../packages/web/src/order-reconcile/assign.ts';
import {
  fetchAllSnapshots,
  fetchColorIdentity,
  fetchDeckSnapshot,
  fetchPrintings,
  loadDeckRegistry,
  parseFolderId,
  printOptionLines,
  readPrintingValue,
  resolveCubeDestinationForCard,
  validateScryfallName,
} from '../../../packages/web/src/order-reconcile/data.ts';
import { getDeckById, itemsForDeck } from '../../../packages/web/src/order-reconcile/helpers.ts';
import { parseInputToAcquired, updateAcquiredField } from '../../../packages/web/src/order-reconcile/input.ts';
import {
  createInitialState,
  getDecision,
  resetSession,
  saveStateProgress,
  setDecision,
} from '../../../packages/web/src/order-reconcile/progress.ts';
import {
  assignDefaultOuts,
  buildDeckImportText,
  cubeMainCardSameName,
  cutOptionImageSrc,
  cutValueFromOpt,
  deckCutOptions,
  deckReconcileComplete,
  defaultCutForItem,
  defaultInImageSrc,
  defaultInPrinting,
  excludeCategories,
  formatCardLabel,
  getNextDeckId,
  printingImageSrc,
  readCutValue,
} from '../../../packages/web/src/order-reconcile/reconcile.ts';
import {
  candidateOptionGroups,
  deckOptionGroups,
  deckOptionTags,
  maybeboardOptionGroups,
} from '../../../packages/web/src/order-reconcile/select-options.ts';
import {
  buildStagingImportText,
  countAcceptedRemovals,
  summarizeDeck,
  summaryCardImageSrc,
} from '../../../packages/web/src/order-reconcile/summary.ts';
import type {
  ItemDecision,
  OrderReconcileDeck,
  OrderReconcileState,
  ReconcileItem,
} from '../../../packages/web/src/order-reconcile/types.ts';
import { STAGING_DECK_ID } from '../../../packages/web/src/order-reconcile/types.ts';
import { loadOrderReconcileProgress } from '../../../packages/web/src/lib/hub-storage.ts';
import * as scryfallCache from '../../../packages/web/src/lib/scryfall-cache.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

function commanderDeck(id: string, name: string): OrderReconcileDeck {
  return {
    deck_id: id,
    deck_name: name,
    deck_snapshot: {
      cards: [
        { name: 'New Card', primary_category: 'Queued In', quantity: 1, set_code: 'nin', collector_number: '1' },
        { name: 'Cut Card', primary_category: 'Queued Out', quantity: 1, set_code: 'nout', collector_number: '1' },
        { name: 'Sol Ring', primary_category: 'Ramp', quantity: 1, set_code: 'cmm', collector_number: '1' },
        { name: 'Stash Me', primary_category: 'Maybeboard', quantity: 1, set_code: 'mb', collector_number: '9' },
      ],
    },
  };
}

function baseState(overrides: Partial<OrderReconcileState> = {}): OrderReconcileState {
  return {
    phase: 'input',
    sessionId: 'test-session',
    settings: { ...DEFAULT_ORDER_RECONCILE_SETTINGS },
    acquiredCards: [],
    copies: [],
    assignments: [],
    needsReview: [],
    decks: [],
    stagingDeck: null,
    reconcileItems: [],
    completedDecks: {},
    activeDeckId: null,
    assignmentIndex: null,
    inputMode: 'list',
    isProxyOrder: false,
    colorIdentityCache: {},
    progress: { decisions: {} },
    statusMessage: '',
    ...overrides,
  };
}

function acceptedDecision(cardName: string): ItemDecision {
  return {
    status: 'accepted',
    accepted: {
      quantity: 1,
      destination_category: 'Ramp',
      card_in: { name: cardName, set_code: 'cmm', collector_number: '1', finish: 'nonfoil' },
      card_out: { name: 'Cut Card', set_code: 'nout', collector_number: '1' },
    },
  };
}

type ArchidektBridge = {
  isAvailable: boolean;
  fetchFolder?: (folderId: number) => Promise<OrderReconcileDeck[]>;
  fetchDeckSnapshot?: (deckId: number) => Promise<unknown>;
};

function installBridge(bridge: ArchidektBridge): void {
  (window as Window & { RayenzArchidektBridge?: ArchidektBridge }).RayenzArchidektBridge = bridge;
}

function clearBridge(): void {
  delete (window as Window & { RayenzArchidektBridge?: ArchidektBridge }).RayenzArchidektBridge;
}

beforeEach(() => {
  resetHubModules();
  clearBridge();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearBridge();
});

describe('data.ts', () => {
  it('parseFolderId extracts folder id from Archidekt URLs', () => {
    expect(parseFolderId('https://archidekt.com/folders/12345/decks')).toBe(12345);
    expect(parseFolderId('')).toBe(null);
    expect(parseFolderId(null)).toBe(null);
    expect(parseFolderId('https://example.com')).toBe(null);
  });

  it('loadDeckRegistry returns custom decks from url list', async () => {
    const decks = await loadDeckRegistry({
      ...DEFAULT_ORDER_RECONCILE_SETTINGS,
      registrySource: 'urls',
      customDeckUrls: 'https://archidekt.com/decks/1\nhttps://archidekt.com/decks/2',
    });
    expect(decks).toHaveLength(2);
    expect(decks[0].deck_id).toBe('custom-0');
    expect(decks[0].archidekt_url).toBe('https://archidekt.com/decks/1');
  });

  it('loadDeckRegistry throws when bridge is missing for folder source', async () => {
    await expect(loadDeckRegistry(DEFAULT_ORDER_RECONCILE_SETTINGS)).rejects.toThrow(/Bridge userscript/);
  });

  it('loadDeckRegistry throws on invalid folder URL', async () => {
    installBridge({ isAvailable: true, fetchFolder: vi.fn() });
    await expect(
      loadDeckRegistry({ ...DEFAULT_ORDER_RECONCILE_SETTINGS, folderUrl: 'https://example.com/bad' }),
    ).rejects.toThrow(/Invalid Archidekt folder URL/);
  });

  it('loadDeckRegistry fetches folder via bridge', async () => {
    const folderDecks = [commanderDeck('d1', 'Fetched Deck')];
    installBridge({
      isAvailable: true,
      fetchFolder: vi.fn(async () => folderDecks),
    });
    const decks = await loadDeckRegistry({
      ...DEFAULT_ORDER_RECONCILE_SETTINGS,
      folderUrl: 'https://archidekt.com/folders/99',
    });
    expect(decks).toEqual(folderDecks);
  });

  it('fetchDeckSnapshot requires bridge and valid deck URL', async () => {
    await expect(fetchDeckSnapshot('https://archidekt.com/decks/123')).rejects.toThrow(/Bridge userscript/);
    installBridge({ isAvailable: true, fetchDeckSnapshot: vi.fn(async () => ({ cards: [] })) });
    await expect(fetchDeckSnapshot('not-a-url')).rejects.toThrow(/Invalid Archidekt URL/);
    const snapshot = await fetchDeckSnapshot('https://archidekt.com/decks/456');
    expect(snapshot).toEqual({ cards: [] });
  });

  it('fetchAllSnapshots loads staging and deck snapshots with progress callbacks', async () => {
    const deckA = { deck_id: 'd1', deck_name: 'Zedruu', archidekt_url: 'https://archidekt.com/decks/1' };
    const deckB = { deck_id: 'd2', deck_name: 'Atraxa', archidekt_url: 'https://archidekt.com/decks/2' };
    installBridge({
      isAvailable: true,
      fetchFolder: vi.fn(async () => [deckA, deckB]),
      fetchDeckSnapshot: vi.fn(async (id: number) => ({ cards: [{ name: 'Deck ' + id }] })),
    });
    const onProgress = vi.fn();
    const onStatus = vi.fn();
    const onFinish = vi.fn();
    const state = baseState({
      settings: {
        ...DEFAULT_ORDER_RECONCILE_SETTINGS,
        folderUrl: 'https://archidekt.com/folders/1',
        stagingDeckUrl: 'https://archidekt.com/decks/999',
      },
    });
    const result = await fetchAllSnapshots(state, { onProgress, onStatus, onFinish });
    expect(result.stagingDeck?.deck_name).toBe('Buy / trade list');
    expect(result.decks).toHaveLength(2);
    expect(result.decks.every((d) => d.deck_snapshot?.cards?.length === 1)).toBe(true);
    expect(result.assignmentIndex?.swapByName).toBeDefined();
    expect(onFinish).toHaveBeenCalledWith('Fetched 2 decks + staging list.');
  });

  it('fetchAllSnapshots reports error via onFinish and rethrows', async () => {
    installBridge({
      isAvailable: true,
      fetchFolder: vi.fn(async () => {
        throw new Error('folder fetch failed');
      }),
    });
    const onFinish = vi.fn();
    const state = baseState({
      settings: { ...DEFAULT_ORDER_RECONCILE_SETTINGS, folderUrl: 'https://archidekt.com/folders/1' },
    });
    await expect(
      fetchAllSnapshots(state, { onProgress: vi.fn(), onStatus: vi.fn(), onFinish }),
    ).rejects.toThrow('folder fetch failed');
    expect(onFinish).toHaveBeenCalledWith('folder fetch failed', 'error');
  });

  it('validateScryfallName checks Scryfall named endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    await expect(validateScryfallName('Sol Ring')).resolves.toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    await expect(validateScryfallName('Not A Card')).resolves.toBe(false);
  });

  it('fetchColorIdentity uses cache and handles fetch outcomes', async () => {
    expect(await fetchColorIdentity('', {})).toEqual({ ci: [], cache: {} });
    const cached: Record<string, string[]> = { 'sol ring': ['C'] };
    expect(await fetchColorIdentity('Sol Ring', cached)).toEqual({ ci: ['C'], cache: cached });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ color_identity: ['U', 'W'] }),
      })),
    );
    const fetched = await fetchColorIdentity('Azorius Charm', {});
    expect(fetched.ci).toEqual(['U', 'W']);
    expect(fetched.cache['azorius charm']).toEqual(['U', 'W']);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await fetchColorIdentity('Missing', {})).toEqual({ ci: [], cache: {} });

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network');
    }));
    expect(await fetchColorIdentity('Broken', {})).toEqual({ ci: [], cache: {} });
  });

  it('resolveCubeDestinationForCard prefers snapshot color identity', async () => {
    const deck: OrderReconcileDeck = {
      deck_id: 'c1',
      deck_name: 'Cube',
      deck_snapshot: {
        cards: [{ name: 'Azorius Card', primary_category: 'Azorius', color_identity: ['W', 'U'] }],
      },
    };
    const fromSnapshot = await resolveCubeDestinationForCard(deck, 'Azorius Card', {});
    expect(fromSnapshot.category).toBe('Azorius');
    expect(fromSnapshot.colorIdentityCache).toEqual({});

    const empty = await resolveCubeDestinationForCard(null, 'X', {});
    expect(empty).toEqual({ category: '', colorIdentityCache: {} });
  });

  it('resolveCubeDestinationForCard falls back to Scryfall color identity', async () => {
    const deck: OrderReconcileDeck = {
      deck_id: 'c1',
      deck_name: 'Cube',
      deck_snapshot: { cards: [{ name: 'Other', primary_category: 'Green' }] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ color_identity: ['G'] }),
      })),
    );
    const resolved = await resolveCubeDestinationForCard(deck, 'Llanowar Elves', {});
    expect(resolved.category).toBe('Green');
    expect(resolved.colorIdentityCache['llanowar elves']).toEqual(['G']);
  });

  it('fetchPrintings delegates to scryfall cache', async () => {
    vi.spyOn(scryfallCache, 'fetchPrintings').mockResolvedValue([
      { id: 'sf-1', name: 'Sol Ring', set: 'cmm', collector_number: '1' },
    ]);
    const printings = await fetchPrintings('Sol Ring');
    expect(printings[0].name).toBe('Sol Ring');
  });

  it('printOptionLines and readPrintingValue handle edge cases', () => {
    expect(printOptionLines({ set_name: 'Commander Masters', collector_number: '1' })).toEqual([
      'COMMANDER MASTERS #1',
    ]);
    expect(printOptionLines({ set: 'cmm' })).toEqual(['CMM']);
    expect(printOptionLines({ name: 'Sol Ring' })).toEqual(['Sol Ring']);
    expect(readPrintingValue('{bad')).toBe(null);
    expect(readPrintingValue(null)).toBe(null);
  });
});

describe('helpers.ts', () => {
  it('getDeckById returns staging deck or deck by id', () => {
    const staging = { deck_id: STAGING_DECK_ID, deck_name: 'Staging' };
    const decks = [commanderDeck('d1', 'Test')];
    expect(getDeckById(STAGING_DECK_ID, decks, staging, STAGING_DECK_ID)).toBe(staging);
    expect(getDeckById('d1', decks, staging, STAGING_DECK_ID)?.deck_name).toBe('Test');
    expect(getDeckById('missing', decks, staging, STAGING_DECK_ID)).toBeUndefined();
  });

  it('itemsForDeck filters reconcile items by deck', () => {
    const items = [
      { deck_id: 'd1', item_id: 'a' },
      { deck_id: 'd2', item_id: 'b' },
      { deck_id: 'd1', item_id: 'c' },
    ] as ReconcileItem[];
    expect(itemsForDeck('d1', items)).toHaveLength(2);
    expect(itemsForDeck('d3', items)).toHaveLength(0);
  });
});

describe('input.ts', () => {
  it('parseInputToAcquired parses list and email modes', () => {
    const fromList = parseInputToAcquired('list', '2x Sol Ring (cmm) #1', '');
    expect(fromList).toHaveLength(1);
    expect(fromList[0].name).toBe('Sol Ring');
    expect(fromList[0].quantity).toBe(2);
    expect(fromList[0].id).toBe('acq-0');

    const fromEmail = parseInputToAcquired('email', '', 'Order confirmation\n1x Lightning Bolt');
    expect(fromEmail.length).toBeGreaterThan(0);
    expect(fromEmail[0].id).toBe('acq-0');
  });

  it('updateAcquiredField updates quantity and string fields', () => {
    const cards = [{ id: 'a', name: 'Sol Ring', quantity: 1, set_code: 'cmm' }];
    expect(updateAcquiredField(cards, 0, 'quantity', '3')[0].quantity).toBe(3);
    expect(updateAcquiredField(cards, 0, 'quantity', 'bad')[0].quantity).toBe(1);
    expect(updateAcquiredField(cards, 0, 'name', 'Mana Crypt')[0].name).toBe('Mana Crypt');
    expect(updateAcquiredField(cards, 0, 'set_code', '')[0].set_code).toBe(null);
    expect(updateAcquiredField(cards, 1, 'name', 'X')).toEqual(cards);
  });
});

describe('progress.ts', () => {
  it('createInitialState normalizes progress missing decisions', () => {
    const date = new Date().toISOString().slice(0, 10);
    localStorage.setItem('rayenz-order-reconcile-session-' + date, JSON.stringify({ phase: 'assign', acquiredCards: [{ name: 'X' }] }));
    const state = createInitialState();
    expect(state.phase).toBe('assign');
    expect(state.progress.decisions).toEqual({});
    expect(state.acquiredCards).toEqual([{ name: 'X' }]);
  });

  it('saveStateProgress persists and reloads session data', () => {
    const state = baseState({
      phase: 'assign',
      assignments: [{ copy_id: 'c1', card_name: 'X', deck_id: 'd1', deck_name: 'D', slot_key: 's', queued_in: { name: 'X' }, paired_out: null, destination_category: '', is_cube: false, maybeboard_entry: null, reason: 'auto' }],
      progress: { decisions: { c1: { status: 'skipped' } } },
      isProxyOrder: true,
    });
    saveStateProgress(state);
    const loaded = loadOrderReconcileProgress(state.sessionId!);
    expect(loaded.phase).toBe('assign');
    expect(loaded.isProxyOrder).toBe(true);
    expect(loaded.assignments).toHaveLength(1);
  });

  it('getDecision, setDecision, and resetSession manage session decisions', () => {
    let state = baseState();
    expect(getDecision(state, 'missing')).toBe(null);
    state = setDecision(state, 'item-1', { status: 'skipped' });
    expect(getDecision(state, 'item-1')).toEqual({ status: 'skipped' });
    state = resetSession({ ...state, phase: 'reconcile', assignments: [{} as never], acquiredCards: [{ name: 'X' }] });
    expect(state.phase).toBe('input');
    expect(state.assignments).toEqual([]);
    expect(state.acquiredCards).toEqual([]);
    expect(state.progress.decisions).toEqual({});
  });
});

describe('assign.ts copy and index helpers', () => {
  it('expandToCopies expands quantity into copy rows', () => {
    const copies = expandToCopies([{ id: 'acq-0', name: 'Sol Ring', quantity: 3 }]);
    expect(copies).toHaveLength(3);
    expect(copies[2].copy_id).toBe('acq-0:2');
  });

  it('buildAssignmentIndex indexes commander swap slots and cube maybeboard', () => {
    const decks = [
      commanderDeck('d1', 'Commander'),
      {
        deck_id: 'c1',
        deck_name: 'Vintage Cube',
        deck_snapshot: {
          cards: [{ name: 'Cube Pick', primary_category: 'Maybeboard', set_code: 'lea', collector_number: '1' }],
        },
      },
    ];
    const state = baseState({ decks });
    expect(findCandidatesForName(state, 'New Card').length).toBeGreaterThan(0);
    // Cubes put maybeboard into swapByName; commander maybeboard uses maybeboardByName.
    expect(findCandidatesForName(state, 'Cube Pick').length).toBeGreaterThan(0);
    expect(findMaybeboardCandidatesForName(state, 'Stash Me').length).toBeGreaterThan(0);
    expect(findCandidatesForName(state, 'Missing')).toEqual([]);
    expect(buildAssignmentIndex(decks).swapByName).toBeDefined();
  });
});

describe('reconcile.ts formatting helpers', () => {
  const reconcileItem = (overrides: Partial<ReconcileItem> = {}): ReconcileItem => ({
    item_id: 'item-1',
    copy_id: 'acq-0:0',
    slot_key: 'slot-1',
    deck_id: 'd1',
    deck_name: 'Test',
    card_name: 'New Card',
    quantity: 1,
    queued_in: { name: 'New Card', set_code: 'nin', collector_number: '1' },
    paired_out: { name: 'Cut Card', set_code: 'nout', collector_number: '1' },
    destination_category: '',
    is_cube: false,
    maybeboard_entry: null,
    acquired_set: 'nin',
    acquired_collector: '1',
    type: 'matched',
    ...overrides,
  });

  it('deckCutOptions and cut/read helpers format values', () => {
    const deck = commanderDeck('d1', 'Test');
    const options = deckCutOptions(deck, null, true);
    expect(options.length).toBeGreaterThan(0);
    const opt = options[0];
    expect(cutValueFromOpt(opt)).toContain(opt.name);
    expect(readCutValue(cutValueFromOpt(opt))?.name).toBe(opt.name);
    expect(formatCardLabel(opt)).toContain(opt.name);
    expect(formatCardLabel({ name: 'No Set' })).toBe('No Set');
  });
});

describe('reconcile.ts', () => {
  const reconcileItem = (overrides: Partial<ReconcileItem> = {}): ReconcileItem => ({
    item_id: 'item-1',
    copy_id: 'acq-0:0',
    slot_key: 'slot-1',
    deck_id: 'd1',
    deck_name: 'Test',
    card_name: 'New Card',
    quantity: 1,
    queued_in: { name: 'New Card', set_code: 'nin', collector_number: '1' },
    paired_out: { name: 'Cut Card', set_code: 'nout', collector_number: '1' },
    destination_category: '',
    is_cube: false,
    maybeboard_entry: null,
    acquired_set: 'nin',
    acquired_collector: '1',
    type: 'matched',
    ...overrides,
  });

  it('excludeCategories marks swap and protected categories', () => {
    const excluded = excludeCategories();
    expect(excluded['Queued In']).toBe(true);
    expect(excluded['Queued Out']).toBe(true);
    expect(excluded.Maybeboard).toBe(true);
  });

  it('cubeMainCardSameName finds main-deck same-name cards in cubes', () => {
    const cube: OrderReconcileDeck = {
      deck_id: 'c1',
      deck_name: 'Vintage Cube',
      deck_snapshot: {
        cards: [
          { name: 'Lightning Bolt', primary_category: 'Red', set_code: 'lea', collector_number: '1' },
          { name: 'Stash', primary_category: 'Maybeboard' },
        ],
      },
    };
    expect(cubeMainCardSameName(cube, 'Lightning Bolt')).toEqual({
      name: 'Lightning Bolt',
      set_code: 'lea',
      collector_number: '1',
    });
    expect(cubeMainCardSameName(cube, 'Stash')).toBe(null);
    expect(cubeMainCardSameName(null, 'X')).toBe(null);
  });

  it('defaultInImageSrc and defaultInPrinting prefer maybeboard, queue, and acquired printings', () => {
    const cubeMb = reconcileItem({
      is_cube: true,
      maybeboard_entry: { name: 'Bolt', set_code: 'lea', collector_number: '161', quantity: 1 },
    });
    expect(defaultInImageSrc(cubeMb)).toContain('lea');
    expect(defaultInPrinting(cubeMb).set_code).toBe('lea');

    const queued = reconcileItem({
      is_cube: false,
      maybeboard_entry: null,
      queued_in: { name: 'New Card', set_code: 'nin', collector_number: '2' },
    });
    expect(defaultInPrinting(queued).collector_number).toBe('2');

    const bare = reconcileItem({
      queued_in: null,
      acquired_set: null,
      acquired_collector: null,
    });
    expect(defaultInPrinting(bare)).toEqual({
      name: 'New Card',
      set_code: null,
      collector_number: null,
      finish: 'nonfoil',
    });
  });

  it('assignDefaultOuts walks the out queue when paired_out is absent', () => {
    const deck: OrderReconcileDeck = {
      deck_id: 'd1',
      deck_name: 'Test',
      deck_snapshot: {
        cards: [
          { name: 'In One', primary_category: 'Queued In', set_code: 'a', collector_number: '1' },
          { name: 'In Two', primary_category: 'Queued In', set_code: 'b', collector_number: '1' },
          { name: 'Out One', primary_category: 'Queued Out', set_code: 'o1', collector_number: '1' },
          { name: 'Out Two', primary_category: 'Queued Out', set_code: 'o2', collector_number: '1' },
        ],
      },
    };
    const items = [
      reconcileItem({ paired_out: null, card_name: 'In One' }),
      reconcileItem({ item_id: 'item-2', paired_out: null, card_name: 'In Two' }),
    ];
    const withOuts = assignDefaultOuts(deck, items);
    expect(withOuts[0].default_out?.name).toBe('Out One');
    expect(withOuts[1].default_out?.name).toBe('Out Two');
  });

  it('defaultInImageSrc falls back to name when cube maybeboard lacks printing', () => {
    const item = reconcileItem({
      card_name: 'Bolt',
      is_cube: true,
      maybeboard_entry: { name: 'Bolt', quantity: 1 },
      acquired_set: null,
      acquired_collector: null,
    });
    expect(defaultInImageSrc(item)).toContain('Bolt');
  });

  it('assignDefaultOuts pairs outs for commander decks and skips cubes', () => {
    const deck = commanderDeck('d1', 'Test Deck');
    const items = [reconcileItem()];
    const withOut = assignDefaultOuts(deck, items);
    expect(withOut[0].default_out?.name).toBe('Cut Card');

    const cubeItems = assignDefaultOuts({ deck_id: 'c1', deck_name: 'Cube', deck_snapshot: { cards: [] } }, items);
    expect(cubeItems[0].default_out).toBe(null);
  });

  it('defaultCutForItem prefers default_out, paired_out, and cube same-name cuts', () => {
    const deck = commanderDeck('d1', 'Test');
    const withDefault = reconcileItem({ default_out: { name: 'Sol Ring' } });
    expect(defaultCutForItem(withDefault, deck)?.name).toBe('Sol Ring');
    expect(defaultCutForItem(reconcileItem({ default_out: null }), deck)?.name).toBe('Cut Card');

    const cube: OrderReconcileDeck = {
      deck_id: 'c1',
      deck_name: 'Cube',
      deck_snapshot: { cards: [{ name: 'New Card', primary_category: 'Red', set_code: 'x', collector_number: '1' }] },
    };
    expect(defaultCutForItem(reconcileItem({ is_cube: true, paired_out: null }), cube)?.name).toBe('New Card');
    expect(defaultCutForItem(reconcileItem({ is_cube: true, paired_out: null, card_name: 'Unknown' }), cube)).toBe(null);
  });

  it('cutOptionImageSrc and printingImageSrc build scryfall image URLs', () => {
    expect(cutOptionImageSrc({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })).toContain('cmm');
    expect(cutOptionImageSrc({ name: 'No Set' })).toBe('');
    expect(printingImageSrc({ name: 'X', scryfall_id: 'abc' })).toContain('abc');
    expect(printingImageSrc({ name: 'X', set_code: 'cmm', collector_number: '1' })).toContain('cmm');
    expect(printingImageSrc({ name: 'Sol Ring' })).toContain('Sol');
    expect(printingImageSrc(null)).toBe('');
  });

  it('buildDeckImportText and deckReconcileComplete delegate to export helpers', () => {
    const deck = commanderDeck('d1', 'Test Deck');
    const items = [reconcileItem()];
    const getDecisionFn = () => acceptedDecision('New Card');
    const importText = buildDeckImportText(deck, items, getDecisionFn, false);
    expect(importText).toContain('New Card');
    const status = deckReconcileComplete(items, getDecisionFn);
    expect(status.total).toBe(1);
  });

  it('getNextDeckId returns next pending deck or staging', () => {
    const state = baseState({
      decks: [commanderDeck('d1', 'A'), commanderDeck('d2', 'B')],
      reconcileItems: [
        reconcileItem({ deck_id: 'd1' }),
        reconcileItem({ item_id: 'item-2', deck_id: 'd2' }),
      ],
      completedDecks: { d1: true },
    });
    expect(getNextDeckId(state)).toEqual({ phase: 'reconcile', activeDeckId: 'd2' });

    const allDone = { ...state, completedDecks: { d1: true, d2: true } };
    expect(getNextDeckId(allDone)).toEqual({ phase: 'staging', activeDeckId: STAGING_DECK_ID });
  });
});

describe('summary.ts', () => {
  it('summaryCardImageSrc prefers printing over name lookup', () => {
    expect(summaryCardImageSrc(null)).toBe('');
    expect(summaryCardImageSrc({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })).toContain('cmm');
    expect(summaryCardImageSrc({ name: 'Sol Ring' })).toContain('Sol');
  });

  it('summarizeDeck, buildStagingImportText, and countAcceptedRemovals use decisions', () => {
    const deck = commanderDeck('d1', 'Test Deck');
    const item = {
      item_id: 'item-1',
      slot_key: 'slot',
      deck_id: 'd1',
    } as ReconcileItem;
    const getDecisionFn = () => acceptedDecision('New Card');
    const summary = summarizeDeck(deck, [item], getDecisionFn);
    expect(summary.ins).toHaveLength(1);
    expect(summary.outs).toHaveLength(1);

    const staging: OrderReconcileDeck = {
      deck_id: STAGING_DECK_ID,
      deck_name: 'Buy / trade list',
      deck_snapshot: { cards: [{ name: 'New Card', primary_category: 'Buy list', quantity: 1 }] },
    };
    const importText = buildStagingImportText(staging, [item], getDecisionFn);
    expect(typeof importText).toBe('string');
    expect(countAcceptedRemovals([item], getDecisionFn)).toBe(1);
    expect(buildStagingImportText(null, [], getDecisionFn)).toBe('');
    expect(summarizeDeck(deck, [item], () => ({ status: 'skipped' })).ins).toEqual([]);
  });
});

describe('buildAssignmentPlan edge cases', () => {
  it('routes unmatched cards to needs-review', async () => {
    const state = baseState({
      decks: [commanderDeck('d1', 'Test')],
      acquiredCards: [{ id: 'acq-0', name: 'Random Card', quantity: 1 }],
    });
    const plan = await buildAssignmentPlan(state);
    expect(plan.assignments).toHaveLength(0);
    expect(plan.needsReview).toHaveLength(1);
    expect(plan.needsReview![0].reason).toBe('unmatched');
  });

  it('routes extra copies when demand is saturated', async () => {
    const state = baseState({
      decks: [commanderDeck('d1', 'Test')],
      acquiredCards: [{ id: 'acq-0', name: 'New Card', quantity: 2 }],
    });
    const plan = await buildAssignmentPlan(state);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.needsReview).toHaveLength(1);
    expect(plan.needsReview![0].reason).toBe('extra');
  });

  it('creates conflict rows when copies are fewer than deck demand', async () => {
    const deckA = commanderDeck('d1', 'Deck A');
    const deckB = {
      ...commanderDeck('d2', 'Deck B'),
      deck_snapshot: {
        cards: [
          { name: 'Shared Card', primary_category: 'Queued In', set_code: 'a', collector_number: '1' },
          { name: 'Cut A', primary_category: 'Queued Out', set_code: 'a', collector_number: '2' },
        ],
      },
    };
    deckA.deck_snapshot!.cards![0].name = 'Shared Card';
    const state = baseState({
      decks: [deckA, deckB],
      acquiredCards: [{ id: 'acq-0', name: 'Shared Card', quantity: 1 }],
    });
    const plan = await buildAssignmentPlan(state);
    expect(plan.assignments).toHaveLength(0);
    expect(plan.needsReview).toHaveLength(1);
    expect(plan.needsReview![0].reason).toBe('conflict');
    expect(plan.needsReview![0].preselected_candidate?.deck_id).toBeTruthy();
  });

  it('indexes cube maybeboard entries as swap candidates', async () => {
    const cube: OrderReconcileDeck = {
      deck_id: 'c1',
      deck_name: 'Vintage Cube',
      deck_snapshot: {
        cards: [{ name: 'Cube Pick', primary_category: 'Maybeboard', set_code: 'lea', collector_number: '1' }],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ color_identity: ['R'] }),
      })),
    );
    const state = baseState({
      decks: [cube],
      acquiredCards: [{ id: 'acq-0', name: 'Cube Pick', quantity: 1 }],
    });
    const plan = await buildAssignmentPlan(state);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments![0].is_cube).toBe(true);
  });
});

describe('assign.ts review helpers', () => {
  it('acquiredCardImageSrc prefers printing over name lookup', () => {
    expect(acquiredCardImageSrc({ copy_id: 'c', acquired_id: 'a', card_name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })).toContain('cmm');
    expect(acquiredCardImageSrc({ copy_id: 'c', acquired_id: 'a', card_name: 'Sol Ring' })).toContain('Sol');
  });

  it('buildReconcileItems merges assignments and resolved needs-review rows', () => {
    const state = baseState({
      copies: [{ copy_id: 'acq-0:0', acquired_id: 'acq-0', card_name: 'New Card', set_code: 'nin', collector_number: '1' }],
      assignments: [
        {
          copy_id: 'acq-0:0',
          card_name: 'New Card',
          deck_id: 'd1',
          deck_name: 'Test',
          slot_key: 'slot-1',
          queued_in: { name: 'New Card' },
          paired_out: null,
          destination_category: '',
          is_cube: false,
          maybeboard_entry: null,
          reason: 'auto',
        },
      ],
      needsReview: [
        {
          copy: { copy_id: 'acq-0:1', acquired_id: 'acq-0', card_name: 'Stash Me' },
          reason: 'maybeboard',
          candidates: [{ deck_id: 'd1', deck_name: 'Test', slot_key: 'mb-1', queued_in: { name: 'Stash Me' }, paired_out: null, is_cube: false, maybeboard_entry: { name: 'Stash Me', quantity: 1 } }],
          assigned_deck_id: 'd1',
          destination_category: '',
        },
      ],
      decks: [commanderDeck('d1', 'Test')],
    });
    const items = buildReconcileItems(state);
    expect(items).toHaveLength(2);
    expect(items[0].acquired_set).toBe('nin');
    expect(items[1].deck_id).toBe('d1');
  });

  it('slotCountByDeckForCard, consumedByDeckForCard, disabledDecksForReviewRow, autoAssignedDeckNote', () => {
    const state = baseState({
      decks: [commanderDeck('d1', 'Deck A'), commanderDeck('d2', 'Deck B')],
      assignmentIndex: null,
      assignments: [{ copy_id: 'c1', card_name: 'New Card', deck_id: 'd1', deck_name: 'Deck A', slot_key: 's1', queued_in: { name: 'New Card' }, paired_out: null, destination_category: '', is_cube: false, maybeboard_entry: null, reason: 'auto' }],
      needsReview: [
        {
          copy: { copy_id: 'c2', acquired_id: 'a', card_name: 'New Card' },
          reason: 'conflict',
          candidates: [
            { deck_id: 'd1', deck_name: 'Deck A', slot_key: 's1', queued_in: { name: 'New Card' }, paired_out: null, is_cube: false, maybeboard_entry: null },
            { deck_id: 'd2', deck_name: 'Deck B', slot_key: 's2', queued_in: { name: 'New Card' }, paired_out: null, is_cube: false, maybeboard_entry: null },
          ],
          assigned_deck_id: 'd2',
          destination_category: '',
        },
      ],
    });
    // Only d1 has a swap slot for New Card in deck snapshots; d2 appears via conflict candidates only.
    state.decks[1] = {
      ...state.decks[1],
      deck_snapshot: {
        cards: [{ name: 'Other Card', primary_category: 'Queued In', set_code: 'x', collector_number: '1' }],
      },
    };
    expect(slotCountByDeckForCard(state, 'New Card')).toEqual({ d1: 1 });
    expect(consumedByDeckForCard(state, 'New Card')).toEqual({ d1: 1, d2: 1 });
    expect(consumedByDeckForCard(state, 'New Card', 0)).toEqual({ d1: 1 });
    const disabled = disabledDecksForReviewRow(state, state.needsReview[0], 0);
    expect(disabled.d1).toBe(true);
    expect(autoAssignedDeckNote(state, 'New Card')).toBe('Deck A');
  });

  it('buildReconcileItems skips rows without deck assignment', () => {
    const state = baseState({
      copies: [],
      assignments: [{ copy_id: 'c1', card_name: 'X', deck_id: '', deck_name: '', slot_key: '', queued_in: { name: 'X' }, paired_out: null, destination_category: '', is_cube: false, maybeboard_entry: null, reason: 'auto' }],
      needsReview: [{ copy: { copy_id: 'c2', acquired_id: 'a', card_name: 'Y' }, reason: 'unmatched', candidates: [], assigned_deck_id: '', destination_category: '' }],
    });
    expect(buildReconcileItems(state)).toEqual([]);
  });

  it('autoAssignedDeckNote dedupes deck names', () => {
    const state = baseState({
      assignments: [
        { copy_id: 'c1', card_name: 'Bolt', deck_id: 'd1', deck_name: 'Deck A', slot_key: 's', queued_in: { name: 'Bolt' }, paired_out: null, destination_category: '', is_cube: false, maybeboard_entry: null, reason: 'auto' },
        { copy_id: 'c2', card_name: 'Bolt', deck_id: 'd1', deck_name: 'Deck A', slot_key: 's2', queued_in: { name: 'Bolt' }, paired_out: null, destination_category: '', is_cube: false, maybeboard_entry: null, reason: 'auto' },
      ],
    });
    expect(autoAssignedDeckNote(state, 'Bolt')).toBe('Deck A');
  });
});

describe('select-options.ts groups', () => {
  it('deckOptionTags marks disabled options', () => {
    const html = deckOptionTags([{ deck_id: 'd1', deck_name: 'Atraxa' }], '', { d1: true });
    expect(html).toContain('disabled');
  });

  it('deckOptionTags marks disabled and selected options', () => {
    const html = deckOptionTags([{ deck_id: 'd1', deck_name: 'Atraxa' }], 'd1', { d1: false, d2: true });
    expect(html).toContain('selected');
    expect(html).not.toContain('disabled');
  });

  it('deckOptionGroups and candidateOptionGroups split cube and commander', () => {
    const decks = [commanderDeck('d1', 'Atraxa'), commanderDeck('c1', 'Legacy Cube')];
    const deckGroups = deckOptionGroups(decks, true, { d1: true });
    expect(deckGroups[0].options[0].label).toContain('leave out');
    expect(deckGroups.some((g) => g.label === 'Cube')).toBe(true);
    expect(deckGroups.some((g) => g.label === 'Commander')).toBe(true);

    const candidates = [
      { deck_id: 'c1', deck_name: 'Legacy Cube', slot_key: 's', queued_in: { name: 'X' }, paired_out: null, is_cube: true, maybeboard_entry: null },
      { deck_id: 'd1', deck_name: 'Atraxa', slot_key: 's2', queued_in: { name: 'X' }, paired_out: null, is_cube: false, maybeboard_entry: null },
    ];
    const candidateGroups = candidateOptionGroups(candidates, { d1: true });
    expect(candidateGroups.find((g) => g.label === 'Commander')?.options[0].disabled).toBe(true);
  });

  it('maybeboardOptionGroups dedupes suggested decks', () => {
    const nr = {
      assigned_deck_id: '',
      candidates: [
        { deck_id: 'd1', deck_name: 'Atraxa' },
        { deck_id: 'd1', deck_name: 'Atraxa' },
      ],
    };
    const groups = maybeboardOptionGroups([commanderDeck('d1', 'Atraxa')], nr as never, {});
    expect(groups.some((g) => g.label === 'Found in maybeboard')).toBe(true);
    const suggested = groups.find((g) => g.label === 'Found in maybeboard');
    expect(suggested?.options).toHaveLength(1);
  });
});
