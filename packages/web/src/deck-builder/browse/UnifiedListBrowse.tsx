import { useMemo, useState } from 'react';
import {
  cardDisplayName,
  resolveDeckCards,
  unifyDeckCardInstances,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { SyncStatusCharm, type DeckSyncStatus } from '../ui/SyncStatusCharm';

export function UnifiedListBrowse({
  deck,
  onSelectInstance,
  deckMeta,
  deckMetaWarn,
  syncStatus = null,
}: {
  deck: Pick<DeckDocument, 'cards' | 'oracle'>;
  /** Called with an instance id when a drill-down instance button is clicked. */
  onSelectInstance?: (instanceId: string) => void;
  deckMeta?: string;
  deckMetaWarn?: boolean;
  syncStatus?: DeckSyncStatus | null;
}) {
  const rows = useMemo(() => unifyDeckCardInstances(deck as DeckDocument), [deck]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const cardsById = useMemo(
    () => new Map(resolveDeckCards(deck).map((c) => [c.instanceId, c])),
    [deck],
  );

  return (
    <div className="db-browse db-unified-list" data-testid="unified-list-browse">
      {deckMeta || syncStatus ? (
        <div className="db-meta-row">
          {deckMeta ? (
            <p className={`db-meta${deckMetaWarn ? ' is-warn' : ''}`}>{deckMeta}</p>
          ) : null}
          {syncStatus ? <SyncStatusCharm status={syncStatus} /> : null}
        </div>
      ) : null}
      {!rows.length ? <p className="db-empty">No cards in this deck.</p> : null}
      <ul className="db-unified-rows">
        {rows.map((row) => {
          const expanded = expandedKey === row.key;
          return (
            <li key={row.key} className="db-unified-row-wrap">
              <button
                type="button"
                className="db-unified-row"
                aria-expanded={expanded}
                onClick={() => setExpandedKey(expanded ? null : row.key)}
              >
                <span className="db-unified-qty">{row.totalQuantity}</span>
                <span className="db-unified-name">{row.displayName}</span>
                <span className="db-unified-count">
                  {row.instanceIds.length} instance{row.instanceIds.length === 1 ? '' : 's'}
                </span>
              </button>
              {expanded ? (
                <ul className="db-unified-instances">
                  {row.instanceIds.map((instanceId) => {
                    const card = cardsById.get(instanceId);
                    const name = card ? cardDisplayName(card) : instanceId;
                    return (
                      <li key={instanceId}>
                        <button
                          type="button"
                          className="db-unified-instance-btn"
                          onClick={() => onSelectInstance?.(instanceId)}
                        >
                          {name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
