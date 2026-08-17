#!/usr/bin/env node
/**
 * Deploy the Cognito identity stack and turn on CloudFormation termination protection.
 *
 * Usage: npm run deploy:cognito
 */
import { spawnSync } from 'node:child_process';
import { COGNITO_STACK_NAME, COGNITO_STACK_REGION } from './cognito-stack.ts';

function run(line: string): void {
  const result = spawnSync(line, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('sam deploy --config-file infra/samconfig.toml --config-env cognito');
run(
  `aws cloudformation update-termination-protection --enable-termination-protection --stack-name ${COGNITO_STACK_NAME} --region ${COGNITO_STACK_REGION}`,
);
console.log(`Termination protection enabled on ${COGNITO_STACK_NAME}`);
