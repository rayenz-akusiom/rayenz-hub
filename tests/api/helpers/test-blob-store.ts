import type { BlobStore } from '../../../packages/api/src/repositories/s3-blob-store.ts';
import { MemoryS3Store } from './memory-s3.ts';

export function asBlobStore(memory: MemoryS3Store): BlobStore {
  return {
    getText: (key) => memory.getText(key),
    putText: (key, body, _contentType) => memory.putText(key, body),
    deleteObject: (key) => memory.deleteObject(key),
  };
}
