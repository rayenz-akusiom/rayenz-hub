import { isReservedUsername, usernameToSlug } from '@rayenz-hub/shared';
import type { CognitoAuthPort } from './cognito-auth.js';
import type { UsernameDirectory, UsernameRecord } from '../repositories/username-directory.js';

export class UsernameDirectoryService {
  constructor(private readonly directory: UsernameDirectory) {}

  async upsert(username: string, sub: string): Promise<UsernameRecord | null> {
    return this.directory.put(username, sub);
  }

  async resolve(usernameOrSlug: string, cognito: CognitoAuthPort): Promise<UsernameRecord | null> {
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
    const found = await cognito.findUser(usernameOrSlug.trim());
    if (!found) {
      return null;
    }
    return this.directory.put(found.username, found.sub);
  }
}
