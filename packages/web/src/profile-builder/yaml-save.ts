import { parseYamlList } from '@rayenz-hub/shared';

export function replaceYamlListSection(text: string, fieldName: string, items: string[]): string {
  const lines = String(text || '').split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === fieldName + ':') {
      out.push(line);
      const unique = [...new Set(items.map((v) => String(v).trim()).filter(Boolean))];
      unique.forEach((item) => {
        const safe = /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(item) ? item : `'${item.replace(/'/g, "''")}'`;
        out.push('  - ' + safe);
      });
      i += 1;
      while (i < lines.length) {
        if (/^\s*-\s+/.test(lines[i])) {
          i += 1;
          continue;
        }
        if (/^[^\s#-]/.test(lines[i])) break;
        i += 1;
      }
      continue;
    }
    out.push(line);
    i += 1;
  }
  if (!out.some((l) => l.trim() === fieldName + ':') && items.length) {
    if (out.length && out[out.length - 1] !== '') out.push('');
    out.push(fieldName + ':');
    items.forEach((item) => {
      const safe = /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(item) ? item : `'${item.replace(/'/g, "''")}'`;
      out.push('  - ' + safe);
    });
  }
  let joined = out.join('\n');
  if (!joined.endsWith('\n')) joined += '\n';
  return joined;
}

export function mergeThemes(existingYaml: string, profileTags: string[]): string[] {
  const themes = parseYamlList(existingYaml, 'themes');
  const merged = new Set<string>();
  themes.forEach((t) => merged.add(t));
  profileTags.forEach((t) => merged.add(t));
  return [...merged];
}
