import { neopetsFetch, neopetsPost } from '../lib/neopets-bridge';
import type { HubProgressController } from '../lib/hub-progress';
import {
  WISHING_MAX,
  buildWishingPayload,
  encodeForm,
  evaluateWishingPost,
  isWishingPeriodComplete,
  loadWishingWellState,
  markWishingPeriodComplete,
  parseWishCount,
  parseWishingForm,
  recordWishingOutcome,
  saveWishingWellState,
  updateWishingPreferences,
} from './wishing-well';

const COCOSHY_URL = 'https://www.neopets.com/halloween/process_cocoshy.phtml?coconut=3';
const MAX_THROWS = 20;
const THROW_DELAY_MS = 400;

const WISHING_PAGE_URL = 'https://www.neopets.com/wishing.phtml';
const WISHING_PROCESS_URL = 'https://www.neopets.com/process_wishing.phtml';
const WISHING_DELAY_MS = 400;

type ProgressWindow = Window & {
  __cocoshyProgress?: HubProgressController;
  __wishingwellProgress?: HubProgressController;
};

function cocoShyProgress(): HubProgressController | null {
  return (window as ProgressWindow).__cocoshyProgress || null;
}

function wishingWellProgress(): HubProgressController | null {
  return (window as ProgressWindow).__wishingwellProgress || null;
}

type CocoShyResult = {
  points: string | null;
  success: string | null;
  prizeId: string | null;
  error: string;
  raw: string;
};

