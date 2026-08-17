/**
 * Shared names and SAM parameter formatting for the Cognito identity stack.
 * Deploy scripts call AWS; unit tests import the pure helpers only.
 */
export const COGNITO_STACK_NAME = 'rayenz-hub-cognito';
export const COGNITO_STACK_REGION = 'us-east-1';

export const API_BASE_PARAMETER_OVERRIDES =
  'HubApiKeySecretId=rayenz-hub/prod/api-key HubInviteSecretId=rayenz-hub/prod/invite-hmac HubUserId=rayenz-local HubOwnerUsername=Rayenz';

export const LOCAL_COGNITO_PARAMETER_OVERRIDES =
  'CognitoUserPoolId=local CognitoUserPoolArn=arn:aws:cognito-idp:us-east-1:000000000000:userpool/local CognitoClientId=local CognitoClientSecret=local';

export function formatApiParameterOverrides(cognito: {
  poolId: string;
  poolArn: string;
  clientId: string;
  clientSecret: string;
}): string {
  for (const [name, value] of Object.entries(cognito)) {
    if (!value?.trim()) {
      throw new Error(`Cognito ${name} is empty`);
    }
    if (/[\s=]/.test(value)) {
      throw new Error(`Cognito ${name} contains whitespace or '=' and cannot be passed as a SAM override`);
    }
  }
  return [
    API_BASE_PARAMETER_OVERRIDES,
    `CognitoUserPoolId=${cognito.poolId}`,
    `CognitoUserPoolArn=${cognito.poolArn}`,
    `CognitoClientId=${cognito.clientId}`,
    `CognitoClientSecret=${cognito.clientSecret}`,
  ].join(' ');
}

export function stackOutput(outputs: Array<{ OutputKey?: string; OutputValue?: string }>, key: string): string {
  const hit = outputs.find((o) => o.OutputKey === key)?.OutputValue?.trim() || '';
  if (!hit) {
    throw new Error(`Stack ${COGNITO_STACK_NAME} is missing output ${key}`);
  }
  return hit;
}
