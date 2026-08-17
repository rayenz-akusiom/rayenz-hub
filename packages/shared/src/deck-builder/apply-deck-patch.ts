import type { CardInstance, DeckDocument, FormalSwapEntry, LookingForEntry } from '../schemas/deck-builder.js';
import {
  DeckPatchApplyError,
  deckPatchHasMutations,
  type DeckPatch,
} from '../schemas/deck-patch.js';
import {
  ensureCategoryDef,
  ensureProxiesCategoryDef,
  removeCardFromDeck,
} from './card-edits.js';
import { moveCardCategory } from './browse.js';
import { normalizeCardQuantities } from './quantities.js';
import { normalizeFormalEntries, removeFormalSwapEntries } from './formal-swaps.js';
import { syncCardsWithLookingFor } from './looking-for.js';
import { upsertOracle } from './card-oracle.js';

function mintId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function applyCardOps(deck: DeckDocument, ops: NonNullable<DeckPatch['cardOps']>): DeckDocument {
  let next = deck;
  for (const op of ops) {
    if (op.op === 'add') {
      const instanceId = op.card.instanceId?.trim() || mintId('c');
      if (next.cards.some((c) => c.instanceId === instanceId)) {
        throw new DeckPatchApplyError(
          `Card instance already exists: ${instanceId}`,
          'UNKNOWN_INSTANCE',
        );
      }
      const primaryCategory = String(op.card.primaryCategory || '').trim() || 'Other';
      const categories =
        op.card.categories?.length > 0
          ? [...op.card.categories]
          : [primaryCategory];
      const instance: CardInstance = {
        instanceId,
        name: op.card.name,
        quantity: op.card.quantity ?? 1,
        primaryCategory,
        categories,
        stack: op.card.stack ?? null,
        setCode: op.card.setCode ?? null,
        collectorNumber: op.card.collectorNumber ?? null,
        scryfallId: op.card.scryfallId ?? null,
        archidektCardId: op.card.archidektCardId ?? null,
        foil: op.card.foil ?? false,
        proxy: op.card.proxy ?? false,
      };
      let cats = ensureCategoryDef(next.categories || [], primaryCategory);
      if (instance.proxy) cats = ensureProxiesCategoryDef(cats);
      const cards = normalizeCardQuantities([...next.cards, instance], next.format, mintId);
      next = {
        ...next,
        cards,
        categories: cats,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }

    if (op.op === 'remove') {
      if (!next.cards.some((c) => c.instanceId === op.instanceId)) {
        throw new DeckPatchApplyError(
          `Unknown card instanceId: ${op.instanceId}`,
          'UNKNOWN_INSTANCE',
        );
      }
      next = removeCardFromDeck(next, op.instanceId);
      continue;
    }

    // update
    const idx = next.cards.findIndex((c) => c.instanceId === op.instanceId);
    if (idx < 0) {
      throw new DeckPatchApplyError(
        `Unknown card instanceId: ${op.instanceId}`,
        'UNKNOWN_INSTANCE',
      );
    }
    const existing = next.cards[idx]!;
    const merged: CardInstance = {
      ...existing,
      ...op.patch,
      instanceId: existing.instanceId,
    };
    // Ensure primary is reflected in categories when primaryCategory changes.
    if (
      op.patch.primaryCategory !== undefined &&
      op.patch.categories === undefined
    ) {
      const primary = merged.primaryCategory;
      merged.categories = [
        primary,
        ...(merged.categories || []).filter((c) => c !== primary),
      ];
    }

    let cards = [...next.cards];
    cards[idx] = merged;
    if (
      op.patch.primaryCategory !== undefined &&
      op.patch.primaryCategory !== existing.primaryCategory
    ) {
      cards = moveCardCategory(
        cards,
        op.instanceId,
        merged.primaryCategory,
        op.patch.stack !== undefined ? merged.stack : existing.stack,
      );
    }

    let categories = next.categories || [];
    categories = ensureCategoryDef(categories, merged.primaryCategory);
    if (merged.proxy) categories = ensureProxiesCategoryDef(categories);

    next = {
      ...next,
      cards: normalizeCardQuantities(cards, next.format, mintId),
      categories,
      updatedAt: new Date().toISOString(),
    };
  }
  return next;
}

function applyFormalSwapOps(
  deck: DeckDocument,
  ops: NonNullable<DeckPatch['formalSwapOps']>,
): DeckDocument {
  let entries = [...(deck.formalSwapEntries || [])];
  for (const op of ops) {
    if (op.op === 'add') {
      const id = op.entry.id?.trim() || mintId('swap');
      if (entries.some((e) => e.id === id)) {
        throw new DeckPatchApplyError(`Formal swap entry already exists: ${id}`, 'UNKNOWN_SWAP_ENTRY');
      }
      const sortIndex =
        op.entry.sortIndex ?? (entries.length ? Math.max(...entries.map((e) => e.sortIndex)) + 1 : 0);
      const entry: FormalSwapEntry = {
        id,
        inInstanceId: op.entry.inInstanceId ?? null,
        outInstanceId: op.entry.outInstanceId ?? null,
        inTargetCategory: op.entry.inTargetCategory ?? null,
        sortIndex,
        notes: op.entry.notes ?? null,
      };
      entries.push(entry);
      continue;
    }
    if (op.op === 'remove') {
      const before = entries.length;
      entries = entries.filter((e) => e.id !== op.id);
      if (entries.length === before) {
        throw new DeckPatchApplyError(`Unknown formal swap entry id: ${op.id}`, 'UNKNOWN_SWAP_ENTRY');
      }
      continue;
    }
    const idx = entries.findIndex((e) => e.id === op.id);
    if (idx < 0) {
      throw new DeckPatchApplyError(`Unknown formal swap entry id: ${op.id}`, 'UNKNOWN_SWAP_ENTRY');
    }
    entries[idx] = { ...entries[idx]!, ...op.patch, id: entries[idx]!.id };
  }
  return removeFormalSwapEntries(deck, normalizeFormalEntries(entries));
}

function applyLookingForOps(
  deck: DeckDocument,
  ops: NonNullable<DeckPatch['lookingForOps']>,
): DeckDocument {
  let entries = [...(deck.lookingForEntries || [])];
  for (const op of ops) {
    if (op.op === 'add') {
      const id = op.entry.id?.trim() || mintId('lf');
      if (entries.some((e) => e.id === id)) {
        throw new DeckPatchApplyError(
          `Looking-for entry already exists: ${id}`,
          'UNKNOWN_LOOKING_FOR',
        );
      }
      const sortIndex =
        op.entry.sortIndex ?? (entries.length ? Math.max(...entries.map((e) => e.sortIndex)) + 1 : 0);
      const entry: LookingForEntry = {
        id,
        instanceId: op.entry.instanceId,
        sortIndex,
        notes: op.entry.notes ?? null,
      };
      entries.push(entry);
      continue;
    }
    if (op.op === 'remove') {
      const before = entries.length;
      entries = entries.filter((e) => e.id !== op.id);
      if (entries.length === before) {
        throw new DeckPatchApplyError(
          `Unknown looking-for entry id: ${op.id}`,
          'UNKNOWN_LOOKING_FOR',
        );
      }
      continue;
    }
    const idx = entries.findIndex((e) => e.id === op.id);
    if (idx < 0) {
      throw new DeckPatchApplyError(
        `Unknown looking-for entry id: ${op.id}`,
        'UNKNOWN_LOOKING_FOR',
      );
    }
    entries[idx] = { ...entries[idx]!, ...op.patch, id: entries[idx]!.id };
  }
  return syncCardsWithLookingFor({
    ...deck,
    lookingForEntries: entries,
    updatedAt: new Date().toISOString(),
  }).deck;
}

/**
 * Apply an ops-based deck patch to an existing document.
 * Throws DeckPatchApplyError on empty patch, unknown ids, or expectedUpdatedAt conflict.
 */
export function applyDeckPatch(deck: DeckDocument, patch: DeckPatch): DeckDocument {
  if (!deckPatchHasMutations(patch)) {
    throw new DeckPatchApplyError('Patch must include at least one mutation', 'EMPTY_PATCH');
  }

  if (
    patch.expectedUpdatedAt !== undefined &&
    patch.expectedUpdatedAt !== deck.updatedAt
  ) {
    throw new DeckPatchApplyError(
      `Deck was modified (expected updatedAt ${patch.expectedUpdatedAt}, got ${deck.updatedAt})`,
      'CONFLICT',
    );
  }

  let next: DeckDocument = { ...deck };

  if (patch.name !== undefined) next = { ...next, name: patch.name };
  if (patch.format !== undefined) next = { ...next, format: patch.format };
  if (patch.ownership !== undefined) next = { ...next, ownership: patch.ownership };
  if (patch.archidektId !== undefined) next = { ...next, archidektId: patch.archidektId };
  if (patch.archidektUrl !== undefined) next = { ...next, archidektUrl: patch.archidektUrl };
  if (patch.coverInstanceId !== undefined) {
    next = { ...next, coverInstanceId: patch.coverInstanceId };
  }
  if (patch.browseViewDefault !== undefined) {
    next = { ...next, browseViewDefault: patch.browseViewDefault };
  }
  if (patch.cardLayoutDefault !== undefined) {
    next = { ...next, cardLayoutDefault: patch.cardLayoutDefault };
  }
  if (patch.cardSortDefault !== undefined) {
    next = { ...next, cardSortDefault: patch.cardSortDefault };
  }
  if (patch.lastArchidektSyncAt !== undefined) {
    next = { ...next, lastArchidektSyncAt: patch.lastArchidektSyncAt };
  }
  if (patch.lastArchidektImportAt !== undefined) {
    next = { ...next, lastArchidektImportAt: patch.lastArchidektImportAt };
  }
  if (patch.cubeTargetSize !== undefined) {
    next = { ...next, cubeTargetSize: patch.cubeTargetSize };
  }
  if (patch.categories !== undefined) {
    next = { ...next, categories: patch.categories };
  }
  if (patch.oracle !== undefined) {
    let oracle = { ...(next.oracle || {}) };
    for (const [key, value] of Object.entries(patch.oracle)) {
      oracle = upsertOracle(oracle, key, value);
    }
    next = { ...next, oracle };
  }

  if (patch.cardOps?.length) {
    next = applyCardOps(next, patch.cardOps);
  }
  if (patch.formalSwapOps?.length) {
    next = applyFormalSwapOps(next, patch.formalSwapOps);
  }
  if (patch.lookingForOps?.length) {
    next = applyLookingForOps(next, patch.lookingForOps);
  }

  return {
    ...next,
    updatedAt: new Date().toISOString(),
  };
}
