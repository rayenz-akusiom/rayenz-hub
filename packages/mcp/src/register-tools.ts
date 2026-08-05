import { McpServer } from '@modelcontextprotocol/server';
import {
  DeckDocumentSchema,
  DeckPatchSchema,
  ProfileUpsertSchema,
  ReviewProgressUpsertSchema,
  SetPoolUpsertSchema,
  aggregateSwapWants,
  buildArchidektImportText,
  buildArchidektWantsText,
  buildNameQtyWantsText,
  filterAcquireSources,
  filterWantSources,
  type DeckDocument,
  type WantsPriceFilter,
} from '@rayenz-hub/shared';
import * as z from 'zod';
import type { HubClient } from './hub-client.js';
import { HubApiError } from './hub-client.js';
import { profileLookupKeys } from './lib/profile-keys.js';
import { fetchSetCards, resolveSets } from './lib/scryfall.js';
import { listSwapsResolved, summarizeDeck } from './lib/summarize-deck.js';
import { errorResult, jsonResult, textResult } from './lib/text-result.js';

function asDeck(data: unknown): DeckDocument {
  return DeckDocumentSchema.parse(data);
}

async function fetchAllDecks(client: HubClient): Promise<DeckDocument[]> {
  const listed = (await client.listDecks()) as { decks?: Array<{ deckId: string }> } | null;
  const summaries = listed?.decks || [];
  const decks: DeckDocument[] = [];
  for (const s of summaries) {
    const doc = await client.getDeck(s.deckId);
    if (doc) decks.push(asDeck(doc));
  }
  return decks;
}

async function resolveProfileForDeck(client: HubClient, deck: DeckDocument) {
  for (const key of profileLookupKeys(deck)) {
    const profile = await client.getProfile(key);
    if (profile) {
      return { key, profile };
    }
  }
  return null;
}

