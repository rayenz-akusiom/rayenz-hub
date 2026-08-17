import { z } from 'zod';

export const SignInRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type SignInRequest = z.infer<typeof SignInRequestSchema>;

export const AuthTokensResponseSchema = z.object({
  accessToken: z.string(),
  idToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresIn: z.number().int().positive(),
  username: z.string(),
  sub: z.string(),
});
export type AuthTokensResponse = z.infer<typeof AuthTokensResponseSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
  username: z.string().min(1).optional(),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RegisterRequestSchema = z.object({
  token: z.string().min(1),
  username: z.string().min(1).max(128),
  password: z.string().min(8),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const AuthMeResponseSchema = z.object({
  username: z.string(),
  sub: z.string(),
  isOwner: z.boolean(),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const InviteCreateResponseSchema = z.object({
  inviteId: z.string(),
  url: z.string().url(),
  expiresAt: z.string(),
});
export type InviteCreateResponse = z.infer<typeof InviteCreateResponseSchema>;

export const InviteStatusSchema = z.enum(['unused', 'used', 'revoked', 'expired']);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

export const InviteListItemSchema = z.object({
  inviteId: z.string(),
  status: InviteStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  url: z.string().url().optional(),
  usedAt: z.string().optional(),
  revokedAt: z.string().optional(),
});
export type InviteListItem = z.infer<typeof InviteListItemSchema>;

export const InviteListResponseSchema = z.object({
  invites: z.array(InviteListItemSchema),
});
export type InviteListResponse = z.infer<typeof InviteListResponseSchema>;
