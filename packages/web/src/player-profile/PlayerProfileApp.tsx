import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  builderFormatForDeck,
  partitionWantSourcesBySwimlane,
  previewDecksPerFormat,
  resolveDeckCards,
  type CardView,
  type DeckDocument,
  type DeckFormat,
  type DeckSummary,
  type WantSource,
} from '@rayenz-hub/shared';
import { apiListPublicDecks } from '../deck-builder/store/deck-api';
import { LibraryCoverArt } from '../deck-builder/library/LibraryCoverArt';
import { CARD_SIZE_PX } from '../deck-builder/card-size';
import { FormatBadge, formatDisplayName } from '../deck-builder/ui/FormatBadge';
import { MiniCard } from '../deck-builder/swaps/swap-pair-faces';
import { sortLibraryDecks } from '../deck-builder/library/library-sort';
import '../deck-builder/deck-builder.css';
import {
  builderHash,
  parseUserProfileRoute,
  swapQueueHash,
  userProfileShareUrl,
} from '../hub/routes';
import { toKebabCase } from '../lib/string-utils';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { navigateHub } from '../lib/hub-storage';
import { loadPublicSwapWantSources } from '../swap-queue/aggregate';
import { enrichWantSourcesUsd } from '../swap-queue/enrich-prices';
import { copyText } from '../swap-queue/export-ui';
import './player-profile.css';

const SWAP_PREVIEW_CAP = 12;
const PROFILE_DECKS_PER_FORMAT = 5;

const FORMAT_ORDER: DeckFormat[] = ['commander', 'pendragon', 'cube', 'collection', 'other'];

function resolveWantCard(s: WantSource, byDeck: Map<string, DeckDocument>): CardView {
  const deck = byDeck.get(s.deckId);
  const cards = deck ? resolveDeckCards(deck) : [];
  const found = cards.find((c) => c.instanceId === s.cardInstanceId);
  if (found) return { ...found, quantity: s.quantity };
  return {
    instanceId: s.cardInstanceId,
    name: s.cardName,
    quantity: s.quantity,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: s.setCode,
    collectorNumber: s.collectorNumber,
    scryfallId: null,
    archidektCardId: null,
    foil: s.foil,
    proxy: false,
    colourIdentity: [],
    typeLine: null,
    layout: null,
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: null,
    flavorName: null,
    manaValue: null,
    imageUrl: null,
  };
}

