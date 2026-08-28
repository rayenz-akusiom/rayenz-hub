import type { ReactNode } from 'react';
import type { DeckResult } from './types';

type Package = NonNullable<DeckResult['packages']>[number];

function formatFocusTag(tag: string): string {
  if (tag.startsWith('rule:')) {
    return tag.slice(5).replace(/_/g, ' ');
  }
  return tag.replace(/-/g, ' ');
}

export function PackagePanel({
  packages,
  packaging,
  activePackageId,
  onSelectPackage,
  children,
}: {
  packages?: DeckResult['packages'];
  packaging?: DeckResult['packaging'];
  activePackageId?: string | null;
  onSelectPackage?: (packageId: string) => void;
  children?: ReactNode;
}) {
  if (!packages?.length) {
    if (packaging && !packaging.fittingPackageFound) {
      return (
        <p className="ds-meta" id="ds-package-empty">
          No upgrade package fits the budget with known prices.
        </p>
      );
    }
    return null;
  }

  const activeId = activePackageId ?? packages[0]?.packageId;
  const activePkg = packages.find((pkg) => pkg.packageId === activeId) ?? packages[0];

  return (
    <section className="ds-packages" aria-label="Upgrade packages">
      <div className="ds-package-tabs" role="tablist" aria-label="Upgrade package tabs">
        {packages.map((pkg) => (
          <button
            key={pkg.packageId}
            type="button"
            role="tab"
            aria-selected={pkg.packageId === activeId}
            className={'ds-package-tab' + (pkg.packageId === activeId ? ' active' : '')}
            onClick={() => onSelectPackage?.(pkg.packageId)}
          >
            {pkg.label}
          </button>
        ))}
      </div>
      {activePkg ? (
        <div className="ds-package-panel" role="tabpanel" aria-label={activePkg.label}>
          <PackageSummary pkg={activePkg} />
          {children}
        </div>
      ) : null}
    </section>
  );
}

function PackageSummary({ pkg }: { pkg: Package }) {
  const focusLabel =
    pkg.focusTags?.length
      ? pkg.focusTags.map(formatFocusTag).join(', ')
      : pkg.label;

  return (
    <p className="ds-package-summary ds-meta">
      {pkg.swapCount} card{pkg.swapCount === 1 ? '' : 's'} · ${pkg.totalUsd.toFixed(2)} · {focusLabel}
      {pkg.unknownPriceCount ? ` · ${pkg.unknownPriceCount} unknown price` : ''}
    </p>
  );
}
