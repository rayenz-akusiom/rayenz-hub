const SIMPLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function quoteYamlListValue(value: string): string {
  const text = String(value || '');
  if (SIMPLE_TOKEN.test(text)) return text;
  return "'" + text.replace(/'/g, "''") + "'";
}

export function parseYamlList(text: string, fieldName: string): string[] {
  const lines = String(text || '').split(/\r?\n/);
  const items: string[] = [];
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[^\s#]/.test(line) && !line.startsWith('-')) {
      inSection = line.trim() === fieldName + ':';
      continue;
    }
    if (inSection) {
      if (/^[^\s#-]/.test(line)) {
        break;
      }
      const match = line.match(/^\s*-\s+(.+?)\s*$/);
      if (match) {
        items.push(match[1].replace(/^["']|["']$/g, ''));
      }
    }
  }
  return items;
}

function listHasItem(items: string[], name: string): boolean {
  const needle = String(name || '').toLowerCase();
  return items.some((item) => item.toLowerCase() === needle);
}

export function appendToYamlList(
  text: string,
  fieldName: string,
  item: string,
): { text: string; changed: boolean } {
  const value = String(item || '').trim();
  if (!value) return { text, changed: false };
  const items = parseYamlList(text, fieldName);
  if (listHasItem(items, value)) {
    return { text, changed: false };
  }

  const lines = String(text || '').split(/\r?\n/);
  let sectionIndex = -1;
  let insertAt = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === fieldName + ':') {
      sectionIndex = i;
      insertAt = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*-\s+/.test(lines[j])) {
          insertAt = j + 1;
        } else if (/^[^\s#-]/.test(lines[j])) {
          break;
        }
      }
      break;
    }
  }

  const entry = '  - ' + quoteYamlListValue(value);
  if (sectionIndex >= 0) {
    lines.splice(insertAt, 0, entry);
  } else {
    let anchor = -1;
    const anchors = ['archidekt_swaps:', 'constraints:', 'roles:', 'notes:'];
    for (let a = 0; a < anchors.length; a++) {
      for (let k = 0; k < lines.length; k++) {
        if (lines[k].trim() === anchors[a]) {
          anchor = k;
          break;
        }
      }
      if (anchor >= 0) {
        break;
      }
    }
    const block = [fieldName + ':', entry];
    if (anchor >= 0) {
      lines.splice(anchor, 0, '', block[0], block[1]);
    } else {
      if (lines.length && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(block[0], block[1]);
    }
  }

  let out = lines.join('\n');
  if (!out.endsWith('\n')) {
    out += '\n';
  }
  return { text: out, changed: true };
}

export function appendToYamlLists(
  text: string,
  updates: Record<string, string[] | undefined>,
): { text: string; changed: boolean; added: Record<string, string[]> } {
  let next = text || '';
  let changed = false;
  const added: Record<string, string[]> = {};
  for (const field of Object.keys(updates)) {
    const values = updates[field] || [];
    added[field] = [];
    for (const value of values) {
      const result = appendToYamlList(next, field, value);
      next = result.text;
      if (result.changed) {
        changed = true;
        added[field].push(value);
      }
    }
  }
  return { text: next, changed, added };
}
