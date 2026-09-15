import { cardIsSeekingMarked, isCollectionRepresentativeCard, type CardView } from '@rayenz-hub/shared';
import type { MouseEvent } from 'react';
import { FoilIcon } from '../../cards/FoilIcon';
import { ProxyIcon } from '../../cards/ProxyIcon';
import { SeekingIcon } from '../../cards/SeekingIcon';
import {
  foilCharmEnabled,
  proxyCharmEnabled,
  seekingCharmEnabled,
  stopCharmClick,
  useCardFlagCharms,
} from './CardFlagCharmContext';

export function CardFlagCharms({ card, selected }: { card: CardView; selected?: boolean }) {
  const ctx = useCardFlagCharms();
  if (!ctx?.enabled || ctx.readOnly) return null;
  if (isCollectionRepresentativeCard(card)) return null;

  const targetIds = ctx.resolveTargetIds(card);
  const foil = Boolean(card.foil);
  const proxy = Boolean(card.proxy);
  const seeking = cardIsSeekingMarked(card);
  const foilEnabled = foilCharmEnabled(ctx.deck, card);
  const showProxy = proxyCharmEnabled(ctx.deck);
  const showSeeking = seekingCharmEnabled(ctx.deck, ctx.queuesReadOnly);

  function toggle(
    e: MouseEvent,
    handler: (instanceIds: string[]) => void,
    canFire: boolean,
  ) {
    stopCharmClick(e);
    if (!canFire) return;
    handler(targetIds);
  }

  return (
    <span
      className={`db-card-charms${selected ? ' is-selected' : ''}`}
      onClick={stopCharmClick}
      onPointerDown={stopCharmClick}
    >
      <button
        type="button"
        className={`db-card-charm db-card-charm-foil${foil ? ' is-active' : ''}`}
        aria-label={foil ? 'Unmark foil' : 'Mark as foil'}
        aria-pressed={foil}
        disabled={!foilEnabled && !foil}
        title={
          foil ? 'Foil — click to unmark' : foilEnabled ? 'Mark as foil' : 'Not available in foil'
        }
        onClick={(e) => toggle(e, ctx.onToggleFoil, foilEnabled || foil)}
      >
        <FoilIcon filled={foil} />
      </button>
      {showProxy ? (
        <button
          type="button"
          className={`db-card-charm db-card-charm-proxy${proxy ? ' is-active' : ''}`}
          aria-label={proxy ? 'Unmark proxy' : 'Mark as proxy'}
          aria-pressed={proxy}
          title={proxy ? 'Proxy — click to unmark' : 'Mark as proxy'}
          onClick={(e) => toggle(e, ctx.onToggleProxy, true)}
        >
          <ProxyIcon filled={proxy} />
        </button>
      ) : null}
      {showSeeking ? (
        <button
          type="button"
          className={`db-card-charm db-card-charm-seeking${seeking ? ' is-active' : ''}`}
          aria-label={seeking ? 'Unmark seeking' : 'Mark as seeking'}
          aria-pressed={seeking}
          title={seeking ? 'Seeking — click to unmark' : 'Mark as seeking'}
          onClick={(e) => toggle(e, ctx.onToggleSeeking, true)}
        >
          <SeekingIcon filled={seeking} />
        </button>
      ) : null}
    </span>
  );
}
