import type { DeckResult, Suggestion } from './types';

type Package = NonNullable<DeckResult['packages']>[number];

export function PackagePanel({
  packages,
  packaging,
  suggestions,
  onAccept,
  acceptedIds,
}: {
  packages?: DeckResult['packages'];
  packaging?: DeckResult['packaging'];
  suggestions: Suggestion[];
  onAccept?: (s: Suggestion) => void;
  acceptedIds?: Set<string>;
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

  const byId = new Map(suggestions.map((s) => [s.suggestion_id, s]));

  return (
    <section className="ds-packages" aria-label="Upgrade packages">
      <h5 className="ds-meta">Upgrade packages</h5>
      {packages.map((pkg) => (
        <PackageCard
          key={pkg.packageId}
          pkg={pkg}
          suggestions={pkg.suggestionIds.map((id) => byId.get(id)).filter(Boolean) as Suggestion[]}
          onAccept={onAccept}
          acceptedIds={acceptedIds}
        />
      ))}
    </section>
  );
}

function PackageCard({
  pkg,
  suggestions,
  onAccept,
  acceptedIds,
}: {
  pkg: Package;
  suggestions: Suggestion[];
  onAccept?: (s: Suggestion) => void;
  acceptedIds?: Set<string>;
}) {
  return (
    <article className="ds-package-card" data-package-id={pkg.packageId}>
      <header className="ds-package-header">
        <span className="ds-package-label">{pkg.label}</span>
        <span className="ds-package-total">${pkg.totalUsd.toFixed(2)}</span>
        <span className="ds-meta">
          {pkg.swapCount} swap{pkg.swapCount === 1 ? '' : 's'}
          {pkg.unknownPriceCount ? ` · ${pkg.unknownPriceCount} unknown price` : ''}
        </span>
      </header>
      <ul className="ds-package-swaps">
        {suggestions.map((s) => {
          const rep = s.replaces?.[0];
          const accepted = acceptedIds?.has(s.suggestion_id);
          return (
            <li key={s.suggestion_id} className="ds-package-swap">
              <span>
                {rep?.name ? `${rep.name} → ` : ''}
                {s.card.name}
                {(s as { incomingUsd?: number }).incomingUsd != null
                  ? ` ($${(s as { incomingUsd?: number }).incomingUsd!.toFixed(2)})`
                  : ''}
              </span>
              {onAccept && !accepted ? (
                <button type="button" className="ds-btn ds-btn-sm" onClick={() => onAccept(s)}>
                  Accept
                </button>
              ) : null}
              {accepted ? <span className="ds-lozenge ds-lozenge-accepted">Accepted</span> : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
