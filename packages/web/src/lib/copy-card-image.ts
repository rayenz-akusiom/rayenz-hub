/** Fetch a card face image and write PNG bytes to the clipboard. */

import {
  cardImageUrl,
  scryfallImageFromId,
} from '@rayenz-hub/shared';
import { canCopyPng, copyPngBlob } from './glance-png';

export type CardImageCopySource = {
  imageUrl?: string | null;
  scryfallId?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  name: string;
};

/** Prefer Scryfall CDN PNG when an id is known (clipboard APIs want image/png). */
export function cardImageCopyUrl(card: CardImageCopySource): string {
  return (
    scryfallImageFromId(card.scryfallId, 'front', 'png') || cardImageUrl(card) || ''
  );
}

async function blobAsPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => {
        if (next) resolve(next);
        else reject(new Error('PNG encode failed'));
      }, 'image/png');
    });
    return png;
  } finally {
    bitmap.close();
  }
}

export async function copyCardImageToClipboard(card: CardImageCopySource): Promise<void> {
  if (!canCopyPng()) return;
  const url = cardImageCopyUrl(card);
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch card image (${res.status}).`);
    const blob = await res.blob();
    const png = await blobAsPng(blob);
    await copyPngBlob(png);
  } catch (err) {
    console.warn('Copy card image failed', err);
  }
}