function decodeParam(value: string | null): string {
  if (!value) return '';
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

function parseCocoShyResponse(text: string): CocoShyResult {
  const body = (text || '').trim();
  let query = body;
  let ampIndex = body.indexOf('points=');
  if (ampIndex === -1 && body.indexOf('success=') !== -1) {
    ampIndex = body.indexOf('success=');
  }
  if (ampIndex > 0) {
    query = body.slice(ampIndex);
  }
  const params = new URLSearchParams(query);
  return {
    points: params.get('points'),
    success: params.get('success'),
    prizeId: params.get('prize_id'),
    error: decodeParam(params.get('error')),
    raw: body,
  };
}

function isLoginPage(text: string): boolean {
  return /Neopets Account|Log In With NeoPass|Two-Factor Authentication/i.test(text);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveWishingPreferencesFromDom(): void {
  const wishInput = document.getElementById('wishingwell-wish') as HTMLInputElement | null;
  const donationInput = document.getElementById('wishingwell-donation') as HTMLInputElement | null;
  updateWishingPreferences(
    wishInput ? wishInput.value.trim() : '',
    donationInput ? parseInt(donationInput.value, 10) : null,
  );
}

export async function runCoconutShy(): Promise<void> {
  const runBtn = document.getElementById('cocoshy-run') as HTMLButtonElement | null;
  const progress = cocoShyProgress();
  let processed = 0;
  let wonItem: boolean | null = null;
  let hadError = false;

  if (!runBtn) {
    return;
  }

  runBtn.disabled = true;
  if (progress) {
    progress.start({ label: 'Running Coco Shy throws…' });
  }

  for (let throwNum = 1; throwNum <= MAX_THROWS; throwNum++) {
    if (progress) {
      progress.update({
        current: throwNum,
        total: MAX_THROWS,
        label: 'Coco Shy throw ' + throwNum + '/' + MAX_THROWS + '…',
      });
    }
    try {
      const response = await neopetsFetch(COCOSHY_URL);
      const responseText = response.text;

      if (isLoginPage(responseText)) {
        hadError = true;
        if (progress) {
          progress.finish({ label: 'Not logged in to Neopets.', variant: 'error' });
        }
        break;
      }

      const result = parseCocoShyResponse(responseText);

      if (result.success === '0') {
        break;
      }

      processed++;

      if (result.prizeId || result.success === '4' || result.success === '5') {
        wonItem = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      hadError = true;
      if (progress) {
        progress.finish({ label: message, variant: 'error' });
      }
      break;
    }

    if (throwNum < MAX_THROWS) {
      await sleep(THROW_DELAY_MS);
    }
  }

  if (!hadError && progress) {
    let summary = processed + ' throw' + (processed === 1 ? '' : 's') + ' processed.';
    if (wonItem) {
      summary += ' Item won!';
    } else {
      summary += ' No item won.';
    }
    progress.finish({ label: summary, variant: 'success' });
  }

  runBtn.disabled = false;
}

export async function refreshWishingWellStatus(): Promise<void> {
  const progress = wishingWellProgress();

  if (isWishingPeriodComplete()) {
    progress?.dismiss();
    return;
  }

  try {
    const response = await neopetsFetch(WISHING_PAGE_URL);
    const html = response.text;
    if (isLoginPage(html)) {
      progress?.finish({
        label: 'Log in at neopets.com to check wish status.',
        variant: 'error',
      });
      return;
    }

    const wishCount = parseWishCount(html);
    const state = loadWishingWellState();
    if (wishCount !== null) {
      state.lastWishCount = wishCount;
      saveWishingWellState(state);
    }

    if (wishCount === null) {
      progress?.dismiss();
      return;
    }

    if (wishCount >= WISHING_MAX) {
      markWishingPeriodComplete(state);
      progress?.dismiss();
      return;
    }

    if (wishCount === 0) {
      progress?.finish({ label: 'New wish period — you have not donated yet.' });
    } else {
      progress?.finish({
        label: 'New wish period — only ' + wishCount + '/' + WISHING_MAX + ' wishes submitted.',
      });
    }
  } catch {
    progress?.dismiss();
  }
}

export async function runWishingWell(): Promise<void> {
  const runBtn = document.getElementById('wishingwell-run') as HTMLButtonElement | null;
  const wishInput = document.getElementById('wishingwell-wish') as HTMLInputElement | null;
  const donationInput = document.getElementById('wishingwell-donation') as HTMLInputElement | null;
  const progress = wishingWellProgress();

  if (!runBtn || !wishInput || !donationInput) {
    return;
  }

  const wishText = wishInput.value.trim();
  const donation = parseInt(donationInput.value, 10) || 21;

  if (!wishText) {
    progress?.finish({ label: 'Enter an item to wish for.', variant: 'error' });
    return;
  }

  if (donation < 21) {
    progress?.finish({ label: 'Donation must be at least 21 NP.', variant: 'error' });
    return;
  }

  saveWishingPreferencesFromDom();
  runBtn.disabled = true;
  if (progress) {
    progress.start({ label: 'Submitting Wishing Well wishes…' });
  }

  let processed = 0;
  let hadError = false;
  let state = loadWishingWellState();

  try {
    const pageResponse = await neopetsFetch(WISHING_PAGE_URL);
    const pageHtml = pageResponse.text;
    if (isLoginPage(pageHtml)) {
      hadError = true;
      if (progress) {
        progress.finish({ label: 'Not logged in to Neopets.', variant: 'error' });
      }
      return;
    }

    let formData = parseWishingForm(pageHtml);
    if (!formData) {
      hadError = true;
      if (progress) {
        progress.finish({ label: 'Could not read the Wishing Well form.', variant: 'error' });
      }
      return;
    }

    const wishCount = parseWishCount(pageHtml);
    let remaining = WISHING_MAX;
    let currentWishCount = wishCount;
    if (wishCount !== null) {
      remaining = Math.max(0, WISHING_MAX - wishCount);
    }

    if (remaining === 0) {
      markWishingPeriodComplete(state);
      if (progress) {
        progress.finish({ label: 'Already submitted ' + WISHING_MAX + ' wishes this period.' });
      }
      return;
    }

    for (let i = 0; i < remaining; i++) {
      if (progress) {
        progress.update({
          current: i + 1,
          total: remaining,
          label: 'Submitting wish ' + (i + 1) + '/' + remaining + '…',
        });
      }
      const payload = buildWishingPayload(formData, wishText, donation);
      const response = await neopetsPost(WISHING_PROCESS_URL, encodeForm(payload));
      const responseHtml = response.text || '';

      if (isLoginPage(responseHtml)) {
        hadError = true;
        if (progress) {
          progress.finish({ label: 'Not logged in to Neopets.', variant: 'error' });
        }
        break;
      }

      const outcome = evaluateWishingPost(response, currentWishCount);
      state = recordWishingOutcome(state, outcome);

      if (!outcome.ok) {
        if (!responseHtml.trim() && response.url) {
          console.warn('Wishing Well response URL:', response.url);
        }
        hadError = true;
        if (progress) {
          progress.finish({
            label: outcome.error || 'Unexpected response from Wishing Well.',
            variant: 'error',
          });
        }
        break;
      }

      processed++;

      if (/Wish Count:/i.test(responseHtml)) {
        formData = parseWishingForm(responseHtml) || formData;
        currentWishCount = outcome.wishCount;
      } else {
        const refreshed = await neopetsFetch(WISHING_PAGE_URL);
        const refreshedHtml = refreshed.text;
        formData = parseWishingForm(refreshedHtml) || formData;
        currentWishCount = parseWishCount(refreshedHtml);
      }

      if (i < remaining - 1) {
        await sleep(WISHING_DELAY_MS);
      }
    }

    if (!hadError && progress) {
      const summary = processed + ' wish' + (processed === 1 ? '' : 'es') + ' processed.';
      if (processed >= remaining) {
        markWishingPeriodComplete(state);
      }
      progress.finish({ label: summary });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (progress) {
      progress.finish({ label: message, variant: 'error' });
    }
  } finally {
    runBtn.disabled = false;
  }
}
