import { isReservedUsername, usernameToSlug } from '@rayenz-hub/shared';
import type { CognitoAuthPort } from './cognito-auth.js';
import type { UsernameDirectory, UsernameRecord } from '../repositories/username-directory.js';

export class UsernameDirectoryService {
  constructor(private readonly directory: UsernameDirectory) {}

  async upsert(username: string, sub: string): Promise<UsernameRecord | null> {
    return this.directory.put(username, sub);
  }

  async resolve(
    usernameOrSlug: string,
    cognito: CognitoAuthPort,
    ownerUsername?: string,
  ): Promise<UsernameRecord | null> {
    if (isReservedUsername(usernameOrSlug)) {
      return null;
    }
    const slug = usernameToSlug(usernameOrSlug);
    if (!slug) {
      return null;
    }
    const existing = await this.directory.getBySlug(slug);
    if (existing) {
      return existing;
    }
    const candidates: string[] = [];
    const seen = new Set<string>();
    const addCandidate = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      candidates.push(trimmed);
    };
    addCandidate(usernameOrSlug);
    addCandidate(slug);
    if (ownerUsername && usernameToSlug(ownerUsername) === slug) {
      addCandidate(ownerUsername);
    }
    for (const candidate of candidates) {
      const found = await cognito.findUser(candidate);
      if (found) {
        return this.directory.put(found.username, found.sub);
      }
    }
    return null;
  }
}

export async function resolvePublicUsername(
  services: {
    usernameDirectory: UsernameDirectoryService;
    cognitoAuth: CognitoAuthPort;
    authService: { ownerUsername(): string };
  },
  username: string,
): Promise<UsernameRecord | null> {
  return services.usernameDirectory.resolve(
    username,
    services.cognitoAuth,
    services.authService.ownerUsername(),
  );
}
