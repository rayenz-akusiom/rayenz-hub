/**
 * Create HubTable in DynamoDB Local (idempotent).
 * Usage: node scripts/create-local-hub-table.mjs
 * Env: DYNAMODB_ENDPOINT (default http://127.0.0.1:8000), HUB_TABLE_NAME (default HubTable)
 */
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:8000';
const tableName = process.env.HUB_TABLE_NAME || 'HubTable';
const region = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({
  region,
  endpoint,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

try {
  await client.send(new DescribeTableCommand({ TableName: tableName }));
  console.log(`Table already exists: ${tableName} @ ${endpoint}`);
  process.exit(0);
} catch (err) {
  if (err?.name !== 'ResourceNotFoundException') {
    console.error(err);
    process.exit(1);
  }
}

await client.send(
  new CreateTableCommand({
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
  }),
);

console.log(`Created table: ${tableName} @ ${endpoint}`);
