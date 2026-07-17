import { useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cardHasBackFace, scryfallImageFromId, SWAP_IN, SWAP_OUT, canonicalizeSwapCategory } from '@rayenz-hub/shared';
import { CardFace } from './CardFace';
import { CardSizePicker } from './CardSizePicker';
import { useCardSize } from './card-size';

export type CardPickerItem = {
  value: unknown;
  lines?: string[];
  imgSrc?: string;
  /** Back-face image when dual-faced (optional if scryfallId + layout provided). */
  backImgSrc?: string;
  scryfallId?: string;
  layout?: string;
  faceKey?: string;
  category?: string;
  finishes?: string[];
};

export type CardPickerPickContext = { foil: boolean };

export type CardPickerConfig = {
  title?: string;
  items?: CardPickerItem[];
  selectedValue?: unknown;
  sort?: boolean;
  groupByCategory?: boolean;
  showFoilToggle?: boolean;
  foilDefault?: boolean;
  onPick?: (value: unknown, item: CardPickerItem, ctx: CardPickerPickContext) => void;
};

const UNCATEGORIZED = '__uncategorized__';
const PINNED = [SWAP_IN, SWAP_OUT];

function sortItems(items: CardPickerItem[]): CardPickerItem[] {
  return items.slice().sort((a, b) => {
    const a0 = String(a.lines?.[0] || '').toLowerCase();
    const b0 = String(b.lines?.[0] || '').toLowerCase();
    const cmp = a0.localeCompare(b0);
    if (cmp !== 0) return cmp;
    return String(a.lines?.[1] || '')
      .toLowerCase()
      .localeCompare(String(b.lines?.[1] || '').toLowerCase());
  });
}

function groupItems(items: CardPickerItem[]): { name: string | null; items: CardPickerItem[] }[] {
  const buckets: Record<string, CardPickerItem[]> = {};
  for (const item of items) {
    const cat = item.category ? String(item.category).trim() : '';
    const key = cat ? canonicalizeSwapCategory(cat) : UNCATEGORIZED;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(item);
  }
  for (const key of Object.keys(buckets)) {
    buckets[key] = sortItems(buckets[key]);
  }
  const groups: { name: string | null; items: CardPickerItem[] }[] = [];
  if (buckets[UNCATEGORIZED]?.length) {
    groups.push({ name: null, items: buckets[UNCATEGORIZED] });
    delete buckets[UNCATEGORIZED];
  }
  for (const cat of PINNED) {
    if (buckets[cat]?.length) {
      groups.push({ name: cat, items: buckets[cat] });
      delete buckets[cat];
    }
  }
  Object.keys(buckets)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .forEach((cat) => {
      groups.push({ name: cat, items: buckets[cat] });
    });
  return groups;
}

export function resolveFinish(item: CardPickerItem | null | undefined, foilOn: boolean): string {
  if (foilOn && item?.finishes && item.finishes.indexOf('foil') >= 0) {
    return 'foil';
  }
  return 'nonfoil';
}

export function CardPickerModal({
  config,
  onClose,
}: {
  config: CardPickerConfig;
  onClose: () => void;
}) {
  const { size, setSize, widthPx } = useCardSize();
  const [foil, setFoil] = useState(!!config.foilDefault);

  useEffect(() => {
    setFoil(!!config.foilDefault);
  }, [config]);

  const groups = useMemo(() => {
    let items = config.items || [];
    if (config.groupByCategory) return groupItems(items);
    if (config.sort) items = sortItems(items);
    return [{ name: null, items }];
  }, [config]);

  function pick(item: CardPickerItem) {
    config.onPick?.(item.value, item, { foil });
    onClose();
  }

  return (
    <div
      className="hub-picker-dialog hub-picker-dialog--react"
      role="dialog"
      aria-modal="true"
      aria-label={config.title || 'Choose'}
      style={{ ['--hub-picker-card-min' as string]: `${widthPx}px`, ['--db-card-w' as string]: `${widthPx}px` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="hub-picker-dialog-inner">
        <header className="hub-picker-dialog-header">
          <h3 className="hub-picker-title">{config.title || 'Choose'}</h3>
          <div className="hub-picker-header-controls">
            {config.showFoilToggle ? (
              <label className="hub-picker-foil-toggle">
                <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
                Foil
              </label>
            ) : null}
            <CardSizePicker size={size} onChange={setSize} />
            <button type="button" className="hub-picker-close-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="hub-picker-grid">
          {groups.map((group) => (
            <div key={group.name || '__flat__'} className="hub-picker-group">
              {group.name ? (
                <div className="hub-picker-group-header">
                  <span className="hub-picker-group-name">{group.name}</span>
                  <span className="hub-picker-group-count">{group.items.length}</span>
                </div>
              ) : null}
              {group.items.map((item, i) => {
                const name = item.lines?.[0] || 'Card';
                const selected = item.value === config.selectedValue;
                const showFoil = foil && (item.finishes || []).includes('foil');
                const doubleFaced = cardHasBackFace(item.layout);
                const backSrc =
                  item.backImgSrc ||
                  (doubleFaced && item.scryfallId
                    ? scryfallImageFromId(item.scryfallId, 'back')
                    : null);
                const faceKey = item.faceKey || item.scryfallId || undefined;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`hub-picker-option${selected ? ' selected' : ''}`}
                    onClick={() => pick(item)}
                  >
                    <div className={`hub-picker-option-image${item.imgSrc ? '' : ' hub-picker-option-image-empty'}`}>
                      {item.imgSrc ? (
                        <CardFace
                          src={item.imgSrc}
                          backSrc={backSrc}
                          name={name}
                          foil={showFoil}
                          faceKey={faceKey}
                          doubleFaced={doubleFaced}
                        />
                      ) : (
                        'No image'
                      )}
                    </div>
                    <div className="hub-picker-option-meta">
                      <div className="hub-picker-option-name" title={name}>
                        {name}
                      </div>
                      {(item.lines || []).length > 1 ? (
                        <div className="hub-picker-option-badges">
                          {(item.lines || []).slice(1).map((line) =>
                            line ? (
                              <span key={line} className="hub-picker-option-badge">
                                {line}
                              </span>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

let bridgeRoot: Root | null = null;
let bridgeHost: HTMLDivElement | null = null;

function ensureBridgeHost(): HTMLDivElement {
  if (bridgeHost) return bridgeHost;
  bridgeHost = document.createElement('div');
  bridgeHost.id = 'hub-card-picker-root';
  document.body.appendChild(bridgeHost);
  bridgeRoot = createRoot(bridgeHost);
  return bridgeHost;
}

function BridgeApp({
  config,
  onClose,
}: {
  config: CardPickerConfig | null;
  onClose: () => void;
}) {
  if (!config) return null;
  return <CardPickerModal config={config} onClose={onClose} />;
}

/** Install window.HubCardPicker that opens the React CardPicker (unified treatment). */
export function installHubCardPickerBridge(): void {
  let openConfig: CardPickerConfig | null = null;

  function render() {
    ensureBridgeHost();
    bridgeRoot?.render(
      <BridgeApp
        config={openConfig}
        onClose={() => {
          openConfig = null;
          bridgeRoot?.render(<BridgeApp config={null} onClose={() => {}} />);
        }}
      />,
    );
  }

  const api = {
    open(config: CardPickerConfig) {
      openConfig = config;
      render();
    },
    resolveFinish,
  };

  (window as Window & { HubCardPicker?: typeof api }).HubCardPicker = api;
}
