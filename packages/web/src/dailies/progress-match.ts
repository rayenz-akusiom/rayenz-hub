/**
 * Match Neopets progress-page observations to ItemDB catalog items.
 */

export type CatalogMatchItem = {
  itemIid: number;
  name: string;
  image?: string | null;
  description?: string | null;
};

export type ProgressObservation = {
  name?: string | null;
  imageUrl?: string | null;
  description?: string | null;
};

export type MatchResult = {
  matchedIids: number[];
  unmatched: ProgressObservation[];
};

const IMAGE_EXT_RE = /\.(gif|png|jpe?g|webp|svg)$/i;

/** Stable image key: basename, lowercased, extension stripped. */
export function imageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const cleaned = String(url).trim().split('?')[0].split('#')[0];
  const parts = cleaned.split('/');
  let file = parts[parts.length - 1] || '';
  if (!file) {
    return null;
  }
  file = file.toLowerCase();
  file = file.replace(IMAGE_EXT_RE, '');
  return file || null;
}

export function normalizeItemName(name: string | null | undefined): string {
  let s = String(name || '');
  try {
    s = s.normalize('NFKC');
  } catch {
    /* ignore */
  }
  s = s
    .replace(/[\u2018\u2019\u201A\u2032']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  s = s.replace(/^the\s+/, '');
  return s;
}

export function normalizeDescription(text: string | null | undefined): string {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type CatalogIndexes = {
  byName: Map<string, number[]>;
  byImageKey: Map<string, number[]>;
  byDescription: Map<string, number[]>;
  byIid: Map<number, CatalogMatchItem>;
};

export function buildCatalogIndexes(items: CatalogMatchItem[]): CatalogIndexes {
  const byName = new Map<string, number[]>();
  const byImageKey = new Map<string, number[]>();
  const byDescription = new Map<string, number[]>();
  const byIid = new Map<number, CatalogMatchItem>();

  for (const item of items) {
    byIid.set(item.itemIid, item);
    const nameKey = normalizeItemName(item.name);
    if (nameKey) {
      const list = byName.get(nameKey) || [];
      list.push(item.itemIid);
      byName.set(nameKey, list);
    }
    const imgKey = imageKeyFromUrl(item.image);
    if (imgKey) {
      const list = byImageKey.get(imgKey) || [];
      list.push(item.itemIid);
      byImageKey.set(imgKey, list);
    }
    const descKey = normalizeDescription(item.description);
    if (descKey) {
      const list = byDescription.get(descKey) || [];
      list.push(item.itemIid);
      byDescription.set(descKey, list);
    }
  }

  return { byName, byImageKey, byDescription, byIid };
}

function pickUnique(iids: number[] | undefined): number | null {
  if (!iids || iids.length === 0) {
    return null;
  }
  if (iids.length === 1) {
    return iids[0];
  }
  return null;
}

/**
 * Resolve one observation against catalog indexes.
 * Prefer name, then unique image key, then description (optionally disambiguating image collisions).
 * Shared images without description stay unmatched (ambiguous).
 */
export function matchObservation(
  obs: ProgressObservation,
  indexes: CatalogIndexes,
  options?: { preferImage?: boolean },
): number | null {
  const preferImage = !!options?.preferImage;
  const nameKey = normalizeItemName(obs.name);
  if (!preferImage && nameKey) {
    const byName = pickUnique(indexes.byName.get(nameKey));
    if (byName != null) {
      return byName;
    }
    const named = indexes.byName.get(nameKey);
    if (named && named.length > 1) {
      const imgKey = imageKeyFromUrl(obs.imageUrl);
      if (imgKey) {
        const overlap = named.filter((iid) => {
          const item = indexes.byIid.get(iid);
          return imageKeyFromUrl(item?.image) === imgKey;
        });
        const uniq = pickUnique(overlap);
        if (uniq != null) {
          return uniq;
        }
      }
    }
  }

  const imgKey = imageKeyFromUrl(obs.imageUrl);
  if (imgKey) {
    const candidates = indexes.byImageKey.get(imgKey) || [];
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length > 1) {
      const descKey = normalizeDescription(obs.description);
      if (descKey) {
        const overlap = candidates.filter((iid) => {
          const item = indexes.byIid.get(iid);
          return normalizeDescription(item?.description) === descKey;
        });
        const uniq = pickUnique(overlap);
        if (uniq != null) {
          return uniq;
        }
      }
      // Ambiguous shared image — do not auto-acquire all variants
    }
  }

  const descKey = normalizeDescription(obs.description);
  if (descKey) {
    const byDesc = pickUnique(indexes.byDescription.get(descKey));
    if (byDesc != null) {
      return byDesc;
    }
  }

  if (preferImage && nameKey) {
    return pickUnique(indexes.byName.get(nameKey));
  }

  return null;
}

/** True if observation looks like a real item (not page chrome). */
export function isPlausibleItemObservation(obs: ProgressObservation): boolean {
  if (obs.imageUrl && isItemImageSrc(obs.imageUrl)) {
    return true;
  }
  const nameKey = normalizeItemName(obs.name);
  if (!nameKey || nameKey.length < 2) {
    return false;
  }
  if (/^(read|back|next|submit|home|neopets|logout|shop|inventory|search)$/i.test(nameKey)) {
    return false;
  }
  return true;
}

export function matchObservations(
  observations: ProgressObservation[],
  catalog: CatalogMatchItem[],
  options?: { preferImage?: boolean },
): MatchResult {
  const indexes = buildCatalogIndexes(catalog);
  const matched = new Set<number>();
  const unmatched: ProgressObservation[] = [];
  for (const obs of observations) {
    if (!isPlausibleItemObservation(obs)) {
      continue;
    }
    const iid = matchObservation(obs, indexes, options);
    if (iid == null) {
      unmatched.push(obs);
    } else {
      matched.add(iid);
    }
  }
  return { matchedIids: Array.from(matched), unmatched };
}

export function isItemImageSrc(src: string): boolean {
  const s = String(src || '');
  if (/\/items?\//i.test(s) || /\/items\//i.test(s)) {
    return true;
  }
  // Protocol-relative or absolute neopets item images
  if (/neopets\.com\/.*\.(gif|png|jpe?g|webp)/i.test(s) && /item/i.test(s)) {
    return true;
  }
  return false;
}

type ParsedImg = { src: string; title: string | null; fullTag: string; index: number };

/**
 * Extract img tags including protocol-relative and unquoted src.
 */
export function parseItemImagesFromHtml(html: string): ParsedImg[] {
  const out: ParsedImg[] = [];
  const re =
    /<img\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || '';
    const srcMatch =
      attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) ||
      attrs.match(/\bsrc\s*=\s*([^\s>]+)/i);
    if (!srcMatch) {
      continue;
    }
    const src = srcMatch[1].replace(/^['"]|['"]$/g, '');
    if (!isItemImageSrc(src)) {
      continue;
    }
    const titleMatch =
      attrs.match(/\btitle\s*=\s*["']([^"']*)["']/i) ||
      attrs.match(/\balt\s*=\s*["']([^"']*)["']/i);
    out.push({
      src,
      title: titleMatch ? titleMatch[1] : null,
      fullTag: match[0],
      index: match.index,
    });
  }
  return out;
}

/** @deprecated Prefer parseItemImagesFromHtml / observationsFromBooksReadHtml */
export function observationsFromHtmlImages(html: string): ProgressObservation[] {
  return parseItemImagesFromHtml(html).map((img) => ({
    imageUrl: img.src,
    name: img.title,
    description: img.title,
  }));
}

/** Times-read counter under the book image, e.g. "(496)" — not a title. */
export function isTimesReadOnlyText(text: string | null | undefined): boolean {
  return /^\(\d+\)$/.test(String(text || '').trim());
}

export function stripHtmlToText(fragment: string): string {
  return String(fragment || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split books_read cell text "Title: optional blurb" (or title-only).
 * Rejects times-read counters.
 */
export function parseBooksReadTitleBlurb(text: string | null | undefined): {
  name: string | null;
  description: string | null;
} {
  const raw = String(text || '').trim();
  if (!raw || isTimesReadOnlyText(raw)) {
    return { name: null, description: null };
  }
  if (/^(read|back|next|submit)$/i.test(raw)) {
    return { name: null, description: null };
  }
  const colon = raw.indexOf(':');
  if (colon > 0) {
    const name = raw.slice(0, colon).trim();
    const description = raw.slice(colon + 1).trim() || null;
    if (name && name.length >= 2 && name.length <= 120 && !isTimesReadOnlyText(name)) {
      return { name, description };
    }
  }
  if (raw.length >= 2 && raw.length <= 120) {
    return { name: raw, description: null };
  }
  return { name: null, description: null };
}

/**
 * Extract title text that follows an img within the same cell / nearby markup.
 * Returns null for times-read-only cells like "(496)".
 */
export function titleAfterImage(html: string, imgIndex: number, imgTagLength: number): string | null {
  const after = html.slice(imgIndex + imgTagLength, imgIndex + imgTagLength + 400);
  // Stop at next img or end of td-ish block
  const cut = after.search(/<img\b|<\/td>|<\/TD>/i);
  const slice = cut === -1 ? after : after.slice(0, cut);
  const text = stripHtmlToText(slice);
  if (!text || text.length < 2 || text.length > 120) {
    return null;
  }
  if (isTimesReadOnlyText(text)) {
    return null;
  }
  if (/^(read|back|next|submit)$/i.test(text)) {
    return null;
  }
  return text;
}

/**
 * Text of the <td> that follows the image's cell (real books_read two-cell layout).
 */
export function nextTdTextAfterImage(html: string, imgIndex: number, imgTagLength: number): string | null {
  const after = html.slice(imgIndex + imgTagLength, imgIndex + imgTagLength + 1200);
  const closeMatch = after.match(/<\/td>/i);
  if (!closeMatch || closeMatch.index == null) {
    return null;
  }
  const afterClose = after.slice(closeMatch.index + closeMatch[0].length);
  const openMatch = afterClose.match(/<td\b[^>]*>/i);
  if (!openMatch || openMatch.index == null) {
    return null;
  }
  const contentStart = openMatch.index + openMatch[0].length;
  const content = afterClose.slice(contentStart);
  const endMatch = content.match(/<\/td>/i);
  const cellHtml =
    !endMatch || endMatch.index == null ? content.slice(0, 500) : content.slice(0, endMatch.index);
  const text = stripHtmlToText(cellHtml);
  return text || null;
}

/**
 * Resolve book name + description from same-cell title or next-td "Title: blurb".
 */
export function booksReadFieldsFromImage(
  html: string,
  imgIndex: number,
  imgTagLength: number,
  imgTitle: string | null,
): { name: string | null; description: string | null } {
  const sameCell = titleAfterImage(html, imgIndex, imgTagLength);
  if (sameCell) {
    const parsed = parseBooksReadTitleBlurb(sameCell);
    if (parsed.name) {
      return parsed;
    }
  }
  const nextCell = nextTdTextAfterImage(html, imgIndex, imgTagLength);
  if (nextCell) {
    const parsed = parseBooksReadTitleBlurb(nextCell);
    if (parsed.name) {
      return parsed;
    }
  }
  return { name: imgTitle, description: null };
}

/**
 * Books Read page: pair each item image with adjacent name text.
 * Handles two-cell rows (image+(N) | Title: blurb). Does not scrape nav links.
 */
export function observationsFromBooksReadHtml(html: string): ProgressObservation[] {
  const imgs = parseItemImagesFromHtml(html);
  const out: ProgressObservation[] = [];
  const seen = new Set<string>();

  for (const img of imgs) {
    const fields = booksReadFieldsFromImage(html, img.index, img.fullTag.length, img.title);
    const name = fields.name;
    const nameKey = normalizeItemName(name);
    const imgKey = imageKeyFromUrl(img.src) || '';
    const dedupe = nameKey + '|' + imgKey;
    if (seen.has(dedupe)) {
      continue;
    }
    seen.add(dedupe);
    out.push({
      name: name || null,
      imageUrl: img.src,
      description: fields.description || name || img.title,
    });
  }
  return out;
}

/** @deprecated Use observationsFromBooksReadHtml for books pages. */
export function observationsFromNamedListHtml(html: string): ProgressObservation[] {
  return observationsFromBooksReadHtml(html);
}

export function stampPageKeyFromLocation(href: string): string {
  try {
    const u = new URL(href, 'https://www.neopets.com');
    return u.pathname + u.search;
  } catch {
    return href;
  }
}
