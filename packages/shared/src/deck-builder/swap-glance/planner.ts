import {
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_WATERMARK_HEIGHT,
} from '../glance/plate.js';
import { swapGlanceFingerprint } from './fingerprint.js';
import type {
  SwapGlanceDensifyStage,
  SwapGlanceIncludeSet,
  SwapGlanceLayoutPlan,
  SwapGlanceLayoutResult,
  SwapGlancePackMode,
  SwapGlanceSection,
} from './types.js';
import {
  SWAP_GLANCE_GENERATION_VERSION,
  SWAP_GLANCE_MAX_PAGES,
} from './types.js';
import {
  CONTENT_MARGIN_X,
  CONTENT_MARGIN_Y,
  SECTION_OVERFLOW_LABEL_H,
  sectionFaceCount,
  titleLabels,
  type DensifyConfig,
  type LayoutAttempt,
} from './layout-shared.js';
import { densifyLadderFor, DENSIFY_LADDER, prepareCategories } from './densify.js';
import { bestMasonryForSections, packCategoryAcrossPages } from './masonry.js';

type PageBuild = {
  attempts: LayoutAttempt[];
  usedPages: number;
  omittedCards: number;
  fits: boolean;
};

function buildPagesForDensify(
  includeSet: SwapGlanceIncludeSet,
  densify: DensifyConfig,
  pageCount: number,
  allowOmit: boolean,
): PageBuild | null {
  const { formal, seeking, formalMode } = prepareCategories(includeSet, densify);
  const seekingMode = densify.seekingMode;

  // Single-page budget: allow mixing both categories on page 1.
  if (pageCount === 1 && formal.length && seeking.length) {
    // One masonry pass: use stacked only when both categories are stacked;
    // otherwise grid so we do not densify looking-for early.
    const packMode: SwapGlancePackMode =
      formalMode === 'stacked' && seekingMode === 'stacked' ? 'stacked' : 'grid';
    const attempt = bestMasonryForSections(
      [...formal, ...seeking],
      packMode,
      allowOmit,
      1,
      1,
      allowOmit,
    );
    if (!attempt) return null;
    if (!attempt.fits && !allowOmit) return null;
    if (allowOmit && attempt.omittedCards > 0) {
      const contentBottom =
        GLANCE_CANVAS_HEIGHT - GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
      if (!attempt.labels.some((l) => l.role === 'more' && /\+\d+ cards/.test(l.text))) {
        attempt.labels.push({
          text: `+${attempt.omittedCards} cards`,
          x: CONTENT_MARGIN_X,
          y: Math.round(contentBottom - SECTION_OVERFLOW_LABEL_H),
          role: 'more',
        });
      }
    }
    return {
      attempts: [attempt],
      usedPages: 1,
      omittedCards: attempt.omittedCards,
      fits: attempt.fits && attempt.omittedCards === 0,
    };
  }

  // Multi-page: category purity — formal pages first, then seeking pages.
  const formalPack = packCategoryAcrossPages(
    formal,
    formalMode,
    1,
    pageCount,
    allowOmit && seeking.length === 0,
  );
  if (!formalPack) return null;

  let seekingStart = 1;
  if (formal.length) {
    let lastFormalPage = 0;
    for (const p of formalPack.pages.keys()) {
      lastFormalPage = Math.max(lastFormalPage, p);
    }
    seekingStart = formalPack.ok ? lastFormalPage + 1 : lastFormalPage;
    if (formalPack.ok && seeking.length) {
      seekingStart = lastFormalPage + 1;
    }
  }

  const seekingPack =
    seeking.length && seekingStart <= pageCount
      ? packCategoryAcrossPages(
          seeking,
          seekingMode,
          seekingStart,
          pageCount,
          allowOmit,
        )
      : {
          pages: new Map<number, SwapGlanceSection[]>(),
          omitted: seeking.length && seekingStart > pageCount ? seeking : [],
          ok: seeking.length === 0 || seekingStart > pageCount ? seeking.length === 0 : true,
        };

  if (!seekingPack) return null;

  // Determine actual used page indices
  let maxPage = 0;
  for (const p of formalPack.pages.keys()) maxPage = Math.max(maxPage, p);
  for (const p of seekingPack.pages.keys()) maxPage = Math.max(maxPage, p);
  if (maxPage === 0 && (formal.length || seeking.length)) {
    // allowOmit dumped onto pages — check maps
    if (!formalPack.pages.size && !seekingPack.pages.size) return null;
  }
  const usedPages = Math.max(maxPage, formal.length || seeking.length ? 1 : 0);
  if (usedPages > pageCount) return null;

  // If we requested pageCount but used fewer, that's fine — caller prefers smaller.
  const effectiveCount = Math.max(usedPages, 1);
  // Rebuild with correct page titles using effectiveCount only when fits;
  // when trying a specific pageCount budget, titles use that pageCount if we fill it,
  // else the actual used count.
  const titlePageCount = effectiveCount;

  const attempts: LayoutAttempt[] = [];
  let omittedCards =
    formalPack.omitted.reduce((n, s) => n + sectionFaceCount(s), 0) +
    seekingPack.omitted.reduce((n, s) => n + sectionFaceCount(s), 0);

  for (let p = 1; p <= titlePageCount; p++) {
    const formalSecs = formalPack.pages.get(p) || [];
    const seekingSecs = seekingPack.pages.get(p) || [];
    const isLast = p === titlePageCount;
    const reserveOverflow = allowOmit && isLast && omittedCards > 0;

    // Prefer not mixing: if both present on same page (shouldn't with purity),
    // render formal then seeking as consecutive masonry by concatenating.
    // When mixed, use formal mode for formal block — but tryMasonry is one list.
    // With purity, at most one category per page.
    let attempt: LayoutAttempt | null = null;
    if (formalSecs.length && seekingSecs.length) {
      // Mixed page (rare): pack formal with formalMode; if seeking doesn't fit, omit.
      const formalAttempt = bestMasonryForSections(
        formalSecs,
        formalMode,
        false,
        p,
        titlePageCount,
        false,
      );
      if (!formalAttempt?.fits && !allowOmit) return null;
      // For mixed, fall back to concatenating with lookingFor/formal mode for all
      // as stacked/grid of singles after convert — use grid for safety.
      attempt = bestMasonryForSections(
        [...formalSecs, ...seekingSecs],
        formalMode === 'stacked' && seekingMode === 'stacked' ? 'stacked' : 'grid',
        allowOmit && isLast,
        p,
        titlePageCount,
        reserveOverflow,
      );
    } else if (formalSecs.length) {
      attempt = bestMasonryForSections(
        formalSecs,
        formalMode,
        allowOmit && isLast,
        p,
        titlePageCount,
        reserveOverflow || (allowOmit && isLast),
      );
    } else if (seekingSecs.length) {
      attempt = bestMasonryForSections(
        seekingSecs,
        seekingMode,
        allowOmit && isLast,
        p,
        titlePageCount,
        reserveOverflow || (allowOmit && isLast),
      );
    } else {
      attempt = {
        labels: titleLabels(p, titlePageCount),
        placements: [],
        connectors: [],
        fits: true,
        omittedCards: 0,
      };
    }

    if (!attempt) return null;
    if (!attempt.fits && !(allowOmit && isLast)) return null;
    omittedCards += attempt.omittedCards;
    attempts.push(attempt);
  }

  // Attach global +X on last page if needed
  if (allowOmit && omittedCards > 0 && attempts.length) {
    const last = attempts[attempts.length - 1]!;
    const contentBottom =
      GLANCE_CANVAS_HEIGHT - GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
    const already = last.labels.some((l) => l.role === 'more' && /\+\d+ cards/.test(l.text));
    if (!already) {
      last.labels.push({
        text: `+${omittedCards} cards`,
        x: CONTENT_MARGIN_X,
        y: Math.round(contentBottom - SECTION_OVERFLOW_LABEL_H),
        role: 'more',
      });
    }
  }

  const fits =
    formalPack.ok &&
    seekingPack.ok &&
    omittedCards === 0 &&
    attempts.every((a) => a.fits);

  return { attempts, usedPages: titlePageCount, omittedCards, fits };
}