function catchTool(err: unknown) {
  if (err instanceof HubApiError) {
    return errorResult(err.message);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return errorResult(msg);
}

/** Tool names registered by createHubMcpServer (for tests). */
export const HUB_MCP_TOOL_NAMES = [
  'hub_list_decks',
  'hub_get_deck',
  'hub_put_deck',
  'hub_patch_deck',
  'hub_delete_deck',
  'hub_list_profiles',
  'hub_get_profile',
  'hub_put_profile',
  'hub_resolve_profile',
  'hub_summarize_deck',
  'hub_list_swaps',
  'hub_aggregate_wants',
  'hub_export_wants_text',
  'hub_export_archidekt_import',
  'hub_get_set_pool',
  'hub_put_set_pool',
  'hub_get_review_progress',
  'hub_put_review_progress',
  'scryfall_resolve_sets',
  'scryfall_fetch_set_cards',
] as const;

export function registerHubTools(server: McpServer, client: HubClient): void {
  server.registerTool(
    'hub_list_decks',
    {
      description:
        'List Hub deck library summaries (Hub is source of truth). Returns deckId, name, format, updatedAt, archidektId.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await client.listDecks());
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_get_deck',
    {
      description: 'Get a full Hub DeckDocument by deckId.',
      inputSchema: z.object({
        deckId: z.string().describe('Hub deck id'),
      }),
    },
    async ({ deckId }) => {
      try {
        const doc = await client.getDeck(deckId);
        if (!doc) return errorResult(`Deck not found: ${deckId}`);
        return jsonResult(doc);
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_put_deck',
    {
      description:
        'Create or replace a Hub DeckDocument. Body must satisfy DeckDocumentSchema; path deckId must match document.deckId.',
      inputSchema: z.object({
        deckId: z.string(),
        document: z.record(z.unknown()).describe('Full DeckDocument JSON'),
      }),
    },
    async ({ deckId, document }) => {
      try {
        const parsed = DeckDocumentSchema.parse(document);
        if (parsed.deckId !== deckId) {
          return errorResult(`document.deckId (${parsed.deckId}) must match path deckId (${deckId})`);
        }
        return jsonResult(await client.putDeck(deckId, parsed));
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_patch_deck',
    {
      description:
        'Apply a delta patch to an existing Hub deck (prefer over hub_put_deck for list/queue edits). Supports cardOps (add/remove/update), formalSwapOps, lookingForOps, optional metadata, and expectedUpdatedAt for optimistic concurrency.',
      inputSchema: DeckPatchSchema.extend({
        deckId: z.string().describe('Hub deck id'),
      }),
    },
    async ({ deckId, ...patch }) => {
      try {
        const parsed = DeckPatchSchema.parse(patch);
        return jsonResult(await client.patchDeck(deckId, parsed));
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_delete_deck',
    {
      description: 'Delete a Hub deck by deckId.',
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      try {
        await client.deleteDeck(deckId);
        return jsonResult({ deleted: true, deckId });
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_list_profiles',
    {
      description: 'List Hub deck profiles (metadata; YAML bodies via hub_get_profile).',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await client.listProfiles());
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_get_profile',
    {
      description: 'Get a Hub profile record including YAML by profile/deck key.',
      inputSchema: z.object({
        deckId: z.string().describe('Profile key (usually Hub deckId)'),
      }),
    },
    async ({ deckId }) => {
      try {
        const profile = await client.getProfile(deckId);
        if (!profile) return errorResult(`Profile not found: ${deckId}`);
        return jsonResult(profile);
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_put_profile',
    {
      description:
        'Create or update a Hub profile. Prefer yaml for full skill schema; protectedCards/blockedCards/tags optional.',
      inputSchema: z.object({
        deckId: z.string(),
        deckName: z.string().optional(),
        formatVersion: z.number().int().positive().optional(),
        protectedCards: z.array(z.string()).optional(),
        blockedCards: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        yaml: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { deckId, ...rest } = args;
        const body = ProfileUpsertSchema.parse(rest);
        return jsonResult(await client.putProfile(deckId, body));
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_resolve_profile',
    {
      description:
        'Resolve a profile for a Hub deck by trying deckId, archidektId, and deck-{archidektId} keys.',
      inputSchema: z.object({
        deckId: z.string().optional(),
        archidektId: z.number().nullable().optional(),
      }),
    },
    async ({ deckId, archidektId }) => {
      try {
        let deck: DeckDocument | null = null;
        if (deckId) {
          const raw = await client.getDeck(deckId);
          if (raw) deck = asDeck(raw);
        }
        const keys = profileLookupKeys({
          deckId: deckId || (archidektId != null ? String(archidektId) : ''),
          archidektId: archidektId ?? deck?.archidektId ?? null,
        });
        if (!keys.length) return errorResult('Provide deckId and/or archidektId');
        for (const key of keys) {
          const profile = await client.getProfile(key);
          if (profile) return jsonResult({ key, profile, tried: keys });
        }
        return jsonResult({ key: null, profile: null, tried: keys });
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_summarize_deck',
    {
      description:
        'Compact Hub deck summary for agents: commanders, CI, category counts, formal swaps, looking-for, proxies, linked profile protected cards.',
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      try {
        const raw = await client.getDeck(deckId);
        if (!raw) return errorResult(`Deck not found: ${deckId}`);
        const deck = asDeck(raw);
        const linked = await resolveProfileForDeck(client, deck);
        const protectedCards = Array.isArray(
          (linked?.profile as { protectedCards?: string[] } | null)?.protectedCards,
        )
          ? ((linked!.profile as { protectedCards: string[] }).protectedCards)
          : [];
        return jsonResult(
          summarizeDeck(deck, {
            protectedCards,
            profileKey: linked?.key ?? null,
          }),
        );
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_list_swaps',
    {
      description:
        'List formal swap entries and looking-for entries for a Hub deck with resolved card names.',
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      try {
        const raw = await client.getDeck(deckId);
        if (!raw) return errorResult(`Deck not found: ${deckId}`);
        return jsonResult(listSwapsResolved(asDeck(raw)));
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_aggregate_wants',
    {
      description:
        'Aggregate Queued In / Out / Seeking wants across Hub commander and cube decks. Optional deckIds filter and acquireOnly.',
      inputSchema: z.object({
        deckIds: z.array(z.string()).optional(),
        acquireOnly: z
          .boolean()
          .optional()
          .describe('If true, only seeking + queued_in (default true)'),
      }),
    },
    async ({ deckIds, acquireOnly }) => {
      try {
        let decks = await fetchAllDecks(client);
        if (deckIds?.length) {
          const want = new Set(deckIds);
          decks = decks.filter((d) => want.has(d.deckId));
        }
        let sources = aggregateSwapWants(decks);
        if (acquireOnly !== false) {
          sources = filterAcquireSources(sources);
        }
        return jsonResult({ count: sources.length, sources });
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_export_wants_text',
    {
      description:
        'Export Hub wants as Archidekt-paste text (or plain name/qty). Uses formal swaps + looking-for on Hub decks.',
      inputSchema: z.object({
        deckIds: z.array(z.string()).optional(),
        format: z.enum(['archidekt', 'name_qty']).optional().default('archidekt'),
        minUsd: z.number().nullable().optional(),
        acquireOnly: z.boolean().optional().default(true),
      }),
    },
    async ({ deckIds, format, minUsd, acquireOnly }) => {
      try {
        let decks = await fetchAllDecks(client);
        if (deckIds?.length) {
          const want = new Set(deckIds);
          decks = decks.filter((d) => want.has(d.deckId));
        }
        let sources = aggregateSwapWants(decks);
        if (acquireOnly !== false) sources = filterAcquireSources(sources);
        const filter: WantsPriceFilter = {
          minUsd: minUsd ?? null,
          deckIds: deckIds ?? null,
        };
        sources = filterWantSources(sources, filter);
        const text =
          format === 'name_qty'
            ? buildNameQtyWantsText(sources)
            : buildArchidektWantsText(sources);
        return textResult(text || '(empty)');
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_export_archidekt_import',
    {
      description:
        'Build Archidekt full-deck import text from a Hub deck (mirror/export only; does not write to Archidekt). Applies formal swaps + looking-for to categories.',
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      try {
        const raw = await client.getDeck(deckId);
        if (!raw) return errorResult(`Deck not found: ${deckId}`);
        return textResult(buildArchidektImportText(asDeck(raw)));
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_get_set_pool',
    {
      description: 'Get a cached Scryfall set pool from Hub by codesKey (comma-joined set codes).',
      inputSchema: z.object({ codesKey: z.string() }),
    },
    async ({ codesKey }) => {
      try {
        const pool = await client.getSetPool(codesKey);
        if (!pool) return errorResult(`Set pool not found: ${codesKey}`);
        return jsonResult(pool);
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_put_set_pool',
    {
      description: 'Upsert a Hub set pool (codes, cards, complete flag).',
      inputSchema: z.object({
        codesKey: z.string(),
        codes: z.array(z.string()),
        complete: z.boolean(),
        primaryCode: z.string().optional(),
        setName: z.string().optional(),
        cards: z.array(z.record(z.unknown())).optional(),
        formatVersion: z.number().int().positive().optional(),
      }),
    },
    async (args) => {
      try {
        const { codesKey, ...rest } = args;
        const body = SetPoolUpsertSchema.parse(rest);
        return jsonResult(await client.putSetPool(codesKey, body));
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_get_review_progress',
    {
      description: 'Get Deck Review progress for a suggestions fileId.',
      inputSchema: z.object({ fileId: z.string() }),
    },
    async ({ fileId }) => {
      try {
        const progress = await client.getReviewProgress(fileId);
        if (!progress) return errorResult(`Review progress not found: ${fileId}`);
        return jsonResult(progress);
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'hub_put_review_progress',
    {
      description: 'Upsert Deck Review progress (accept/reject/skip decisions).',
      inputSchema: z.object({
        fileId: z.string(),
        decisions: z.record(z.enum(['accept', 'reject', 'skip'])),
        currentDeckId: z.string().nullable().optional(),
        currentSuggestionIndex: z.record(z.number()).optional(),
        formatVersion: z.number().int().positive().optional(),
      }),
    },
    async (args) => {
      try {
        const { fileId, ...rest } = args;
        const body = ReviewProgressUpsertSchema.parse(rest);
        return jsonResult(await client.putReviewProgress(fileId, body));
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'scryfall_resolve_sets',
    {
      description:
        'Resolve all related set codes for a product (Wizards Collecting article primary; Scryfall parent/child fallback for seed codes).',
      inputSchema: z.object({
        name: z.string().optional().describe('Product name, e.g. Marvel Super Heroes'),
        url: z.string().optional().describe('Wizards Collecting article URL'),
        seedCode: z.string().optional().describe('Seed set code when name unknown'),
        scryfallFallback: z.boolean().optional().default(true),
      }),
    },
    async ({ name, url, seedCode, scryfallFallback }) => {
      try {
        const seedCodes = seedCode ? [seedCode] : null;
        const result = await resolveSets({
          name: name || null,
          url: url || null,
          seedCodes,
          scryfallFallback,
        });
        return jsonResult(result);
      } catch (e) {
        return catchTool(e);
      }
    },
  );

  server.registerTool(
    'scryfall_fetch_set_cards',
    {
      description:
        'Fetch and normalize cards for one or more set codes from Scryfall (dedupe by oracle_id by default).',
      inputSchema: z.object({
        setCodes: z.array(z.string()).min(1),
        dedupe: z.boolean().optional().default(true),
      }),
    },
    async ({ setCodes, dedupe }) => {
      try {
        return jsonResult(await fetchSetCards(setCodes, { dedupe }));
      } catch (e) {
        return catchTool(e);
      }
    },
  );
}

export function createHubMcpServer(client: HubClient): McpServer {
  const server = new McpServer({ name: 'rayenz-hub', version: '1.0.0' });
  registerHubTools(server, client);
  return server;
}
