import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('production stack inventory', () => {
  it('defines a single HubTable and data bucket (no staging stack)', () => {
    const template = readFileSync(path.join(root, 'infra/template.yaml'), 'utf8');
    const tables = template.match(/Type: AWS::DynamoDB::Table/g) || [];
    const buckets = template.match(/Type: AWS::S3::Bucket/g) || [];
    expect(tables).toHaveLength(1);
    expect(buckets).toHaveLength(1);
    expect(template).not.toMatch(/StagingHubTable|HubTableStaging|dev-cloud/i);
    const samconfig = readFileSync(path.join(root, 'infra/samconfig.toml'), 'utf8');
    expect(samconfig).toMatch(/stack_name = "rayenz-hub-api"/);
    expect(samconfig).not.toMatch(/staging/i);
    expect(template).not.toMatch(/ssm-secure/);
    expect(template).toMatch(/resolve:secretsmanager:\$\{HubApiKeySecretId\}:SecretString/);
    expect(template).toMatch(/resolve:secretsmanager:\$\{HubInviteSecretId\}:SecretString/);
  });
});
