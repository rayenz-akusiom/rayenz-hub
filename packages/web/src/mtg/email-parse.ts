const FINISH_KEYWORDS: Record<string, string> = {
  foil: 'foil',
  etched: 'etched',
  nonfoil: 'nonfoil',
  'non-foil': 'nonfoil',
  glossy: 'foil',
};

export type ParsedCardLine = {
  name?: string;
  quantity?: number;
  set_code?: string | null;
  collector_number?: string | null;
  finish?: string | null;
  raw?: string;
  warning?: string | null;
  id?: string;
};

function normalizeFinish(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }
  const lower = String(token).toLowerCase().trim();
  return FINISH_KEYWORDS[lower] || (lower.indexOf('foil') >= 0 && lower.indexOf('non') < 0 ? 'foil' : null);
}

function parseCardLine(line: string): ParsedCardLine | null {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#') || /^total\b/i.test(trimmed)) {
    return null;
  }

  const warning: string | null = null;
  let quantity = 1;
  let name = trimmed;
  let setCode: string | null = null;
  let collectorNumber: string | null = null;
  let finish: string | null = null;

  const qtyMatch = trimmed.match(/^(\d+)\s*[x×]\s+(.+)$/i);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1;
    name = qtyMatch[2].trim();
  } else {
    const leadingQty = trimmed.match(/^(\d+)\s+(.+)$/);
    if (leadingQty && !/^\d+\s*\(/.test(trimmed)) {
      quantity = parseInt(leadingQty[1], 10) || 1;
      name = leadingQty[2].trim();
    }
  }

  const setCollector = name.match(/\(([^)]+)\)\s*#?(\d+[a-z]?)\s*$/i);
  if (setCollector) {
    setCode = setCollector[1].trim().toLowerCase();
    collectorNumber = setCollector[2].trim();
    name = name.slice(0, setCollector.index).trim();
  } else {
    const setOnly = name.match(/\(([a-z0-9]{2,5})\)\s*$/i);
    if (setOnly) {
      setCode = setOnly[1].toLowerCase();
      name = name.slice(0, setOnly.index).trim();
    }
  }

  const finishMatch = name.match(/\b(foil|non-?foil|etched|glossy)\b/i);
  if (finishMatch) {
    finish = normalizeFinish(finishMatch[1]);
    name = name.replace(finishMatch[0], '').replace(/\s+/g, ' ').trim();
  }

  name = name.replace(/\s*[-–—]\s*$/, '').trim();
  if (!name) {
    return { raw: trimmed, warning: 'Could not parse card name' };
  }

  return {
    name,
    quantity,
    set_code: setCode,
    collector_number: collectorNumber,
    finish,
    raw: trimmed,
    warning,
  };
}

function parseCardList(text: string) {
  const lines = String(text || '').split(/\r?\n/);
  const cards: ParsedCardLine[] = [];
  const warnings: { line: number; raw: string | undefined; message: string | undefined }[] = [];
  lines.forEach((line, index) => {
    const parsed = parseCardLine(line);
    if (!parsed) {
      return;
    }
    if (parsed.warning && !parsed.name) {
      warnings.push({ line: index + 1, raw: parsed.raw, message: parsed.warning });
      return;
    }
    parsed.id = 'acq-' + cards.length;
    cards.push(parsed);
  });
  return { cards, warnings };
}

function isLikelyCardLine(line: string): boolean {
  const t = String(line || '').trim();
  if (!t || t.length < 3) {
    return false;
  }
  if (/^(hi|hello|dear|thanks|thank you|order|shipped|tracking|invoice|subtotal|shipping|tax|total|date|from|to)\b/i.test(t)) {
    return false;
  }
  if (/^https?:\/\//i.test(t)) {
    return false;
  }
  if (/^\d+\s*[x×]\s+\S/i.test(t)) {
    return true;
  }
  if (/\([a-z0-9]{2,5}\)/i.test(t) && /[a-z]/i.test(t)) {
    return true;
  }
  if (/^\d+\s+[A-Z][\w',-]+/i.test(t)) {
    return true;
  }
  return false;
}

function parseOrderEmail(text: string) {
  const lines = String(text || '').split(/\r?\n/);
  const cardLines: string[] = [];
  const skipped: { line: number; raw: string }[] = [];
  lines.forEach((line, index) => {
    if (isLikelyCardLine(line)) {
      cardLines.push(line);
    } else if (String(line).trim()) {
      skipped.push({ line: index + 1, raw: line.trim() });
    }
  });
  const result = parseCardList(cardLines.join('\n'));
  return { ...result, skippedNonCardLines: skipped };
}

function mergeAcquiredCards(cards: ParsedCardLine[] | null | undefined): ParsedCardLine[] {
  const map: Record<string, ParsedCardLine> = {};
  (cards || []).forEach((card) => {
    const key = [
      (card.name || '').toLowerCase(),
      card.set_code || '',
      card.collector_number || '',
      card.finish || '',
    ].join('|');
    if (!map[key]) {
      map[key] = Object.assign({ id: 'acq-' + Object.keys(map).length }, card);
    } else {
      map[key].quantity = (map[key].quantity || 1) + (card.quantity || 1);
    }
  });
  return Object.keys(map).map((k) => map[k]);
}

export const OrderEmailParse = {
  parseCardLine,
  parseCardList,
  parseOrderEmail,
  mergeAcquiredCards,
};
