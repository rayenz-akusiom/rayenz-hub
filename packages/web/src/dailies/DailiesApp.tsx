import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { setParentHash } from '../lib/hub-storage';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { neopetsFetch } from '../lib/neopets-bridge';
import { runCoconutShy, refreshWishingWellStatus, runWishingWell } from './automations';
import {
  ITEMDB_ICON,
  SDB_ICON,
  SHOP_WIZARD_ICON,
  WISHLIST_ACQUIRED_ICON,
  WISHLIST_MENU_ICON,
} from './icons';
import {
  type ListTarget,
  type WishlistItem,
  clearSessionSkips,
  formatCacheAgeMs,
  itemdbUrlForWishlistItem,
  loadListTargets,
  markItemAcquired,
  syncAcquiredMemory,
} from './itemdb';
import {
  buildNeededSnapshot,
  pullAcquisitionDeltasFromBridge,
  pushNeededSnapshotToBridge,
} from './needed-bridge';
import { acquiredIidSet, getAcquired, getProgressMeta, markAcquired } from './acquisition-store';
import {
  formatSyncResultSummary,
  isHubSyncableListId,
  syncAllHubProgressLists,
  syncProgressForList,
} from './progress-sync';
import { ALBUM_LINK_IDS, BOOK_SHOPS, getLinksByGroup, type DailyLink } from './links';
import {
  getMainPet,
  getMainPetSlug,
  getWishlists,
  loadSettings,
  parsePetImageSlug,
  saveMainPet,
} from './settings';
import {
  getActiveCards,
  handleCardClick,
  msUntilNextLocalMinute,
  msUntilNextNstHour,
  msUntilNextNstMidnight,
} from './timed';
import { loadWishingWellState, updateWishingPreferences } from './wishing-well';

function formatNpPrice(value: number | null | undefined): string | null {
  if (value == null || value === Infinity || Number.isNaN(value)) {
    return null;
  }
  return Number(value).toLocaleString('en-US') + ' NP';
}

function sswUrlForItem(item: WishlistItem): string {
  if (item.shopWizardUrl) {
    return item.shopWizardUrl;
  }
  return 'https://www.neopets.com/shops/wizard.phtml?string=' + encodeURIComponent(item.name);
}

function sdbUrlForItem(item: WishlistItem): string {
  return (
    'https://www.neopets.com/safetydeposit.phtml?obj_name=' +
    encodeURIComponent(item.name) +
    '&category=0'
  );
}

function buildPetHref(template: string | undefined, petName: string): string {
  if (!template) {
    return 'https://www.neopets.com/petlookup.phtml?pet=' + encodeURIComponent(petName);
  }
  return template.replace('{pet}', encodeURIComponent(petName));
}

function petHeadshotUrl(petName: string, slug: string): string {
  if (slug) {
    return 'https://pets.neopets.com/cp/' + encodeURIComponent(slug) + '/1/1.png';
  }
  return 'https://pets.neopets.com/cpn/' + encodeURIComponent(petName) + '/1/1.png';
}

function petFullBodyUrl(petName: string, slug: string): string {
  if (slug) {
    return 'https://pets.neopets.com/cp/' + encodeURIComponent(slug) + '/1/4.png';
  }
  return 'https://pets.neopets.com/cpn/' + encodeURIComponent(petName) + '/1/4.png';
}

