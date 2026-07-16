export function svgDataUri(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function escapeHtml(str: unknown): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toKebabCase(str: string): string {
  if (!str) {
    return '';
  }
  const parts = str.match(
    /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g,
  );
  if (!parts) {
    return '';
  }
  return parts.map((word) => word.toLowerCase()).join('-');
}

export function toUriEncodedKebabCase(str: string): string {
  return encodeURIComponent(toKebabCase(str));
}
