import { useMemo, useState } from 'react';
import {
  addOrBumpBasicPrinting,
  basicLandTypeKey,
  basicLandTypesForPanel,
  canonicalizeCategoryName,
  changeCardPrintingMerging,
  DEFAULT_LAND_TARGET,
  includedLandCount,
  landCategoryTarget,
  listBasicLandStacks,
  recalculateAutoBasics,
  scryfallImageFromId,
  scryfallImageFromPrinting,
  setCardQuantity,
  type CardInstance,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { FoilIcon } from '../../cards/FoilIcon';
import { ProxyIcon } from '../../cards/ProxyIcon';
import { CardSizePicker } from '../../cards/CardSizePicker';
import { useCardSize } from '../card-size';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';

type PickerMode =
  | { kind: 'add'; cardName: string }
  | { kind: 'change'; cardName: string; instanceId: string; card: CardInstance };

const CORE_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const;
const SNOW_TYPES = [
  'Snow-Covered Plains',
  'Snow-Covered Island',
  'Snow-Covered Swamp',
  'Snow-Covered Mountain',
  'Snow-Covered Forest',
] as const;

function printingLabel(card: CardInstance): string {
  const set = card.setCode ? String(card.setCode).toUpperCase() : '';
  const cn =
    card.collectorNumber != null && card.collectorNumber !== ''
      ? String(card.collectorNumber)
      : '';
  if (set && cn) return `${set} #${cn}`;
  if (set) return set;
  return 'Unspecified printing';
}

function stackThumb(card: CardInstance): string | null {
  return (
    scryfallImageFromId(card.scryfallId) ||
    scryfallImageFromPrinting(card.setCode, card.collectorNumber) ||
    null
  );
}

function typeTotal(stacks: CardInstance[]): number {
  return stacks.reduce((sum, c) => sum + Math.max(1, Number(c.quantity) || 1), 0);
}

function addTypeButtons(panelTypes: string[], snow: boolean): string[] {
  const panel = new Set(panelTypes.map((t) => t.toLowerCase()));
  const out: string[] = [];
  if (snow) {
    for (const name of SNOW_TYPES) {
      if (panel.has(name.toLowerCase()) || panel.has(name.replace(/^Snow-Covered /i, '').toLowerCase())) {
        out.push(name);
      }
    }
  } else {
    for (const name of CORE_TYPES) {
      if (panel.has(name.toLowerCase())) out.push(name);
    }
    if (panel.has('wastes')) out.push('Wastes');
  }
  return out;
}

function shortTypeLabel(name: string): string {
  if (name === 'Wastes') return 'Wastes';
  if (name.startsWith('Snow-Covered ')) return name.slice('Snow-Covered '.length);
  return name;
}

export function BasicLandsPanel({
  deck,
  onChange,
  onClose,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  onClose: () => void;
}) {
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [pickerSetCodes, setPickerSetCodes] = useState<string[]>([]);
  const [snow, setSnow] = useState(false);
  const { widthPx } = useCardSize();

  const stacks = useMemo(() => listBasicLandStacks(deck), [deck]);
  const panelTypes = useMemo(() => basicLandTypesForPanel(deck), [deck]);
  const addTypes = useMemo(() => addTypeButtons(panelTypes, snow), [panelTypes, snow]);
  const grandTotal = typeTotal(stacks);
  const landCount = includedLandCount(deck);
  const landTarget = landCategoryTarget(deck) ?? DEFAULT_LAND_TARGET;
  const autoOn = Boolean(deck.autoAdjustBasics);

  const sortedStacks = useMemo(() => {
    return [...stacks].sort((a, b) => {
      const ka = basicLandTypeKey(a.name) || a.name;
      const kb = basicLandTypeKey(b.name) || b.name;
      return ka.localeCompare(kb) || printingLabel(a).localeCompare(printingLabel(b));
    });
  }, [stacks]);

  function setQty(instanceId: string, quantity: number) {
    onChange(setCardQuantity(deck, instanceId, quantity));
  }

  function setLandTarget(value: number) {
    const n = Math.max(0, Math.floor(value));
    const cats = [...(deck.categories || [])];
    const idx = cats.findIndex((c) => canonicalizeCategoryName(c.name) === 'Land');
    if (idx < 0) {
      cats.push({
        name: 'Land',
        includedInDeck: true,
        includedInPrice: true,
        target: n,
      });
    } else {
      cats[idx] = { ...cats[idx]!, target: n };
    }
    onChange({
      ...deck,
      categories: cats,
      updatedAt: new Date().toISOString(),
    });
  }

  function setAutoAdjust(next: boolean) {
    onChange({
      ...deck,
      autoAdjustBasics: next,
      updatedAt: new Date().toISOString(),
    });
  }

  function onRecalculate() {
    onChange(recalculateAutoBasics(deck, { force: true }));
  }

  function onPickerConfirm(printing: PrintingFields, _category?: string, meta?: { proxy: boolean }) {
    if (!picker) return;
    if (picker.kind === 'add') {
      onChange(
        addOrBumpBasicPrinting(deck, printing, {
          quantity: 1,
          proxy: Boolean(meta?.proxy),
        }),
      );
    } else {
      onChange(
        changeCardPrintingMerging(deck, picker.instanceId, printing, {
          proxy: meta?.proxy,
        }),
      );
    }
    setPicker(null);
  }

  return (
    <>
      <div className="db-modal" role="dialog" aria-modal="true" aria-label="Basic lands">
        <div
          className="db-modal-card db-basics-panel"
          style={{ ['--db-card-w' as string]: `${widthPx}px` }}
        >
          <div className="db-picker-header">
            <h3>Basic lands</h3>
            <div className="db-basics-header-tools">
              <CardSizePicker />
              <button type="button" className="db-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </div>

          <div className="db-basics-toolbar">
            <label className="db-basics-field">
              <span>Target lands</span>
              <input
                className="db-input db-basics-target-input"
                type="number"
                min={0}
                value={landTarget}
                aria-label="Target land count"
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  if (!Number.isFinite(n)) return;
                  setLandTarget(n);
                }}
              />
            </label>
            <label className="db-basics-check">
              <input
                type="checkbox"
                checked={autoOn}
                onChange={(e) => setAutoAdjust(e.target.checked)}
              />
              <span>Auto-adjust basics</span>
            </label>
            <button type="button" className="db-btn" onClick={onRecalculate}>
              Recalculate
            </button>
          </div>

          <div className="db-basics-status" aria-live="polite">
            Lands {landCount} / {landTarget}
            <span className="db-meta"> · Basics {grandTotal}</span>
            {autoOn ? (
              <span className="db-meta"> · Auto fills basics to target by pip ratio</span>
            ) : null}
          </div>

          <div className="db-basics-add-row">
            <label className="db-basics-check">
              <input
                type="checkbox"
                checked={snow}
                onChange={(e) => setSnow(e.target.checked)}
              />
              <span>Snow</span>
            </label>
            <div className="db-basics-add-types" role="group" aria-label="Add basic printing">
              {addTypes.map((typeName) => (
                <button
                  key={typeName}
                  type="button"
                  className="db-btn"
                  onClick={() => setPicker({ kind: 'add', cardName: typeName })}
                >
                  {shortTypeLabel(typeName)}
                </button>
              ))}
            </div>
          </div>

          <div className="db-basics-body">
            {sortedStacks.length ? (
              <ul className="db-basics-grid">
                {sortedStacks.map((card) => {
                  const qty = Math.max(1, Number(card.quantity) || 1);
                  const thumb = stackThumb(card);
                  const label = printingLabel(card);
                  return (
                    <li key={card.instanceId} className="db-basics-cell">
                      <button
                        type="button"
                        className="db-basics-card-btn"
                        aria-label={`Change printing — ${card.name} ${label}`}
                        onClick={() =>
                          setPicker({
                            kind: 'change',
                            cardName: card.name,
                            instanceId: card.instanceId,
                            card,
                          })
                        }
                      >
                        {thumb ? (
                          <img src={thumb} alt="" />
                        ) : (
                          <span className="db-basics-card-fallback">{card.name}</span>
                        )}
                        {(card.foil || card.proxy) && (
                          <span className="db-basics-card-badges">
                            {card.foil ? (
                              <span title="Foil">
                                <FoilIcon filled />
                              </span>
                            ) : null}
                            {card.proxy ? (
                              <span title="Proxy">
                                <ProxyIcon filled />
                              </span>
                            ) : null}
                          </span>
                        )}
                      </button>
                      <span className="db-basics-card-label">{label}</span>
                      <div
                        className="db-basics-qty"
                        role="group"
                        aria-label={`${card.name} ${label} quantity`}
                      >
                        <button
                          type="button"
                          className="db-btn db-basics-qty-btn"
                          aria-label="Decrease quantity"
                          onClick={() => setQty(card.instanceId, qty - 1)}
                        >
                          −
                        </button>
                        <input
                          className="db-input db-basics-qty-input"
                          type="number"
                          min={0}
                          value={qty}
                          aria-label="Quantity"
                          onChange={(e) => {
                            const n = Math.floor(Number(e.target.value));
                            if (!Number.isFinite(n)) return;
                            setQty(card.instanceId, n);
                          }}
                        />
                        <button
                          type="button"
                          className="db-btn db-basics-qty-btn"
                          aria-label="Increase quantity"
                          onClick={() => setQty(card.instanceId, qty + 1)}
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="db-meta db-basics-empty">No basics in the deck yet.</p>
            )}
          </div>

          <div className="db-modal-actions">
            <button type="button" className="db-btn is-active" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>

      {picker ? (
        <PrintingPickerModal
          cardName={picker.cardName}
          defaultScryfallId={
            picker.kind === 'change' ? picker.card.scryfallId : null
          }
          selectedScryfallId={
            picker.kind === 'change' ? picker.card.scryfallId : null
          }
          foilDefault={picker.kind === 'change' ? Boolean(picker.card.foil) : false}
          proxyDefault={picker.kind === 'change' ? Boolean(picker.card.proxy) : false}
          confirmLabel={picker.kind === 'add' ? 'Add printing' : 'Apply printing'}
          title={`${picker.kind === 'add' ? 'Add' : 'Change'} printing — ${picker.cardName}`}
          setCodes={pickerSetCodes}
          onSetCodesChange={setPickerSetCodes}
          onClose={() => setPicker(null)}
          onConfirm={onPickerConfirm}
        />
      ) : null}
    </>
  );
}
