import { z } from 'zod';
import {
  BrowseViewSchema,
  CardInstanceSchema,
  CardLayoutSchema,
  CardOracleSchema,
  CardSortModeSchema,
  CategoryDefSchema,
  DeckFormatSchema,
  DeckOwnershipSchema,
  FormalSwapEntrySchema,
  LookingForEntrySchema,
} from './deck-builder.js';

/** Card payload for add ops — instanceId optional (server mints). */
export const CardInstanceAddSchema = CardInstanceSchema.omit({ instanceId: true }).extend({
  instanceId: z.string().min(1).optional(),
});
export type CardInstanceAdd = z.infer<typeof CardInstanceAddSchema>;

/** Partial card fields for update ops (instanceId lives on the op). */
export const CardInstancePatchSchema = CardInstanceSchema.partial().omit({ instanceId: true });
export type CardInstancePatch = z.infer<typeof CardInstancePatchSchema>;

export const CardOpAddSchema = z.object({
  op: z.literal('add'),
  card: CardInstanceAddSchema,
});
export const CardOpRemoveSchema = z.object({
  op: z.literal('remove'),
  instanceId: z.string().min(1),
});
export const CardOpUpdateSchema = z.object({
  op: z.literal('update'),
  instanceId: z.string().min(1),
  patch: CardInstancePatchSchema,
});
export const CardOpSchema = z.discriminatedUnion('op', [
  CardOpAddSchema,
  CardOpRemoveSchema,
  CardOpUpdateSchema,
]);
export type CardOp = z.infer<typeof CardOpSchema>;

/** Formal swap entry for add — id optional (server mints). */
export const FormalSwapEntryAddSchema = FormalSwapEntrySchema.omit({ id: true }).extend({
  id: z.string().min(1).optional(),
});
export const FormalSwapEntryPatchSchema = FormalSwapEntrySchema.partial().omit({ id: true });

export const FormalSwapOpAddSchema = z.object({
  op: z.literal('add'),
  entry: FormalSwapEntryAddSchema,
});
export const FormalSwapOpRemoveSchema = z.object({
  op: z.literal('remove'),
  id: z.string().min(1),
});
export const FormalSwapOpUpdateSchema = z.object({
  op: z.literal('update'),
  id: z.string().min(1),
  patch: FormalSwapEntryPatchSchema,
});
export const FormalSwapOpSchema = z.discriminatedUnion('op', [
  FormalSwapOpAddSchema,
  FormalSwapOpRemoveSchema,
  FormalSwapOpUpdateSchema,
]);
export type FormalSwapOp = z.infer<typeof FormalSwapOpSchema>;

export const LookingForEntryAddSchema = LookingForEntrySchema.omit({ id: true }).extend({
  id: z.string().min(1).optional(),
});
export const LookingForEntryPatchSchema = LookingForEntrySchema.partial().omit({ id: true });

export const LookingForOpAddSchema = z.object({
  op: z.literal('add'),
  entry: LookingForEntryAddSchema,
});
export const LookingForOpRemoveSchema = z.object({
  op: z.literal('remove'),
  id: z.string().min(1),
});
export const LookingForOpUpdateSchema = z.object({
  op: z.literal('update'),
  id: z.string().min(1),
  patch: LookingForEntryPatchSchema,
});
export const LookingForOpSchema = z.discriminatedUnion('op', [
  LookingForOpAddSchema,
  LookingForOpRemoveSchema,
  LookingForOpUpdateSchema,
]);
export type LookingForOp = z.infer<typeof LookingForOpSchema>;

/**
 * Ops-based delta for PATCH /v1/decks/{deckId}.
 * At least one mutating field must be present (validated by applyDeckPatch).
 */
export const DeckPatchSchema = z.object({
  expectedUpdatedAt: z.string().optional(),

  name: z.string().min(1).optional(),
  format: DeckFormatSchema.optional(),
  ownership: DeckOwnershipSchema.optional(),
  archidektId: z.number().nullable().optional(),
  archidektUrl: z.string().nullable().optional(),
  coverInstanceId: z.string().nullable().optional(),
  browseViewDefault: BrowseViewSchema.nullable().optional(),
  cardLayoutDefault: CardLayoutSchema.optional(),
  cardSortDefault: CardSortModeSchema.optional(),
  lastArchidektSyncAt: z.string().nullable().optional(),
  lastArchidektImportAt: z.string().nullable().optional(),
  cubeTargetSize: z.number().positive().nullable().optional(),

  categories: z.array(CategoryDefSchema).optional(),
  oracle: z.record(z.string(), CardOracleSchema).optional(),

  cardOps: z.array(CardOpSchema).optional(),
  formalSwapOps: z.array(FormalSwapOpSchema).optional(),
  lookingForOps: z.array(LookingForOpSchema).optional(),
});
export type DeckPatch = z.infer<typeof DeckPatchSchema>;

export type DeckPatchErrorCode =
  | 'EMPTY_PATCH'
  | 'UNKNOWN_INSTANCE'
  | 'UNKNOWN_SWAP_ENTRY'
  | 'UNKNOWN_LOOKING_FOR'
  | 'CONFLICT';

export class DeckPatchApplyError extends Error {
  readonly code: DeckPatchErrorCode;

  constructor(message: string, code: DeckPatchErrorCode) {
    super(message);
    this.name = 'DeckPatchApplyError';
    this.code = code;
  }
}

/** True when the patch object has at least one mutating field (excluding expectedUpdatedAt). */
export function deckPatchHasMutations(patch: DeckPatch): boolean {
  if (patch.name !== undefined) return true;
  if (patch.format !== undefined) return true;
  if (patch.ownership !== undefined) return true;
  if (patch.archidektId !== undefined) return true;
  if (patch.archidektUrl !== undefined) return true;
  if (patch.coverInstanceId !== undefined) return true;
  if (patch.browseViewDefault !== undefined) return true;
  if (patch.cardLayoutDefault !== undefined) return true;
  if (patch.cardSortDefault !== undefined) return true;
  if (patch.lastArchidektSyncAt !== undefined) return true;
  if (patch.lastArchidektImportAt !== undefined) return true;
  if (patch.cubeTargetSize !== undefined) return true;
  if (patch.categories !== undefined) return true;
  if (patch.oracle !== undefined) return true;
  if (patch.cardOps && patch.cardOps.length > 0) return true;
  if (patch.formalSwapOps && patch.formalSwapOps.length > 0) return true;
  if (patch.lookingForOps && patch.lookingForOps.length > 0) return true;
  return false;
}