function ProfileLibrarySection({
  format,
  decks,
  userSlug,
}: {
  format: DeckFormat;
  decks: DeckSummary[];
  userSlug: string;
}) {
  if (!decks.length) return null;
  const builderFormat = builderFormatForDeck(format);
  const label = formatDisplayName(format);
  const viewAllHref = builderHash(builderFormat, userSlug);

  return (
    <section className="db-library-section" aria-label={label}>
      <h3 className="db-library-section-title">
        <FormatBadge format={format} showLabel />
        <a className="pp-view-all hub-muted" href={viewAllHref}>
          View all
        </a>
      </h3>
      <ul className="db-library-grid">
        {decks.map((d) => {
          const dual = Boolean(d.coverImageUrl && d.coverImageUrlSecondary);
          const href = builderHash(builderFormat, userSlug, toKebabCase(d.name));
          return (
            <li
              key={d.deckId}
              className={`db-library-tile${dual ? ' is-partner-pair' : ''}${
                d.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : ''
              }`}
            >
              <a href={href} className="db-library-tile-open" title={d.name}>
                <LibraryCoverArt deck={d} />
                <span className="db-library-tile-caption">
                  <FormatBadge format={d.format} />
                  <span className="db-library-tile-name">{d.name}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShareLinkIcon() {
  return (
    <svg
      className="pp-share-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function PlayerProfileApp() {
  const progressHostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HubProgressController | null>(null);
  const [routeSlug, setRouteSlug] = useState(() => parseUserProfileRoute()?.userSlug ?? null);
  const [username, setUsername] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [swapDecks, setSwapDecks] = useState<DeckDocument[]>([]);
  const [sources, setSources] = useState<WantSource[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [swapsLoading, setSwapsLoading] = useState(true);

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  useEffect(() => {
    function onHash() {
      setRouteSlug(parseUserProfileRoute()?.userSlug ?? null);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLibraryLoading(true);
      setSwapsLoading(true);
      setError(null);
      setNotFound(false);
      setCopyStatus('');
      setUsername(null);
      setSlug(null);
      setDecks([]);
      setSwapDecks([]);
      setSources([]);

      if (!routeSlug) {
        setNotFound(true);
        setLibraryLoading(false);
        setSwapsLoading(false);
        progressRef.current?.dismiss();
        return;
      }

      progressRef.current?.start({ label: 'Loading profile…', indeterminate: true });

      let libraryOk = false;
      let swapsOk = false;
      let libraryMiss = false;
      let swapsMiss = false;

      const libraryPromise = apiListPublicDecks(routeSlug, {
        previewPerFormat: PROFILE_DECKS_PER_FORMAT,
      })
        .then((library) => {
          if (cancelled) return;
          if (!library) {
            libraryMiss = true;
            return;
          }
          libraryOk = true;
          setUsername(library.username);
          setSlug(library.slug);
          setDecks(library.decks);
        })
        .catch((e) => {
          if (cancelled) return;
          const message = e instanceof Error ? e.message : 'Could not load profile.';
          setError(message);
          progressRef.current?.finish({ label: message, variant: 'error' });
        })
        .finally(() => {
          if (!cancelled) setLibraryLoading(false);
        });

      const swapsPromise = loadPublicSwapWantSources(routeSlug)
        .then(async (swaps) => {
          if (cancelled) return;
          if (!swaps) {
            swapsMiss = true;
            return;
          }
          swapsOk = true;
          setUsername((prev) => prev ?? swaps.username);
          setSlug((prev) => prev ?? swaps.slug);
          setSwapDecks(swaps.decks);
          const priced = await enrichWantSourcesUsd(swaps.sources);
          if (cancelled) return;
          setSources(priced);
        })
        .catch(() => {
          // Library can still render; leave swap section empty on failure.
        })
        .finally(() => {
          if (!cancelled) setSwapsLoading(false);
        });

      await Promise.all([libraryPromise, swapsPromise]);
      if (cancelled) return;

      if (libraryMiss && swapsMiss) {
        setNotFound(true);
        progressRef.current?.dismiss();
        return;
      }
      if (libraryOk || swapsOk) {
        progressRef.current?.dismiss();
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [routeSlug]);

  const lanes = useMemo(() => partitionWantSourcesBySwimlane(sources), [sources]);
  const byDeck = useMemo(() => {
    const map = new Map<string, DeckDocument>();
    for (const d of swapDecks) map.set(d.deckId, d);
    return map;
  }, [swapDecks]);

  const previewCards = useMemo(() => {
    const ordered = [...sources].sort((a, b) => {
      const au = a.usd;
      const bu = b.usd;
      if (au == null && bu == null) return 0;
      if (au == null) return 1;
      if (bu == null) return -1;
      return bu - au;
    });
    return ordered.slice(0, SWAP_PREVIEW_CAP).map((s) => ({
      key: `${s.deckId}:${s.entryId}:${s.kind}`,
      card: resolveWantCard(s, byDeck),
    }));
  }, [sources, byDeck]);

  const decksByFormat = useMemo(() => {
    // API already caps when previewPerFormat is set; re-sort/slice for defense.
    const capped = previewDecksPerFormat(decks, PROFILE_DECKS_PER_FORMAT);
    const groups = new Map<DeckFormat, DeckSummary[]>();
    for (const format of FORMAT_ORDER) groups.set(format, []);
    for (const d of capped) {
      const format = (FORMAT_ORDER.includes(d.format) ? d.format : 'other') as DeckFormat;
      const list = groups.get(format) ?? [];
      list.push(d);
      groups.set(format, list);
    }
    return FORMAT_ORDER.map((format) => ({
      format,
      decks: sortLibraryDecks(groups.get(format) ?? [], 'recent'),
    })).filter((g) => g.decks.length > 0);
  }, [decks]);

  const libraryStyle = {
    ['--db-card-w']: `${CARD_SIZE_PX.M}px`,
  } as CSSProperties;

  const displayName = username || routeSlug || 'Player';
  const profileSlug = slug || routeSlug;
  const showBody = !notFound && !libraryLoading;

  async function onCopyShare() {
    if (!profileSlug) return;
    const ok = await copyText(userProfileShareUrl(profileSlug));
    setCopyStatus(ok ? 'Link copied.' : 'Could not copy link.');
  }

  return (
    <div className="player-profile-app" data-testid="player-profile-app">
      <div className="hub-sticky-chrome">
        <header className="db-header pp-header">
          <div className="pp-title-row">
            <h1>{notFound ? 'Profile' : displayName}</h1>
            {profileSlug && !notFound && !libraryLoading ? (
              <button
                type="button"
                className="pp-share-btn"
                onClick={() => void onCopyShare()}
                aria-label="Copy share link"
                title={copyStatus || 'Copy share link'}
              >
                <ShareLinkIcon />
              </button>
            ) : null}
          </div>
          {copyStatus ? (
            <p className="hub-muted pp-copy-status" role="status">
              {copyStatus}
            </p>
          ) : null}
        </header>
        <div className="hub-progress-host" id="pp-progress-host" ref={progressHostRef} />
      </div>

      <div className="pp-body db-body">
        {error ? (
          <p className="hub-banner-error" role="alert">
            {error}
          </p>
        ) : null}

        {notFound && !libraryLoading && !swapsLoading ? (
          <div className="db-empty-state" data-testid="pp-not-found">
            <p>
              {routeSlug
                ? `User “${routeSlug}” was not found.`
                : 'Open a profile link like #/u/username.'}
            </p>
          </div>
        ) : null}

        {showBody ? (
          <>
            <section className="pp-section" aria-labelledby="pp-libraries-heading">
              <div className="pp-section-head">
                <h2 id="pp-libraries-heading">Public libraries</h2>
              </div>
              {!decks.length ? (
                <div className="db-empty-state">
                  <p>No public decks.</p>
                </div>
              ) : (
                <div className="db-library" style={libraryStyle}>
                  <div className="db-library-sections">
                    {decksByFormat.map(({ format, decks: group }) => (
                      <ProfileLibrarySection
                        key={format}
                        format={format}
                        decks={group}
                        userSlug={profileSlug!}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="pp-section" aria-labelledby="pp-swaps-heading">
              <div className="pp-section-head">
                <h2 id="pp-swaps-heading">Swap queues</h2>
                {profileSlug ? (
                  <a
                    className="hub-btn is-active"
                    href={swapQueueHash(profileSlug)}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateHub(swapQueueHash(profileSlug));
                    }}
                  >
                    Open Swap Queue
                  </a>
                ) : null}
              </div>
              {swapsLoading ? (
                <p className="hub-muted" data-testid="pp-swaps-loading">
                  Loading swap queues…
                </p>
              ) : (
                <>
                  <p className="pp-queue-counts hub-muted" data-testid="pp-queue-counts">
                    Seeking {lanes.seeking.length} · Queued In {lanes.queued_in.length} · Out{' '}
                    {lanes.queued_out.length}
                  </p>
                  {!sources.length ? (
                    <div className="db-empty-state">
                      <p>No public swap queue entries.</p>
                    </div>
                  ) : (
                    <ul
                      className="pp-swap-strip"
                      style={
                        {
                          ['--db-card-w']: `${CARD_SIZE_PX.S}px`,
                        } as CSSProperties
                      }
                      aria-label="Swap queue preview"
                    >
                      {previewCards.map(({ key, card }) => (
                        <li key={key} className="pp-swap-strip-item">
                          <MiniCard card={card} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
