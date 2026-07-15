import { z } from 'zod';

export const OrderReconcileSettingsPayloadSchema = z.object({
  folderUrl: z.string().optional(),
  stagingDeckUrl: z.string().optional(),
  registrySource: z.enum(['folder', 'urls']).optional(),
  customDeckUrls: z.string().optional(),
});

export type OrderReconcileSettingsPayload = z.infer<typeof OrderReconcileSettingsPayloadSchema>;

/** Neutral defaults — no personal Archidekt URLs. */
export const DEFAULT_ORDER_RECONCILE_SETTINGS: OrderReconcileSettingsPayload = {
  folderUrl: '',
  stagingDeckUrl: '',
  registrySource: 'folder',
  customDeckUrls: '',
};
