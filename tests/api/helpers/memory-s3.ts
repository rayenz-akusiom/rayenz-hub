export class MemoryS3Store {
  private readonly objects = new Map<string, string>();
  private readonly bytes = new Map<string, Uint8Array>();

  async getText(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  async putText(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  async getBytes(key: string): Promise<Uint8Array | null> {
    return this.bytes.get(key) ?? null;
  }

  async putBytes(key: string, body: Uint8Array): Promise<void> {
    this.bytes.set(key, body);
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    this.bytes.delete(key);
  }

  snapshot(): Map<string, string> {
    return new Map(this.objects);
  }

  bytesSnapshot(): Map<string, Uint8Array> {
    return new Map(this.bytes);
  }
}
