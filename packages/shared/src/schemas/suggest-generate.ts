import { z } from 'zod';

export const MANUAL_SET_CODES_MAX = 5;
export const FOCUS_TAGS_MAX = 5;

export const SuggestReleaseSchema = z.object({
  kind: z.enum(['group', 'block', 'pinned']),
  code: z.string().min(1),
});
export type SuggestRelease = z.infer<typeof SuggestReleaseSchema>;

const focusTagsSchema = z.array(z.string().min(1)).max(FOCUS_TAGS_MAX).optional();

export const ChangePackageSchema = z.object({
  packageId: z.string(),
  label: z.string(),
  totalUsd: z.number(),
  swapCount: z.number().int(),
  unknownPriceCount: z.number().int(),
  suggestionIds: z.array(z.string()),
});

export const PackagingAuditSchema = z.object({
  budgetUsd: z.number(),
  fittingPackageFound: z.boolean(),
  suggestionsPriced: z.number().int(),
  suggestionsUnknownPrice: z.number().int(),
  poolCardCount: z.number().int().optional(),
});

export const SuggestGenerateRequestSchema = z
  .object({
    setCodes: z.array(z.string().min(1)).max(MANUAL_SET_CODES_MAX).optional(),
    release: SuggestReleaseSchema.optional(),
    budgetUsd: z.number().positive().optional(),
    deckIds: z.array(z.string().min(1)).min(1),
    maxSwaps: z.number().int().positive().optional(),
    excludeOwned: z.boolean().optional(),
    focusTags: focusTagsSchema,
  })
  .superRefine((val, ctx) => {
    const hasCodes = Array.isArray(val.setCodes) && val.setCodes.length > 0;
    const hasRelease = Boolean(val.release?.code?.trim());
    const hasBudget = val.budgetUsd != null && val.budgetUsd > 0;
    const modeCount = (hasCodes ? 1 : 0) + (hasRelease ? 1 : 0) + (hasBudget ? 1 : 0);
    if (modeCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of setCodes, release, or budgetUsd',
        path: ['budgetUsd'],
      });
    }
    if (hasBudget && val.deckIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'budgetUsd mode requires exactly one deckId',
        path: ['deckIds'],
      });
    }
    if (hasCodes === hasRelease && hasCodes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of setCodes or release',
        path: ['release'],
      });
    }
  });
export type SuggestGenerateRequest = z.infer<typeof SuggestGenerateRequestSchema>;

export const SuggestCoverageSchema = z.object({
  cardsResolved: z.number(),
  cardsWithTags: z.number(),
  percent: z.number(),
});

export const SuggestRuleAuditSchema = z.object({
  ruleId: z.string(),
  deckId: z.string().optional(),
  suggestionsAdded: z.number(),
  skippedReason: z.string().optional(),
});

export const SuggestCardSchema = z
  .object({
    name: z.string(),
  })
  .passthrough();

export const SuggestionSchema = z
  .object({
    suggestion_id: z.string(),
    action: z.string(),
    card: SuggestCardSchema,
    quantity: z.number(),
    roles_matched: z.array(z.string()),
    confidence: z.string(),
    rationale: z.string(),
    tags: z.array(z.string()),
    replaces: z.array(z.object({ name: z.string(), quantity: z.number() })),
    priority_tier: z.enum(['swap', 'normal']).or(z.string()),
    incomingUsd: z.number().optional(),
  })
  .passthrough();

export const SuggestDeckResultSchema = z.object({
  deckId: z.string(),
  deckName: z.string(),
  skipped: z.boolean(),
  skipReason: z.string().optional(),
  message: z.string().optional(),
  suggestions: z.array(SuggestionSchema),
  audit: z.array(SuggestRuleAuditSchema),
  packages: z.array(ChangePackageSchema).optional(),
  packaging: PackagingAuditSchema.optional(),
});

export const SuggestGenerateResponseSchema = z.object({
  cap: z.number().int().positive(),
  mode: z.enum(['set', 'budget']).optional(),
  setCodes: z.array(z.string()),
  setCodesKey: z.string(),
  upgradePoolKey: z.string().optional(),
  focusTags: z.array(z.string()).optional(),
  release: SuggestReleaseSchema.optional(),
  taggerCoverage: SuggestCoverageSchema,
  deckResults: z.array(SuggestDeckResultSchema),
});
export type SuggestGenerateResponse = z.infer<typeof SuggestGenerateResponseSchema>;

export const SuggestReleasesResponseSchema = z.object({
  formatVersion: z.literal(1),
  generatedAt: z.string(),
  releases: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['group', 'block', 'pinned']),
      code: z.string(),
      name: z.string(),
      released_at: z.string().nullable(),
      set_codes: z.array(z.string()),
    }),
  ),
  secretLairSets: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        released_at: z.string().nullable(),
      }),
    )
    .optional(),
});
export type SuggestReleasesResponse = z.infer<typeof SuggestReleasesResponseSchema>;
