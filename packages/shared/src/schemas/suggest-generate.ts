import { z } from 'zod';

export const MANUAL_SET_CODES_MAX = 5;

export const SuggestReleaseSchema = z.object({
  kind: z.enum(['group', 'block', 'pinned']),
  code: z.string().min(1),
});
export type SuggestRelease = z.infer<typeof SuggestReleaseSchema>;

export const SuggestGenerateRequestSchema = z
  .object({
    setCodes: z.array(z.string().min(1)).max(MANUAL_SET_CODES_MAX).optional(),
    release: SuggestReleaseSchema.optional(),
    deckIds: z.array(z.string().min(1)).min(1),
  })
  .superRefine((val, ctx) => {
    const hasCodes = Array.isArray(val.setCodes) && val.setCodes.length > 0;
    const hasRelease = Boolean(val.release?.code?.trim());
    if (hasCodes === hasRelease) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of setCodes or release',
        path: hasCodes ? ['release'] : ['setCodes'],
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
});

export const SuggestGenerateResponseSchema = z.object({
  cap: z.number().int().positive(),
  setCodes: z.array(z.string()),
  setCodesKey: z.string(),
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