function toPlan(
  includeSet: SwapGlanceIncludeSet,
  attempt: LayoutAttempt,
  pageIndex: number,
  pageCount: number,
  densifyStage: SwapGlanceDensifyStage,
): SwapGlanceLayoutPlan {
  return {
    layoutVersion: SWAP_GLANCE_GENERATION_VERSION,
    canvasWidth: GLANCE_CANVAS_WIDTH,
    canvasHeight: GLANCE_CANVAS_HEIGHT,
    filterSetCodes: includeSet.filterSetCodes || [],
    labels: attempt.labels,
    placements: attempt.placements,
    connectors: attempt.connectors,
    fingerprint: swapGlanceFingerprint(includeSet, SWAP_GLANCE_GENERATION_VERSION, {
      pageIndex,
      pageCount,
      densifyStage,
    }),
    pageIndex,
    pageCount,
    densifyStage,
  };
}

/**
 * Build 1–5 layout plans at fixed M card size with densify ladder + category grouping.
 */
export function buildSwapGlanceLayoutPlans(
  includeSet: SwapGlanceIncludeSet,
): SwapGlanceLayoutResult {
  const ladder = densifyLadderFor(includeSet);

  for (const densify of ladder) {
    for (let pageCount = 1; pageCount <= SWAP_GLANCE_MAX_PAGES; pageCount++) {
      const built = buildPagesForDensify(includeSet, densify, pageCount, false);
      if (built?.fits) {
        // Prefer actual used page count — rebuild titles if we over-allocated.
        const used = built.usedPages;
        if (used < pageCount) {
          // Re-run at exact used count for correct titles.
          const exact = buildPagesForDensify(includeSet, densify, used, false);
          if (exact?.fits) {
            return {
              plans: exact.attempts.map((a, i) =>
                toPlan(includeSet, a, i + 1, exact.usedPages, densify.stage),
              ),
              densifyStage: densify.stage,
              omittedCardCount: 0,
              pageCount: exact.usedPages,
            };
          }
        }
        return {
          plans: built.attempts.map((a, i) =>
            toPlan(includeSet, a, i + 1, built.usedPages, densify.stage),
          ),
          densifyStage: densify.stage,
          omittedCardCount: 0,
          pageCount: built.usedPages,
        };
      }
    }
  }

  // Truncate at max densify + 5 pages.
  const lastDensify = ladder[ladder.length - 1] ?? DENSIFY_LADDER[DENSIFY_LADDER.length - 1]!;
  const truncateDensify: DensifyConfig = {
    ...lastDensify,
    stage: 'truncate',
  };
  const truncated = buildPagesForDensify(
    includeSet,
    truncateDensify,
    SWAP_GLANCE_MAX_PAGES,
    true,
  );
  if (truncated) {
    return {
      plans: truncated.attempts.map((a, i) =>
        toPlan(includeSet, a, i + 1, truncated.usedPages, 'truncate'),
      ),
      densifyStage: 'truncate',
      omittedCardCount: truncated.omittedCards,
      pageCount: truncated.usedPages,
    };
  }

  // Absolute empty fallback
  const emptyAttempt: LayoutAttempt = {
    labels: titleLabels(1, 1),
    placements: [],
    connectors: [],
    fits: false,
    omittedCards: includeSet.sections.reduce((n, s) => n + sectionFaceCount(s), 0),
  };
  return {
    plans: [toPlan(includeSet, emptyAttempt, 1, 1, 'truncate')],
    densifyStage: 'truncate',
    omittedCardCount: emptyAttempt.omittedCards,
    pageCount: 1,
  };
}

/**
 * Build a single 1920×1080 layout plan (first page of the multi-page planner).
 * Prefer {@link buildSwapGlanceLayoutPlans} when multi-image output is needed.
 */
export function buildSwapGlanceLayoutPlan(
  includeSet: SwapGlanceIncludeSet,
): SwapGlanceLayoutPlan {
  const result = buildSwapGlanceLayoutPlans(includeSet);
  return result.plans[0]!;
}
