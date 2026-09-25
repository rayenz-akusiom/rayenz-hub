import { useMemo, useState } from 'react';
import {
  addOrBumpBasicPrinting,
  basicLandTypeKey,
  basicLandTypesForPanel,
  calculateAutoBasicsBreakdown,
  canonicalizeCategoryName,
  changeCardPrintingMerging,
  DEFAULT_LAND_TARGET,
  fetchPrintingsPage,
  mapScryfallCardToPrinting,
  resolveCommanderColourIdentity,
  addCardToDeck,
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

const COLOUR_LABELS: Record<'W' | 'U' | 'B' | 'R' | 'G', string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const PAIR_LANDS = {
  duals: [
    { name: 'Tundra', colours: ['W','U'] }, { name: 'Underground Sea', colours: ['U','B'] }, { name: 'Badlands', colours: ['B','R'] }, { name: 'Taiga', colours: ['R','G'] }, { name: 'Savannah', colours: ['G','W'] },
    { name: 'Scrubland', colours: ['W','B'] }, { name: 'Volcanic Island', colours: ['U','R'] }, { name: 'Bayou', colours: ['B','G'] }, { name: 'Plateau', colours: ['R','W'] }, { name: 'Tropical Island', colours: ['G','U'] },
  ],
  turbulent: [
    { name: 'Turbulent Steppe', colours: ['R','W'] }, { name: 'Turbulent Fen', colours: ['U','B'] }, { name: 'Turbulent Moor', colours: ['B','G'] }, { name: 'Turbulent Springs', colours: ['U','R'] }, { name: 'Turbulent Wilderness', colours: ['G','W'] },
  ],
  battlebond: [
    { name: 'Sea of Clouds', colours: ['W','U'] }, { name: 'Morphic Pool', colours: ['U','B'] }, { name: 'Luxury Suite', colours: ['B','R'] }, { name: 'Spire Garden', colours: ['R','G'] }, { name: 'Bountiful Promenade', colours: ['G','W'] },
    { name: 'Vault of Champions', colours: ['W','B'] }, { name: 'Training Center', colours: ['U','R'] }, { name: 'Undergrowth Stadium', colours: ['B','G'] }, { name: 'Spectator Seating', colours: ['R','W'] }, { name: 'Rejuvenating Springs', colours: ['G','U'] },
  ],
  shocks: [
    { name: 'Hallowed Fountain', colours: ['W','U'] }, { name: 'Watery Grave', colours: ['U','B'] }, { name: 'Blood Crypt', colours: ['B','R'] }, { name: 'Stomping Ground', colours: ['R','G'] }, { name: 'Temple Garden', colours: ['G','W'] },
    { name: 'Godless Shrine', colours: ['W','B'] }, { name: 'Steam Vents', colours: ['U','R'] }, { name: 'Overgrown Tomb', colours: ['B','G'] }, { name: 'Sacred Foundry', colours: ['R','W'] }, { name: 'Breeding Pool', colours: ['G','U'] },
  ],
};
const TRIOMES = [
  { name: 'Raugrin Triome', colours: ['U','R','W'] }, { name: 'Indatha Triome', colours: ['W','B','G'] }, { name: 'Savai Triome', colours: ['W','B','R'] }, { name: 'Ketria Triome', colours: ['G','U','R'] }, { name: 'Zagoth Triome', colours: ['B','G','U'] },
  { name: "Raffine's Tower", colours: ['W','U','B'] }, { name: "Xander's Lounge", colours: ['U','B','R'] }, { name: "Ziatora's Proving Ground", colours: ['B','R','G'] }, { name: "Spara's Headquarters", colours: ['G','W','U'] }, { name: "Jetmir's Garden", colours: ['R','G','W'] },
];
const FETCHES: Array<{ name: string; colours: string[] }> = [
  { name: 'Flooded Strand', colours: ['W', 'U'] }, { name: 'Polluted Delta', colours: ['U', 'B'] },
  { name: 'Bloodstained Mire', colours: ['B', 'R'] }, { name: 'Wooded Foothills', colours: ['R', 'G'] },
  { name: 'Windswept Heath', colours: ['G', 'W'] }, { name: 'Marsh Flats', colours: ['W', 'B'] },
  { name: 'Scalding Tarn', colours: ['U', 'R'] }, { name: 'Verdant Catacombs', colours: ['B', 'G'] },
  { name: 'Arid Mesa', colours: ['R', 'W'] }, { name: 'Misty Rainforest', colours: ['G', 'U'] },
];

type LandGroup = { key: string; label: string; cards: string[]; minimumColours: number };

function matchingLandGroups(identity: string[]): LandGroup[] {
  const colours = new Set(identity);
  const pairNames = (cycle: Array<{ name: string; colours: string[] }>) => cycle.filter((land) => land.colours.every((colour) => colours.has(colour))).map((land) => land.name);
  const fetches = FETCHES.filter((fetch) => fetch.colours.some((colour) => colours.has(colour))).map((fetch) => fetch.name);
  return [
    { key: 'commander', label: 'Commander lands', cards: ['Command Tower', 'Path of Ancestry'], minimumColours: 1 },
    { key: 'true-duals', label: 'True duals', cards: pairNames(PAIR_LANDS.duals), minimumColours: 2 },
    { key: 'turbulent', label: 'Turbulent lands', cards: pairNames(PAIR_LANDS.turbulent), minimumColours: 2 },
    { key: 'battlebond', label: 'Battlebond lands', cards: pairNames(PAIR_LANDS.battlebond), minimumColours: 2 },
    { key: 'shocks', label: 'Shock lands', cards: pairNames(PAIR_LANDS.shocks), minimumColours: 2 },
    { key: 'fetches', label: 'Fetch lands', cards: fetches, minimumColours: 1 },
    { key: 'triomes', label: 'Triomes', cards: TRIOMES.filter((land) => land.colours.every((colour) => colours.has(colour))).map((land) => land.name), minimumColours: 3 },
  ];
}

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

function allocationReasonLabel(reason: 'none' | 'floor' | 'ratio' | 'floor+ratio'): string {
  if (reason === 'floor') return 'Floor';
  if (reason === 'ratio') return 'Ratio';
  if (reason === 'floor+ratio') return 'Floor + ratio';
  return 'None';
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
  const [addingLandGroup, setAddingLandGroup] = useState<string | null>(null);
  const [landAddMessage, setLandAddMessage] = useState('');
  const { widthPx } = useCardSize();

  const stacks = useMemo(() => listBasicLandStacks(deck), [deck]);
  const panelTypes = useMemo(() => basicLandTypesForPanel(deck), [deck]);
  const addTypes = useMemo(() => addTypeButtons(panelTypes, snow), [panelTypes, snow]);
  const grandTotal = typeTotal(stacks);
  const landCount = includedLandCount(deck);
  const landTarget = landCategoryTarget(deck) ?? DEFAULT_LAND_TARGET;
  const autoOn = Boolean(deck.autoAdjustBasics);
  const diagnostics = useMemo(() => calculateAutoBasicsBreakdown(deck), [deck]);
  const commanderIdentity = useMemo(() => resolveCommanderColourIdentity(deck), [deck]);
  const landGroups = useMemo(
    () => matchingLandGroups(commanderIdentity.letters),
    [commanderIdentity.letters],
  );

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

  async function addLandGroup(group: LandGroup) {
    if (addingLandGroup || !commanderIdentity.known || !commanderIdentity.letters.length) return;
    setAddingLandGroup(group.key);
    setLandAddMessage('');
    let next = deck;
    const existing = new Set(deck.cards.map((card) => card.name.toLocaleLowerCase()));
    let added = 0;
    let unavailable = 0;
    try {
      for (const name of group.cards) {
        if (existing.has(name.toLocaleLowerCase())) continue;
        try {
          if (added || unavailable) await new Promise((resolve) => setTimeout(resolve, 100));
          const page = await fetchPrintingsPage(name, 1);
          const first = page.data[0];
          if (!first) {
            unavailable += 1;
            continue;
          }
          next = addCardToDeck(next, mapScryfallCardToPrinting(first), 'Land');
          existing.add(name.toLocaleLowerCase());
          added += 1;
        } catch {
          unavailable += 1;
        }
      }
      if (added) onChange(next);
      setLandAddMessage(
        unavailable
          ? `Added ${added}; ${unavailable} ${unavailable === 1 ? 'card was' : 'cards were'} unavailable.`
          : added
            ? `Added ${added} ${added === 1 ? 'land' : 'lands'}.`
            : 'All matching lands are already in the deck.',
      );
    } finally {
      setAddingLandGroup(null);
    }
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
              <span className="db-meta"> · Auto fills basics to target by source minimums + pip ratio</span>
            ) : null}
          </div>

          {diagnostics && diagnostics.colours.length ? (
            <section
              className="db-basics-diagnostics"
              aria-label="Auto basics diagnostics"
              style={{
                border: '1px solid var(--db-border, #444)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <div className="db-meta" style={{ marginBottom: '8px' }}>
                Land sources {diagnostics.sourceBudget} · Nonbasic lands {diagnostics.nonBasicLands} · Basic budget {diagnostics.budget}
              </div>
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'grid',
                  gap: '8px',
                }}
              >
                {diagnostics.colourBreakdown.map((row) => (
                  <li
                    key={row.colour}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(72px, 96px) 1fr',
                      gap: '8px',
                      alignItems: 'start',
                    }}
                  >
                    <strong>{COLOUR_LABELS[row.colour]}</strong>
                    <div className="db-meta">
                      Sources {row.totalSources} = lands {row.existingLandSources} + basics {row.totalBasics}
                      {' · '}
                      Demand {row.demand}
                      {' · '}
                      Min {row.minimumSourceGoal} (card {row.singleCardFloor}, ratio {row.proportionalSourceGoal})
                      {' · '}
                      Added {row.floorAllocatedBasics} floor + {row.ratioAllocatedBasics} ratio
                      {' · '}
                      Driver {allocationReasonLabel(row.allocationReason)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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

          <section className="db-basics-multicolour" aria-label="Add multicolour lands">
            <strong>Add multicolour lands</strong>
            <div className="db-basics-add-types" role="group" aria-label="Add land cycle">
              {landGroups.map((group) => {
                const tooNarrow = commanderIdentity.letters.length < group.minimumColours;
                return (
                  <button
                    key={group.key}
                    type="button"
                    className="db-btn"
                    disabled={!commanderIdentity.known || tooNarrow || !group.cards.length || Boolean(addingLandGroup)}
                    aria-label={`Add ${group.label}`}
                    onClick={() => void addLandGroup(group)}
                  >
                    {addingLandGroup === group.key ? 'Adding…' : group.label}
                  </button>
                );
              })}
            </div>
            <span className="db-meta" aria-live="polite">
              {landAddMessage || (!commanderIdentity.known ? 'Resolve the commander colour identity to enable these buttons.' : '')}
            </span>
          </section>

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
