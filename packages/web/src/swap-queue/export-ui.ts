import {
  buildArchidektWantsText,
  buildNameQtyWantsText,
  type WantSource,
} from '@rayenz-hub/shared';

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyArchidektWants(sources: WantSource[]): Promise<boolean> {
  return copyText(buildArchidektWantsText(sources));
}

export async function copyNameQtyWants(sources: WantSource[]): Promise<boolean> {
  return copyText(buildNameQtyWantsText(sources));
}
