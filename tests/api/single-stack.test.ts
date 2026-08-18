import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  API_BASE_PARAMETER_OVERRIDES,
  COGNITO_STACK_NAME,
  formatApiParameterOverrides,
  stackOutput,
} from '../../scripts/cognito-stack.ts';
import {
  hubApiUrlFromEnv,
  hubApiUrlFromStackOutputs,
  resolvePublishHubApiUrl,
} from '../../scripts/hub-api-url.ts';

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
    expect(template).not.toMatch(/\{\{resolve:ssm-secure/);
    expect(template).toMatch(/Type: HttpApi[\s\S]*Path: \/\{\s*proxy\+\}[\s\S]*Method: OPTIONS/);
    expect(template).toMatch(/resolve:secretsmanager:\$\{HubInviteSecretId\}:SecretString/);
    expect(template).not.toMatch(/HubApiKeySecretId|HUB_API_KEY/);
    expect(template).toMatch(/Path: \/v1\/auth\/confirm/);
    expect(template).toMatch(/Path: \/v1\/users\/\{username\}\/decks\/\{deckSlug\}/);
    expect(template).toMatch(/Path: \/v1\/users\/\{username\}\/decks\/\{deckSlug\}\/profile/);
    expect(template).not.toMatch(/Type: AWS::Cognito::UserPool/);
    expect(template).not.toMatch(/Type: AWS::Cognito::UserPoolClient/);
  });

  it('keeps Cognito in a separate stack with retain policies', () => {
    const cognito = readFileSync(path.join(root, 'infra/cognito.yaml'), 'utf8');
    const samconfig = readFileSync(path.join(root, 'infra/samconfig.toml'), 'utf8');
    const deployCognito = readFileSync(path.join(root, 'scripts/deploy-cognito.ts'), 'utf8');
    expect(samconfig).toMatch(/stack_name = "rayenz-hub-cognito"/);
    expect(samconfig).toMatch(/template_file = "infra\/cognito.yaml"/);
    expect(cognito).toMatch(/Type: AWS::Cognito::UserPool/);
    expect(cognito).toMatch(/Type: AWS::Cognito::UserPoolClient/);
    expect(cognito).toMatch(/AutoVerifiedAttributes:[\s\S]*?- email/);
    expect(cognito).toMatch(/DeletionPolicy: Retain/);
    expect(cognito).toMatch(/UpdateReplacePolicy: Retain/);
    expect(cognito).not.toMatch(/^\s+UsernameAttributes:/m);
    expect(cognito).not.toMatch(/^\s+AliasAttributes:/m);
    expect(deployCognito).toMatch(/update-termination-protection/);
    expect(deployCognito).toMatch(/--enable-termination-protection/);
    expect(deployCognito).toMatch(/COGNITO_STACK_NAME/);
  });
});

describe('Cognito API parameter overrides', () => {
  it('appends pool ids and client secret to the Secrets Manager overrides', () => {
    expect(
      formatApiParameterOverrides({
        poolId: 'us-east-1_abc',
        poolArn: 'arn:aws:cognito-idp:us-east-1:1:userpool/us-east-1_abc',
        clientId: 'client1',
        clientSecret: 'secret1',
      }),
    ).toBe(
      `${API_BASE_PARAMETER_OVERRIDES} CognitoUserPoolId=us-east-1_abc CognitoUserPoolArn=arn:aws:cognito-idp:us-east-1:1:userpool/us-east-1_abc CognitoClientId=client1 CognitoClientSecret=secret1`,
    );
  });

  it('rejects empty or unsafe override values', () => {
    expect(() =>
      formatApiParameterOverrides({
        poolId: '',
        poolArn: 'arn',
        clientId: 'c',
        clientSecret: 's',
      }),
    ).toThrow(/poolId/);
    expect(() =>
      formatApiParameterOverrides({
        poolId: 'p',
        poolArn: 'arn',
        clientId: 'c',
        clientSecret: 'se cret',
      }),
    ).toThrow(/clientSecret/);
  });

  it('reads named stack outputs', () => {
    expect(stackOutput([{ OutputKey: 'HubUserPoolId', OutputValue: ' pool ' }], 'HubUserPoolId')).toBe('pool');
    expect(() => stackOutput([], 'HubUserPoolId')).toThrow(/HubUserPoolId/);
  });
});

describe('Hub API URL for Pages publish', () => {
  it('prefers VITE_HUB_API_URL then HUB_API_URL', () => {
    expect(hubApiUrlFromEnv({ VITE_HUB_API_URL: 'https://a.example/', HUB_API_URL: 'https://b.example' })).toBe(
      'https://a.example',
    );
    expect(hubApiUrlFromEnv({ HUB_API_URL: 'https://b.example/' })).toBe('https://b.example');
    expect(hubApiUrlFromEnv({})).toBe('');
  });

  it('reads HubApiUrl from stack outputs', () => {
    expect(
      hubApiUrlFromStackOutputs([
        { OutputKey: 'HubApiUrl', OutputValue: 'https://abc.execute-api.us-east-1.amazonaws.com/' },
      ]),
    ).toBe('https://abc.execute-api.us-east-1.amazonaws.com');
    expect(() => hubApiUrlFromStackOutputs([])).toThrow(/HubApiUrl/);
  });

  it('resolvePublishHubApiUrl uses env, then stack, then fails', () => {
    expect(resolvePublishHubApiUrl({ HUB_API_URL: 'https://from-env.example/' }, () => [])).toBe(
      'https://from-env.example',
    );
    expect(
      resolvePublishHubApiUrl({}, () => [{ OutputKey: 'HubApiUrl', OutputValue: 'https://from-stack.example' }]),
    ).toBe('https://from-stack.example');
    expect(() => resolvePublishHubApiUrl({}, () => null)).toThrow(/publish:hub needs/);
    expect(() =>
      resolvePublishHubApiUrl({}, () => {
        throw new Error('no aws');
      }),
    ).toThrow(/publish:hub needs/);
  });
});