function ActionIcon(props: {
  tag?: 'a' | 'button';
  href?: string;
  title: string;
  iconSrc: string;
  onClick?: (e: MouseEvent) => void;
  dataAttrs?: Record<string, string>;
  className?: string;
  ariaExpanded?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const Tag = props.tag || (props.href ? 'a' : 'button');
  const className = 'wishlist-action-btn' + (props.className ? ' ' + props.className : '');
  const common = {
    className,
    title: props.title,
    'aria-label': props.title,
    children: <img src={props.iconSrc} alt="" referrerPolicy="no-referrer" />,
    ...(props.ariaExpanded != null ? { 'aria-expanded': props.ariaExpanded } : {}),
  };
  if (Tag === 'a') {
    return (
      <a {...common} href={props.href} target="_blank" rel="noopener" {...props.dataAttrs} />
    );
  }
  return (
    <button
      type="button"
      ref={props.buttonRef}
      {...common}
      onClick={props.onClick}
      {...props.dataAttrs}
    />
  );
}

function LinkTile({
  link,
  petName,
  extraClass,
}: {
  link: DailyLink;
  petName: string;
  extraClass?: string;
}) {
  let url = link.url || '#';
  let img = link.img || '';
  if (link.petLink) {
    url = buildPetHref(link.petHref, petName);
  }
  if (link.kind === 'pet') {
    img = petFullBodyUrl(petName, getMainPetSlug());
  }
  const tileClass = 'daily-tile' + (extraClass ? ' ' + extraClass : '');
  return (
    <div className={tileClass} data-link-id={link.id}>
      <a href={url} target="_blank" rel="noopener">
        {img ? <img src={img} alt="" referrerPolicy="no-referrer" /> : null}
      </a>
      <a href={url} target="_blank" rel="noopener">
        {link.label}
      </a>
      {link.note ? <span className="text-small">{link.note}</span> : null}
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={'collapsible sidebar-collapsible' + (open ? ' active' : '')}
        onClick={() => setOpen((v) => !v)}
      >
        {title}
      </button>
      <div className={'collapsible-content' + (open ? ' active' : '')}>{children}</div>
    </>
  );
}

type WishlistSyncHint = {
  visible: string;
  detail?: string;
};

function WishlistCard({
  target,
  onChanged,
  syncHint,
  onSync,
  syncing,
}: {
  target: ListTarget;
  onChanged: (next: ListTarget) => void;
  syncHint?: WishlistSyncHint | null;
  onSync?: () => void;
  syncing?: boolean;
}) {
  const list = target.list;
  const item = target.item;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const hubSyncable = isHubSyncableListId(list.id);

  const openMenu = (clientX: number, clientY: number) => {
    setMenu({ x: clientX, y: clientY });
  };

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    const onScroll = () => setMenu(null);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menu]);

  const cacheHint =
    target.cachedAt != null ? formatCacheAgeMs(Date.now() - target.cachedAt) : '';

  let body: ReactNode;
  if (!item) {
    let message = 'No needed items left (or catalog empty)';
    if (target.error === 'loading') message = 'Loading…';
    else if (target.error === 'no-bridge') {
      message = 'Install the Rayenz Dailies userscript to load catalogs';
    } else if (target.error === 'waiting-for-cache') {
      message = 'Catalog not cached yet — will fetch on a later visit';
    } else if (target.error) {
      message = target.error;
    }
    body = (
      <div className="wishlist-card-body wishlist-card-body--fallback">
        <p className="wishlist-card-message">{message}</p>
      </div>
    );
  } else {
    const sswUrl = sswUrlForItem(item);
    const itemdbUrl = itemdbUrlForWishlistItem(item) || '#';
    const sdbUrl = sdbUrlForItem(item);
    const price = formatNpPrice(item.priceNp);
    body = (
      <div className="wishlist-card-body">
        <a
          className="wishlist-card-item-image"
          href={sswUrl}
          target="_blank"
          rel="noopener"
          title={'Shop Wizard: ' + item.name}
        >
          <img src={item.image || list.img} alt="" referrerPolicy="no-referrer" />
        </a>
        <div className="wishlist-card-item-text">
          <div className="wishlist-card-item-name">{item.name}</div>
          {item.description ? (
            <div className="wishlist-card-item-desc">{item.description}</div>
          ) : null}
          <div className="wishlist-card-actions">
            <ActionIcon
              title={'Mark "' + item.name + '" acquired'}
              iconSrc={WISHLIST_ACQUIRED_ICON}
              onClick={() => {
                if (item.itemIid != null) {
                  void markItemAcquired(list, item.itemIid, 'manual').then(onChanged);
                }
              }}
            />
            <ActionIcon title={'Shop Wizard: ' + item.name} href={sswUrl} iconSrc={SHOP_WIZARD_ICON} />
            <ActionIcon title="Open on ItemDB" href={itemdbUrl} iconSrc={ITEMDB_ICON} />
            <ActionIcon title="Find in SDB" href={sdbUrl} iconSrc={SDB_ICON} />
          </div>
        </div>
        {price ? <div className="wishlist-card-price">{price}</div> : null}
      </div>
    );
  }

  return (
    <article
      className="wishlist-card"
      data-wishlist-id={list.id}
      data-item-iid={item?.itemIid != null ? String(item.itemIid) : undefined}
      data-item-name={item?.name || undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
      }}
    >
      <div className="wishlist-card-header">
        {list.img ? (
          <img className="wishlist-card-list-icon" src={list.img} alt="" referrerPolicy="no-referrer" />
        ) : null}
        <div className="wishlist-card-header-text">
          <a className="wishlist-card-title" href={list.listUrl} target="_blank" rel="noopener">
            {list.label}
          </a>
          {cacheHint ? (
            <span className="wishlist-cache-hint">Cached {cacheHint} ago</span>
          ) : null}
          {syncHint ? (
            <span
              className="wishlist-cache-hint"
              title={syncHint.detail || undefined}
              aria-label={syncHint.detail || syncHint.visible}
            >
              {syncHint.visible}
            </span>
          ) : null}
        </div>
        <ActionIcon
          className="wishlist-card-menu-btn"
          title="List options"
          iconSrc={WISHLIST_MENU_ICON}
          ariaExpanded={!!menu}
          buttonRef={menuBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            if (menu) {
              setMenu(null);
              return;
            }
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            openMenu(rect.left, rect.bottom + 4);
          }}
        />
      </div>
      {body}
      {menu ? (
        <div
          ref={menuRef}
          className="wishlist-context-menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999 }}
          role="menu"
        >
          {item?.itemIid != null ? (
            <button
              type="button"
              className="wishlist-context-menu-item"
              onClick={() => {
                void markItemAcquired(list, item.itemIid, 'manual').then(onChanged);
                setMenu(null);
              }}
            >
              Mark &quot;{item.name}&quot; acquired
            </button>
          ) : null}
          {hubSyncable ? (
            <button
              type="button"
              className="wishlist-context-menu-item"
              disabled={!!syncing}
              onClick={() => {
                setMenu(null);
                onSync?.();
              }}
            >
              {syncing ? 'Syncing…' : 'Sync this list'}
            </button>
          ) : (
            <a
              className="wishlist-context-menu-item"
              href="https://www.neopets.com/stamps.phtml?type=progress"
              target="_blank"
              rel="noopener"
              onClick={() => setMenu(null)}
            >
              Open Stamp Album to sync
            </a>
          )}
          <button
            type="button"
            className="wishlist-context-menu-item"
            onClick={() => setMenu(null)}
          >
            Close
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function DailiesApp() {
  const [settings, setSettings] = useState(() => loadSettings());
  const [petName, setPetName] = useState(() => getMainPet());
  const [petSlug, setPetSlug] = useState(() => getMainPetSlug());
  const [petEditOpen, setPetEditOpen] = useState(false);
  const [petEditValue, setPetEditValue] = useState('');
  const [petEditPos, setPetEditPos] = useState<{ top: number; left: number } | null>(null);
  const [alerts, setAlerts] = useState(() => getActiveCards(settings));
  const [wishlistTargets, setWishlistTargets] = useState<ListTarget[]>([]);
  const [wishlistsLoading, setWishlistsLoading] = useState(false);
  const [syncingListId, setSyncingListId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncHints, setSyncHints] = useState<Record<string, WishlistSyncHint>>({});
  const [wish, setWish] = useState(() => loadWishingWellState().wish || '');
  const [donation, setDonation] = useState(() => String(loadWishingWellState().donation || 21));
  const wishlistReloadGen = useRef(0);

  const wishlists = useMemo(() => getWishlists(settings), [settings]);
  const groups = useMemo(() => getLinksByGroup(settings), [settings]);

  const refreshAlerts = useCallback(() => {
    setAlerts(getActiveCards(loadSettings()));
  }, []);

  const refreshSyncHints = useCallback(async () => {
    const meta = await getProgressMeta();
    const hints: Record<string, WishlistSyncHint> = {};
    for (const list of wishlists) {
      const catalog = meta.catalogCounts?.[list.id];
      const unmatched = meta.unmatchedCounts?.[list.id];
      if (catalog != null) {
        const acquiredDoc = await getAcquired(list.id);
        const acquired = acquiredIidSet(acquiredDoc).size;
        const remaining = Math.max(0, catalog - acquired);
        let detail = 'acquired ' + acquired + ' / catalog ' + catalog;
        if (unmatched != null && unmatched > 0) {
          detail += ' · unmatched ' + unmatched;
        }
        hints[list.id] = { visible: 'Remaining ' + remaining, detail };
        continue;
      }
      const at = meta.lastSyncAt?.[list.id];
      let visible = '';
      if (at) {
        visible = 'Synced ' + formatCacheAgeMs(Date.now() - at) + ' ago';
      } else if (list.id === 'stamps-wishlist') {
        const pages = Object.keys(meta.stampPagesSynced || {}).length;
        visible = pages
          ? pages + ' stamp page(s) synced (on-page)'
          : 'Sync on Stamp Album pages only';
      }
      if (unmatched != null && unmatched > 0) {
        visible = (visible ? visible + ' · ' : '') + unmatched + ' unmatched';
      }
      if (visible) {
        hints[list.id] = { visible };
      }
    }
    setSyncHints(hints);
  }, [wishlists]);

  const pushNeededToBridge = useCallback(() => {
    const snapshot = buildNeededSnapshot(wishlists);
    pushNeededSnapshotToBridge(snapshot);
  }, [wishlists]);

  const mergeBridgeDeltas = useCallback(async () => {
    const deltas = pullAcquisitionDeltasFromBridge();
    for (const delta of deltas) {
      if (!delta?.listId || !Array.isArray(delta.itemIids) || !delta.itemIids.length) {
        continue;
      }
      await markAcquired(delta.listId, delta.itemIids, 'action');
      syncAcquiredMemory(delta.listId, delta.itemIids);
    }
  }, []);

  const reloadWishlists = useCallback(
    async (options?: { clearSkips?: boolean }) => {
      if (options?.clearSkips) {
        clearSessionSkips();
      }
      const gen = ++wishlistReloadGen.current;
      setWishlistsLoading(true);
      setWishlistTargets(
        wishlists.map((list) => ({
          list,
          item: null,
          error: 'loading',
          fromCache: false,
          cachedAt: null,
          refreshed: false,
        })),
      );
      try {
        await mergeBridgeDeltas();
        const targets = await loadListTargets(wishlists, settings);
        if (gen === wishlistReloadGen.current) {
          setWishlistTargets(targets);
          pushNeededToBridge();
          void refreshSyncHints();
        }
      } finally {
        if (gen === wishlistReloadGen.current) {
          setWishlistsLoading(false);
        }
      }
    },
    [wishlists, settings, mergeBridgeDeltas, pushNeededToBridge, refreshSyncHints],
  );

  async function handleSyncList(listId: string) {
    const list = wishlists.find((w) => w.id === listId);
    if (!list || !isHubSyncableListId(listId)) {
      return;
    }
    setSyncingListId(listId);
    setSyncStatus(null);
    try {
      const result = await syncProgressForList(list, { petName });
      setSyncStatus(formatSyncResultSummary(result, list.label));
      await reloadWishlists();
    } finally {
      setSyncingListId(null);
    }
  }

  async function handleSyncAllHub() {
    setSyncingListId('__all__');
    setSyncStatus(null);
    try {
      const results = await syncAllHubProgressLists(wishlists, { petName });
      const parts = results.map((r) => {
        const list = wishlists.find((w) => w.id === r.listId);
        return formatSyncResultSummary(r, list?.label);
      });
      setSyncStatus(parts.join(' · ') || 'Nothing to sync');
      await reloadWishlists();
    } finally {
      setSyncingListId(null);
    }
  }

  useEffect(() => {
    void reloadWishlists({ clearSkips: true });
    return () => {
      wishlistReloadGen.current += 1;
    };
  }, [reloadWishlists]);

  useEffect(() => {
    refreshWishingWellStatus().catch(() => {
      /* bridge may be missing */
    });
  }, []);

  useEffect(() => {
    type ProgressWindow = Window & {
      __cocoshyProgress?: HubProgressController;
      __wishingwellProgress?: HubProgressController;
    };
    const win = window as ProgressWindow;
    const cocoHost = document.getElementById('cocoshy-progress-host');
    const wishHost = document.getElementById('wishingwell-progress-host');
    const cocoProgress = cocoHost ? HubProgress.mount(cocoHost) : null;
    const wishProgress = wishHost ? HubProgress.mount(wishHost) : null;
    if (cocoProgress) {
      win.__cocoshyProgress = cocoProgress;
    }
    if (wishProgress) {
      win.__wishingwellProgress = wishProgress;
    }
    return () => {
      cocoProgress?.dismiss();
      wishProgress?.dismiss();
      delete win.__cocoshyProgress;
      delete win.__wishingwellProgress;
    };
  }, []);

  useEffect(() => {
    let timers: number[] = [];
    const schedule = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers = [];
      refreshAlerts();
      timers.push(window.setTimeout(schedule, 60_000));
      timers.push(window.setTimeout(schedule, msUntilNextNstMidnight()));
      timers.push(window.setTimeout(schedule, msUntilNextNstHour()));
      timers.push(window.setTimeout(schedule, msUntilNextLocalMinute()));
    };
    schedule();
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [refreshAlerts]);

  async function savePet(e: FormEvent) {
    e.preventDefault();
    const name = petEditValue.trim();
    const previousSlug = getMainPetSlug();
    let slug: string | null = previousSlug || null;
    if (name) {
      try {
        const resp = await neopetsFetch(
          'https://www.neopets.com/petlookup.phtml?pet=' + encodeURIComponent(name),
        );
        slug =
          parsePetImageSlug(resp.text, {
            previousSlug,
            nameChanged: name !== getMainPet(),
          }) || slug;
      } catch {
        /* keep previous slug */
      }
    }
    saveMainPet(name, slug);
    setPetName(name);
    setPetSlug(slug || '');
    setPetEditOpen(false);
    setPetEditPos(null);
    setSettings(loadSettings());
  }

  function openPetEdit(anchor: HTMLElement, initialValue: string) {
    const rect = anchor.getBoundingClientRect();
    const popoverWidth = 240;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - popoverWidth - 8),
    );
    const top = Math.min(rect.bottom + 8, window.innerHeight - 160);
    setPetEditValue(initialValue);
    setPetEditPos({ top, left });
    setPetEditOpen(true);
  }

  const quickLinks = (groups[1] || []).filter((l) => l.id !== 'main-pet');
  const albumLinks = (groups[2] || []).filter((l) => ALBUM_LINK_IDS.includes(l.id));
  const dailiesLinks = Object.keys(groups)
    .map(Number)
    .filter((g) => g >= 3)
    .sort((a, b) => a - b)
    .flatMap((g) => groups[g] || []);

  return (
    <div className="dailies-app" data-neopets-dailies="rayenz">
      <div className="hub-sticky-chrome dailies-sticky-chrome">
        <header className="page_title site-header">
          <div className="site-header-start">
            <div className="pet-edit-host">
              {petName ? (
                <a
                  className="pet-headshot-link"
                  href={
                    'https://www.neopets.com/petlookup.phtml?pet=' + encodeURIComponent(petName)
                  }
                  target="_blank"
                  rel="noopener"
                  title="View pet profile"
                >
                  <img
                    className="pet-headshot"
                    src={petHeadshotUrl(petName, petSlug)}
                    alt="Main pet"
                  />
                </a>
              ) : (
                <span className="pet-headshot pet-headshot--empty" aria-hidden="true" />
              )}
              <button
                type="button"
                className="pet-edit-btn"
                aria-label="Edit main pet"
                title="Edit main pet"
                onClick={(e) => openPetEdit(e.currentTarget, petName)}
              >
                ✎
              </button>
            </div>
            <h1>Rayenz&apos;s Dailies</h1>
          </div>
          <a
            className="settings-gear"
            href="#/settings/dailies"
            aria-label="Open settings"
            title="Settings"
            onClick={(e) => {
              e.preventDefault();
              setParentHash('/settings/dailies');
            }}
          >
            ⚙
          </a>
        </header>
        <div id="seasonal-alerts" className="seasonal-alerts" hidden={alerts.length === 0}>
          <div className="seasonal-alerts-heading">Timed &amp; Seasonal</div>
          <div className="seasonal-alerts-grid">
            {alerts.map((card) => (
              <a
                key={card.id}
                className={'seasonal-alert-card ' + card.styleClass}
                href={card.url}
                target="_blank"
                rel="noopener"
                data-timed-id={card.id}
                onClick={() => {
                  handleCardClick(card);
                  refreshAlerts();
                }}
              >
                <img src={card.img} alt="" referrerPolicy="no-referrer" />
                <span>
                  <span className="seasonal-alert-label">{card.name}</span>
                  {card.note ? <span className="seasonal-alert-note">{card.note}</span> : null}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {petEditOpen && petEditPos ? (
        <div
          className="pet-edit-popover"
          role="dialog"
          aria-label="Edit main pet"
          style={{ top: petEditPos.top, left: petEditPos.left }}
        >
          <form onSubmit={savePet}>
            <label className="pet-edit-popover-label" htmlFor="pet-edit-input">
              Pet name
            </label>
            <input
              id="pet-edit-input"
              className="pet-edit-popover-input"
              value={petEditValue}
              onChange={(e) => setPetEditValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Your_Pet_Name"
              autoFocus
            />
            <div className="pet-edit-popover-actions">
              <button type="submit" className="pet-edit-popover-save">
                Save
              </button>
              <button
                type="button"
                className="pet-edit-popover-cancel"
                onClick={() => {
                  setPetEditOpen(false);
                  setPetEditPos(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="dailies-layout">
        <section className="dailies-main" id="dailies-links">
          <section className="dailies-wishlists-section">
            <div className="dailies-wishlists-heading">
              <h2 className="dailies-section-heading">Tracking lists</h2>
              <div className="dailies-wishlists-heading-actions">
                <button
                  type="button"
                  className="wishlist-refresh-btn"
                  disabled={wishlistsLoading || syncingListId === '__all__'}
                  onClick={() => void handleSyncAllHub()}
                >
                  Sync progress
                </button>
                <button
                  type="button"
                  className="wishlist-refresh-btn"
                  disabled={wishlistsLoading}
                  onClick={() => void reloadWishlists()}
                >
                  Refresh
                </button>
              </div>
            </div>
            {syncStatus ? <p className="wishlist-sync-status">{syncStatus}</p> : null}
            <div className="wishlist-cards">
              {wishlistTargets.length === 0 ? (
                <p className="wishlist-empty-note">No tracking lists enabled — turn them on in Settings.</p>
              ) : (
                wishlistTargets.map((target) => (
                  <WishlistCard
                    key={target.list.id}
                    target={target}
                    syncHint={syncHints[target.list.id]}
                    syncing={syncingListId === target.list.id || syncingListId === '__all__'}
                    onSync={() => void handleSyncList(target.list.id)}
                    onChanged={(next) => {
                      setWishlistTargets((prev) =>
                        prev.map((t) => (t.list.id === next.list.id ? next : t)),
                      );
                      pushNeededToBridge();
                      void refreshSyncHints();
                    }}
                  />
                ))
              )}
            </div>
          </section>

          <section className="dailies-dailies-section">
            <h2 className="dailies-section-heading">Dailies</h2>
            <div className="grid dailies-grid">
              {dailiesLinks.map((link) => (
                <LinkTile key={link.id} link={link} petName={petName} />
              ))}
            </div>
          </section>

          <section className="dailies-automated-section">
            <h2 className="dailies-section-heading">Automated</h2>
            <div className="automated-panel">
              <div className="automated-item" id="cocoshy-automation">
                <div className="automated-header">
                  <a
                    className="daily-icon-box"
                    href="https://www.neopets.com/halloween/cocoshy.phtml"
                    target="_blank"
                    rel="noopener"
                  >
                    <img
                      src="https://images.neopets.com/items/spo_coconut_1.gif"
                      alt="Coconut Shy"
                      referrerPolicy="no-referrer"
                    />
                  </a>
                  <div className="automated-header-text">
                    <strong>Coconut Shy</strong>
                    <span className="text-small">20 throws/day · 100 NP each</span>
                  </div>
                </div>
                <div className="automated-body" />
                <div className="automated-actions">
                  <button
                    type="button"
                    className="automated-run"
                    id="cocoshy-run"
                    onClick={() => {
                      void runCoconutShy();
                    }}
                  >
                    Run 20 throws
                  </button>
                </div>
                <div className="hub-progress-host automated-progress-host" id="cocoshy-progress-host" />
              </div>
              <div className="automated-item" id="wishingwell-automation">
                <div className="automated-header">
                  <a
                    className="daily-icon-box"
                    href="https://www.neopets.com/wishing.phtml"
                    target="_blank"
                    rel="noopener"
                  >
                    <img
                      src="https://images.neopets.com/items/foo_toyww_chococoin.gif"
                      alt="Wishing Well"
                      referrerPolicy="no-referrer"
                    />
                  </a>
                  <div className="automated-header-text">
                    <strong>Wishing Well</strong>
                    <span className="text-small">7 wishes per period · 21 NP min</span>
                  </div>
                </div>
                <div className="automated-body">
                  <div className="automated-field">
                    <label htmlFor="wishingwell-wish">Wish for</label>
                    <input
                      type="text"
                      id="wishingwell-wish"
                      placeholder="e.g. Snowager Stamp"
                      value={wish}
                      onChange={(e) => setWish(e.target.value)}
                      onBlur={() => updateWishingPreferences(wish, parseInt(donation, 10))}
                    />
                  </div>
                  <div className="automated-field">
                    <label htmlFor="wishingwell-donation">Donation (NP)</label>
                    <input
                      type="number"
                      id="wishingwell-donation"
                      min={21}
                      value={donation}
                      onChange={(e) => setDonation(e.target.value)}
                      onBlur={() => updateWishingPreferences(wish, parseInt(donation, 10))}
                    />
                  </div>
                </div>
                <div className="automated-actions">
                  <button
                    type="button"
                    className="automated-run"
                    id="wishingwell-run"
                    onClick={() => {
                      updateWishingPreferences(wish, parseInt(donation, 10));
                      void runWishingWell();
                    }}
                  >
                    Run 7 wishes
                  </button>
                </div>
                <div
                  className="hub-progress-host automated-progress-host"
                  id="wishingwell-progress-host"
                />
              </div>
            </div>
          </section>
        </section>

        <aside className="dailies-sidebar" id="dailies-books">
          <div className="dailies-sidebar-pet">
            {petName ? (
              <div className="daily-tile sidebar-tile pet-edit-host">
                <a
                  href={
                    'https://www.neopets.com/petlookup.phtml?pet=' + encodeURIComponent(petName)
                  }
                  target="_blank"
                  rel="noopener"
                >
                  <img src={petFullBodyUrl(petName, petSlug)} alt="" referrerPolicy="no-referrer" />
                </a>
                <span className="main-pet-label">{petName}</span>
                <button
                  type="button"
                  className="pet-edit-btn"
                  aria-label="Edit main pet"
                  title="Edit main pet"
                  onClick={(e) => openPetEdit(e.currentTarget, petName)}
                >
                  ✎
                </button>
              </div>
            ) : (
              <div className="daily-tile sidebar-tile pet-edit-host pet-tile--empty">
                <span className="pet-tile-placeholder" aria-hidden="true" />
                <span className="pet-tile-nameplate">No main pet</span>
                <button
                  type="button"
                  className="pet-edit-btn"
                  aria-label="Set main pet"
                  title="Set main pet"
                  onClick={(e) => openPetEdit(e.currentTarget, '')}
                >
                  ✎
                </button>
              </div>
            )}
          </div>
          <Collapsible title="Quick Links">
            <div className="grid dailies-grid dailies-sidebar-grid">
              {quickLinks.map((link) => (
                <LinkTile key={link.id} link={link} petName={petName} extraClass="sidebar-tile" />
              ))}
            </div>
          </Collapsible>
          <Collapsible title="My Albums">
            <div className="grid dailies-grid dailies-sidebar-grid">
              {albumLinks.map((link) => (
                <LinkTile key={link.id} link={link} petName={petName} extraClass="sidebar-tile" />
              ))}
            </div>
          </Collapsible>
          <Collapsible title="Pinned Shops">
            <div className="grid dailies-grid dailies-sidebar-grid">
              {BOOK_SHOPS.map((shop) => (
                <div key={shop.id} className="daily-tile sidebar-tile" data-link-id={shop.id}>
                  <a href={shop.url} target="_blank" rel="noopener">
                    <img src={shop.img} alt="" referrerPolicy="no-referrer" />
                  </a>
                  <a href={shop.url} target="_blank" rel="noopener">
                    {shop.label}
                  </a>
                </div>
              ))}
            </div>
          </Collapsible>
        </aside>
      </div>
    </div>
  );
}
