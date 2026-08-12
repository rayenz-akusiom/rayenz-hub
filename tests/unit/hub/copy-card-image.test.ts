import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const canCopyPng = vi.fn(() => true);
const copyPngBlob = vi.fn(async () => {});

vi.mock('../../../packages/web/src/lib/glance-png', () => ({
  canCopyPng: () => canCopyPng(),
  copyPngBlob: (blob: Blob) => copyPngBlob(blob),
}));

import {
  cardImageCopyUrl,
  copyCardImageToClipboard,
} from '../../../packages/web/src/lib/copy-card-image';

function jpegResponse(): Response {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }),
  } as Response;
}

function pngResponse(): Response {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' }),
  } as Response;
}

describe('cardImageCopyUrl', () => {
  it('prefers Scryfall CDN png when scryfallId is present', () => {
    expect(
      cardImageCopyUrl({
        name: 'Sol Ring',
        scryfallId: 'abc-1234',
        imageUrl: 'https://cards.scryfall.io/normal/front/a/b/abc-1234.jpg',
      }),
    ).toBe('https://cards.scryfall.io/png/front/a/b/abc-1234.png');
  });

  it('falls back to cardImageUrl when no scryfallId', () => {
    expect(
      cardImageCopyUrl({
        name: 'Sol Ring',
        setCode: 'cmm',
        collectorNumber: '1',
      }),
    ).toContain('api.scryfall.com');
  });
});

describe('copyCardImageToClipboard', () => {
  beforeEach(() => {
    canCopyPng.mockReturnValue(true);
    copyPngBlob.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pngResponse()),
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 2,
        height: 2,
        close: vi.fn(),
      })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb?.(new Blob(['png'], { type: 'image/png' }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no-ops when clipboard PNG copy is unsupported', async () => {
    canCopyPng.mockReturnValue(false);
    await copyCardImageToClipboard({ name: 'Sol Ring', scryfallId: 'abc-1234' });
    expect(fetch).not.toHaveBeenCalled();
    expect(copyPngBlob).not.toHaveBeenCalled();
  });

  it('no-ops when there is no resolvable image URL', async () => {
    await copyCardImageToClipboard({ name: '' });
    expect(fetch).not.toHaveBeenCalled();
    expect(copyPngBlob).not.toHaveBeenCalled();
  });

  it('copies a PNG blob without re-encoding', async () => {
    await copyCardImageToClipboard({ name: 'Sol Ring', scryfallId: 'abc-1234' });
    expect(fetch).toHaveBeenCalledWith(
      'https://cards.scryfall.io/png/front/a/b/abc-1234.png',
    );
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(copyPngBlob).toHaveBeenCalledTimes(1);
    const blob = copyPngBlob.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('image/png');
  });

  it('converts JPEG blobs to PNG before copying', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jpegResponse()),
    );
    await copyCardImageToClipboard({
      name: 'Sol Ring',
      setCode: 'cmm',
      collectorNumber: '1',
    });
    expect(createImageBitmap).toHaveBeenCalled();
    expect(copyPngBlob).toHaveBeenCalledTimes(1);
    const blob = copyPngBlob.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('image/png');
  });
});
