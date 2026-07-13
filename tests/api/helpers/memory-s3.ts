export class MemoryS3Store {
  private readonly objects = new Map<string, string>();

  async getText(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  async putText(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  snapshot(): Map<string, string> {
    return new Map(this.objects);
  }
}
