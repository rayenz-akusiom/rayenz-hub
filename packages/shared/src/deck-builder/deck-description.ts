import { z } from 'zod';

/** Stay under a DynamoDB item if the field is ever inlined (set-pool overflow threshold). */
export const DECK_DESCRIPTION_MAX_BYTES = 350 * 1024;

/** Description column needs at least this much leftover (plus 50% of remainder) to sit beside leaders. */
export const DECK_DESCRIPTION_SPLIT_MIN_REM = 12;

const C0_ALLOWED = new Set([9, 10, 13]); // tab, LF, CR

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Strip NUL / C0 controls except tab, newline, and carriage return. */
export function sanitizeDeckDescription(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 127) continue;
    if (code < 32 && !C0_ALLOWED.has(code)) continue;
    out += ch;
  }
  return out;
}

/** Sanitize and truncate to `DECK_DESCRIPTION_MAX_BYTES` without splitting a UTF-8 character. */
export function clampDeckDescription(raw: string): string {
  const cleaned = sanitizeDeckDescription(raw);
  const bytes = new TextEncoder().encode(cleaned);
  if (bytes.length <= DECK_DESCRIPTION_MAX_BYTES) return cleaned;
  const sliced = bytes.subarray(0, DECK_DESCRIPTION_MAX_BYTES);
  return new TextDecoder('utf-8').decode(sliced).replace(/\uFFFD+$/g, '');
}

export const DeckDescriptionSchema = z
  .string()
  .transform(sanitizeDeckDescription)
  .superRefine((val, ctx) => {
    if (utf8ByteLength(val) > DECK_DESCRIPTION_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Description exceeds ${DECK_DESCRIPTION_MAX_BYTES} UTF-8 bytes`,
      });
    }
  });

export type HeaderRemainderMode = 'description' | 'split' | 'tabs';

/**
 * Decide how description and header-leader cards share leftover width after commander / identity.
 * `leftoverPx <= 0` means unmeasured — prefer split so both can paint until ResizeObserver runs.
 */
export function headerRemainderMode(opts: {
  leftoverPx: number;
  leaderCardCount: number;
  cardWidthPx: number;
  minDescriptionPx?: number;
}): HeaderRemainderMode {
  const { leftoverPx, leaderCardCount, cardWidthPx } = opts;
  const minDescriptionPx = opts.minDescriptionPx ?? DECK_DESCRIPTION_SPLIT_MIN_REM * 16;
  if (leaderCardCount <= 0) return 'description';
  if (leftoverPx <= 0) return 'split';
  const natural = leaderCardCount * Math.max(0, cardWidthPx);
  const remaining = leftoverPx - Math.min(natural, leftoverPx);
  const half = leftoverPx * 0.5;
  if (remaining >= half && remaining >= minDescriptionPx) return 'split';
  return 'tabs';
}
