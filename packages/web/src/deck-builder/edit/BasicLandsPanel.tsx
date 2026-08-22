import { useMemo, useState } from 'react';
import {
  addOrBumpBasicPrinting,
  basicLandTypeKey,
  basicLandTypesForPanel,
  changeCardPrintingMerging,
  listBasicLandStacks,
  scryfallImageFromId,
  scryfallImageFromPrinting,
  setCardQuantity,
  type CardInstance,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { FoilIcon } from '../../cards/FoilIcon';
import { ProxyIcon } from '../../cards/ProxyIcon';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';

type PickerMode =
  | { kind: 'add'; cardName: string }
  | { kind: 'change'; cardName: string; instanceId: string; card: CardInstance };

function printingLabel(card: CardInstance): string {
  const set = card.setCode ? String(card.setCode).toUpperCase() : '';
  const cn = card.collectorNumber != null && card.collectorNumber !== '' ? String(card.collectorNumber) : '';
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

function stacksForType(stacks: CardInstance[], typeName: string): CardInstance[] {
  const key = basicLandTypeKey(typeName);
  return stacks
    .filter((c) => basicLandTypeKey(c.name) === key)
    .sort((a, b) => {
      const la = printingLabel(a);
      const lb = printingLabel(b);
      return la.localeCompare(lb) || a.instanceId.localeCompare(b.instanceId);
    });
}

function typeTotal(stacks: CardInstance[]): number {
  return stacks.reduce((sum, c) => sum + Math.max(1, Number(c.quantity) || 1), 0);
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
  const stacks = useMemo(() => listBasicLandStacks(deck), [deck]);
  const types = useMemo(() => basicLandTypesForPanel(deck), [deck]);
  const grandTotal = typeTotal(stacks);

  function setQty(instanceId: string, quantity: number) {
    onChange(setCardQuantity(deck, instanceId, quantity));
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
        <div className="db-modal-card db-basics-panel">
          <div className="db-picker-header">
            <h3>Basic lands</h3>
            <button type="button" className="db-btn" onClick={onClose}>
              Close
            </button>
          </div>

          <p className="db-meta">
            Set quantities per printing. Add alternate art or sets with Add printing.
          </p>

          <div className="db-basics-total" aria-live="polite">
            Total basics: <strong>{grandTotal}</strong>
          </div>

          <div className="db-basics-sections">
            {types.map((typeName) => {
              const rows = stacksForType(stacks, typeName);
              const total = typeTotal(rows);
              return (
                <section
                  key={typeName}
                  className="db-basics-section"
                  aria-labelledby={`db-basics-${typeName.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className="db-basics-section-header">
                    <h4 id={`db-basics-${typeName.replace(/\s+/g, '-').toLowerCase()}`}>
                      {typeName}
                    </h4>
                    <span className="db-meta">{total}</span>
                  </div>

                  {rows.length ? (
                    <ul className="db-basics-stack-list">
                      {rows.map((card) => {
                        const qty = Math.max(1, Number(card.quantity) || 1);
                        const thumb = stackThumb(card);
                        return (
                          <li key={card.instanceId} className="db-basics-stack-row">
                            <span className="db-basics-thumb" aria-hidden="true">
                              {thumb ? (
                                <img src={thumb} alt="" />
                              ) : (
                                <span className="db-basics-thumb-fallback">{typeName.slice(0, 1)}</span>
                              )}
                            </span>
                            <div className="db-basics-stack-meta">
                              <span className="db-basics-printing">{printingLabel(card)}</span>
                              <span className="db-basics-badges">
                                {card.foil ? (
                                  <span className="db-basics-badge" title="Foil">
                                    <FoilIcon filled />
                                  </span>
                                ) : null}
                                {card.proxy ? (
                                  <span className="db-basics-badge" title="Proxy">
                                    <ProxyIcon filled />
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            <div className="db-basics-qty" role="group" aria-label={`${typeName} ${printingLabel(card)} quantity`}>
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
                            <button
                              type="button"
                              className="db-btn"
                              onClick={() =>
                                setPicker({
                                  kind: 'change',
                                  cardName: typeName,
                                  instanceId: card.instanceId,
                                  card,
                                })
                              }
                            >
                              Change…
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="db-meta db-basics-empty">None in deck</p>
                  )}

                  <button
                    type="button"
                    className="db-btn"
                    onClick={() => setPicker({ kind: 'add', cardName: typeName })}
                  >
                    Add printing…
                  </button>
                </section>
              );
            })}
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
