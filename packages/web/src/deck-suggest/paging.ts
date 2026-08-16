export function proposePageIds(eligibleIds: string[], processedIds: string[], cap: number): string[] {
  const processed = new Set(processedIds);
  return eligibleIds.filter((id) => !processed.has(id)).slice(0, Math.max(0, cap));
}

export function remainingIds(eligibleIds: string[], processedIds: string[]): string[] {
  const processed = new Set(processedIds);
  return eligibleIds.filter((id) => !processed.has(id));
}

export function pageIsOverCap(selectedIds: string[], cap: number): boolean {
  return selectedIds.length > cap;
}
