/** Download / clipboard helpers for glance PNG blobs. */

export function downloadPngBlob(blob: Blob, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function canCopyPng(): boolean {
  return typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);
}

export async function copyPngBlob(blob: Blob): Promise<void> {
  if (!canCopyPng()) return;
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
