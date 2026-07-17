import type { ReactNode } from 'react';
import type { HubPath } from './routes';

type NavItem = {
  path: HubPath;
  label: string;
  prefix?: string;
  icon: ReactNode;
};

const NEOPETS: NavItem[] = [
  {
    path: '/dailies',
    label: 'Dailies',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M9 16l2 2 4-4" />
      </svg>
    ),
  },
  {
    path: '/neopets-more',
    label: 'More',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
      </svg>
    ),
  },
];

const MTG: NavItem[] = [
  {
    path: '/deck-builder',
    label: 'Deck Builder',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    path: '/deck-suggest',
    label: 'Deck Suggest',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.9V17h8v-2.1A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    path: '/deck-review',
    label: 'Deck Review',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="12" height="16" rx="1.5" />
        <rect x="8" y="5" width="12" height="16" rx="1.5" />
      </svg>
    ),
  },
  {
    path: '/order-reconcile',
    label: 'Order Reconcile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
  },
];

function linkActive(item: NavItem, path: string): boolean {
  if (item.prefix) {
    return path === item.prefix || path.startsWith(`${item.prefix}/`);
  }
  return item.path === path;
}

function NavLink({
  item,
  path,
  onNavigate,
}: {
  item: NavItem;
  path: string;
  onNavigate: () => void;
}) {
  const active = linkActive(item, path);
  return (
    <li>
      <a
        className={`hub-nav-link${active ? ' active' : ''}`}
        href={`#${item.path}`}
        data-nav-prefix={item.prefix}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
      >
        <span className="hub-nav-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="hub-nav-label">{item.label}</span>
      </a>
    </li>
  );
}

export function HubNav({
  path,
  open,
  onClose,
}: {
  path: string;
  open: boolean;
  onClose: () => void;
}) {
  const settingsItem: NavItem = {
    path: '/settings',
    label: 'Settings',
    prefix: '/settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  };

  return (
    <nav id="hub-nav" className={`hub-nav${open ? ' open' : ''}`} aria-label="Apps">
      <div className="hub-nav-header">
        <h1>Rayenz Hub</h1>
        <p>Personal apps</p>
      </div>
      <div className="hub-nav-group">
        <p className="hub-nav-group-title">Neopets</p>
        <ul className="hub-nav-list">
          {NEOPETS.map((item) => (
            <NavLink key={item.path} item={item} path={path} onNavigate={onClose} />
          ))}
        </ul>
      </div>
      <div className="hub-nav-group">
        <p className="hub-nav-group-title">MTG</p>
        <ul className="hub-nav-list">
          {MTG.map((item) => (
            <NavLink key={item.path} item={item} path={path} onNavigate={onClose} />
          ))}
        </ul>
      </div>
      <div className="hub-nav-group hub-nav-footer">
        <ul className="hub-nav-list">
          <NavLink
            item={settingsItem}
            path={path}
            onNavigate={onClose}
          />
        </ul>
      </div>
    </nav>
  );
}
