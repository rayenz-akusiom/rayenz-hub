import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

type Item = Record<string, unknown>;

export class MemoryDocClient {
  private readonly store = new Map<string, Item>();

  async send(command: GetCommand | PutCommand | QueryCommand): Promise<unknown> {
    if (command instanceof GetCommand) {
      const input = command.input;
      const key = itemKey(input.Key as Item);
      const item = this.store.get(key);
      return { Item: item ? { ...item } : undefined };
    }
    if (command instanceof PutCommand) {
      const input = command.input;
      const item = input.Item as Item;
      this.store.set(itemKey({ PK: item.PK, SK: item.SK }), { ...item });
      return {};
    }
    if (command instanceof QueryCommand) {
      const input = command.input;
      const pk = input.ExpressionAttributeValues?.[':pk'];
      const skPrefix = input.ExpressionAttributeValues?.[':sk'];
      const items: Item[] = [];
      for (const item of this.store.values()) {
        if (item.PK !== pk) {
          continue;
        }
        if (skPrefix && !String(item.SK).startsWith(String(skPrefix))) {
          continue;
        }
        items.push({ ...item });
      }
      return { Items: items };
    }
    throw new Error('Unsupported command');
  }

  snapshot(): Map<string, Item> {
    return new Map(this.store);
  }
}

function itemKey(key: Item): string {
  return `${String(key.PK)}|${String(key.SK)}`;
}
