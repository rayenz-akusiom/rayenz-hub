import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { setParentHash } from '../lib/hub-storage';
import { neopetsFetch } from '../lib/neopets-bridge';
import { runCoconutShy, refreshWishingWellStatus, runWishingWell } from './automations';
import {
  ITEMDB_ICON,
  SDB_ICON,
  SHOP_WIZARD_ICON,
  WISHLIST_MENU_ICON,
  WISHLIST_NEXT_ICON,
} from './icons';
import {
  type ListTarget,
  type WishlistItem,
  addToBlacklist,
  clearSessionSkips,
  formatCacheAgeMs,
  getBlacklistedItemsForMenu,
  itemdbUrlForWishlistItem,
  loadListTargets,
  removeFromBlacklist,
  skipCurrentItem,
} from './itemdb';
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
}) {
  const Tag = props.tag || (props.href ? 'a' : 'button');
  const className = 'wishlist-action-btn' + (props.className ? ' ' + props.className : '');
  const common = {
    className,
    title: props.title,
    'aria-label': props.title,
    children: <img src={props.iconSrc} alt="" referrerPolicy="no-referrer" />,
  };
  if (Tag === 'a') {
    return (
      <a {...common} href={props.href} target="_blank" rel="noopener" {...props.dataAttrs} />
    );
  }
  return (
    <button type="button" {...common} onClick={props.onClick} {...props.dataAttrs} />
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

function WishlistCard({
  target,
  onChanged,
}: {
  target: ListTarget;
  onChanged: (next: ListTarget) => void;
}) {
  const list = target.list;
  const item = target.item;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const openMenu = (clientX: number, clientY: number) => {
    setMenu({ x: clientX, y: clientY });
  };

  const cacheHint =
    target.cachedAt != null ? formatCacheAgeMs(Date.now() - target.cachedAt) : '';

  let body: ReactNode;
  if (!item) {
    let message = 'No tradeable items found';
    if (target.error === 'loading') message = 'Loading…';
    else if (target.error === 'no-bridge') {
      message = 'Install the Rayenz Dailies userscript to load wishlists';
    } else if (target.error === 'waiting-for-cache') {
      message = 'Wishlist not cached yet — will fetch on a later visit';
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
              title="Next item"
              iconSrc={WISHLIST_NEXT_ICON}
              onClick={() => {
                if (item.itemIid != null) {
                  onChanged(skipCurrentItem(list, item.itemIid));
                }
              }}
            />
            <ActionIcon title={'Shop Wizard: ' + item.name} href={sswUrl} iconSrc={SHOP_WIZARD_ICON} />
            <ActionIcon title="Hide on ItemDB" href={itemdbUrl} iconSrc={ITEMDB_ICON} />
            <ActionIcon title="Find in SDB" href={sdbUrl} iconSrc={SDB_ICON} />
          </div>
        </div>
        {price ? <div className="wishlist-card-price">{price}</div> : null}
      </div>
    );
  }

  const blacklisted = getBlacklistedItemsForMenu(list);

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
        </div>
        <ActionIcon
          className="wishlist-card-menu-btn"
          title="Wishlist options"
          iconSrc={WISHLIST_MENU_ICON}
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            openMenu(rect.left, rect.bottom + 4);
          }}
        />
      </div>
      {body}
      {menu ? (
        <div
          className="wishlist-context-menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999 }}
          role="menu"
        >
          {item?.itemIid != null ? (
            <button
              type="button"
              className="wishlist-context-menu-item"
              onClick={() => {
                onChanged(addToBlacklist(list, item.itemIid));
                setMenu(null);
              }}
            >
              Blacklist &quot;{item.name}&quot;
            </button>
          ) : null}
          {blacklisted.length > 0 ? (
            <>
              <div className="wishlist-context-menu-heading">Blacklisted</div>
              {blacklisted.map((entry) => (
                <button
                  key={entry.itemIid}
                  type="button"
                  className="wishlist-context-menu-item"
                  onClick={() => {
                    onChanged(removeFromBlacklist(list, entry.itemIid));
                    setMenu(null);
                  }}
                >
                  Remove &quot;{entry.name}&quot;
                </button>
              ))}
            </>
          ) : null}
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
  const [alerts, setAlerts] = useState(() => getActiveCards(settings));
  const [wishlistTargets, setWishlistTargets] = useState<ListTarget[]>([]);
  const [wish, setWish] = useState(() => loadWishingWellState().wish || '');
  const [donation, setDonation] = useState(() => String(loadWishingWellState().donation || 21));

  const wishlists = useMemo(() => getWishlists(settings), [settings]);
  const groups = useMemo(() => getLinksByGroup(settings), [settings]);

  const refreshAlerts = useCallback(() => {
    setAlerts(getActiveCards(loadSettings()));
  }, []);

  useEffect(() => {
    clearSessionSkips();
    let cancelled = false;
    (async () => {
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
      const targets = await loadListTargets(wishlists, settings);
      if (!cancelled) {
        setWishlistTargets(targets);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wishlists, settings]);

  useEffect(() => {
    refreshWishingWellStatus().catch(() => {
      /* bridge may be missing */
    });
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
    setSettings(loadSettings());
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
                onClick={() => {
                  setPetEditValue(petName);
                  setPetEditOpen(true);
                }}
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
        <div className="hub-progress-host" id="dailies-progress-host" />
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

      {petEditOpen ? (
        <div className="pet-edit-popover" role="dialog" aria-label="Edit main pet">
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
            />
            <div className="pet-edit-popover-actions">
              <button type="submit" className="pet-edit-popover-save">
                Save
              </button>
              <button
                type="button"
                className="pet-edit-popover-cancel"
                onClick={() => setPetEditOpen(false)}
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
            <h2 className="dailies-section-heading">Wishlists</h2>
            <div className="wishlist-cards">
              {wishlistTargets.length === 0 ? (
                <p className="wishlist-empty-note">No wishlists configured.</p>
              ) : (
                wishlistTargets.map((target) => (
                  <WishlistCard
                    key={target.list.id}
                    target={target}
                    onChanged={(next) => {
                      setWishlistTargets((prev) =>
                        prev.map((t) => (t.list.id === next.list.id ? next : t)),
                      );
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
                  <div>
                    <strong>Coconut Shy</strong>
                    <br />
                    <span className="text-small">20 throws/day · 100 NP each</span>
                  </div>
                </div>
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
                <div className="automated-status" id="cocoshy-status">
                  Ready.
                </div>
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
                  <div>
                    <strong>Wishing Well</strong>
                    <br />
                    <span className="text-small">7 wishes per period · 21 NP min</span>
                  </div>
                </div>
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
                <div className="automated-status" id="wishingwell-status">
                  Ready.
                </div>
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
              </div>
            ) : (
              <div className="daily-tile sidebar-tile pet-edit-host pet-tile--empty">
                <span className="pet-tile-placeholder">No main pet</span>
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
