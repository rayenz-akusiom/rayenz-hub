#!/usr/bin/env node
/**
 * Deploy the Hub API stack, injecting Cognito pool/client values from rayenz-hub-cognito.
 *
 * Usage: npm run deploy:api
 */
import { spawnSync } from 'node:child_process';
import {
  COGNITO_STACK_NAME,
  COGNITO_STACK_REGION,
  formatApiParameterOverrides,
  stackOutput,
} from './cognito-stack.ts';

function awsJson(args: string): unknown {
  const result = spawnSync(`aws ${args} --region ${COGNITO_STACK_REGION} --output json`, {
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || `aws ${args} failed`);
  }
  return JSON.parse(result.stdout || '{}');
}

function cognitoOverrides(): string {
  const stacks = awsJson(`cloudformation describe-stacks --stack-name ${COGNITO_STACK_NAME}`) as {
    Stacks?: Array<{ Outputs?: Array<{ OutputKey?: string; OutputValue?: string }> }>;
  };
  const outputs = stacks.Stacks?.[0]?.Outputs || [];
  const poolId = stackOutput(outputs, 'HubUserPoolId');
  const poolArn = stackOutput(outputs, 'HubUserPoolArn');
  const clientId = stackOutput(outputs, 'HubUserPoolClientId');
  const client = awsJson(
    `cognito-idp describe-user-pool-client --user-pool-id ${poolId} --client-id ${clientId}`,
  ) as { UserPoolClient?: { ClientSecret?: string } };
  const clientSecret = client.UserPoolClient?.ClientSecret?.trim() || '';
  return formatApiParameterOverrides({ poolId, poolArn, clientId, clientSecret });
}

function main(): void {
  const overrides = cognitoOverrides();
  const result = spawnSync(
    `sam deploy --config-file infra/samconfig.toml --parameter-overrides "${overrides}"`,
    { stdio: 'inherit', shell: true },
  );
  process.exit(result.status ?? 1);
}

main();
