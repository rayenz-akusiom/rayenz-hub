import { describe, expect, it } from 'vitest';
import { dummyAwsCredentialMessage } from '../../scripts/setup-local-cognito.ts';

describe('setup-local-cognito dummy credentials', () => {
  it('warns when AWS_ACCESS_KEY_ID is the MinIO dummy', () => {
    const message = dummyAwsCredentialMessage({ AWS_ACCESS_KEY_ID: 'local' });
    expect(message).toMatch(/MinIO dummy/);
    expect(message).toMatch(/Remove-Item Env:AWS_ACCESS_KEY_ID/);
  });

  it('is silent when real credentials are unset or not dummy', () => {
    expect(dummyAwsCredentialMessage({} as NodeJS.ProcessEnv)).toBeNull();
    expect(dummyAwsCredentialMessage({ AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE' })).toBeNull();
  });
});
