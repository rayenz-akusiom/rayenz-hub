export type WishlistItem = {
  itemIid: number;
  name: string;
  priceNp: number | null;
  image: string | null;
  shopWizardUrl: string | null;
  description: string | null;
};

export type ListCache = {
  formatVersion: number;
  fetchedAt: number;
  fetches: string[];
  items: WishlistItem[];
  localSkipIds?: number[];
};
