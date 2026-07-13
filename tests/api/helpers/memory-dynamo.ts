import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

type Item = Record<string, unknown>;

export class MemoryDocClient {
  private readonly store = new Map<string, Item>();

  async send(command: GetCommand | PutCommand): Promise<unknown> {
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
    throw new Error('Unsupported command');
  }

  snapshot(): Map<string, Item> {
    return new Map(this.store);
  }
}

function itemKey(key: Item): string {
  return `${String(key.PK)}|${String(key.SK)}`;
}
