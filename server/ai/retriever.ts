/**
 * Retriever port for knowledge base chunks.
 * AD-103: wired to hybridRetriever (pgvector + FTS).
 * Option is `brand`, never `brandCode`. Default limit 8.
 */

import {
  hybridRetriever as kbHybridRetriever,
  emptyRetriever as kbEmptyRetriever,
  hasIndexedChunks,
  type KbChunk,
  type RetrieveOptions,
  type Retriever,
} from '../kb/retriever';

export type { KbChunk, RetrieveOptions, Retriever };

export const emptyRetriever: Retriever = kbEmptyRetriever;
export const hybridRetriever: Retriever = kbHybridRetriever;

let cachedHasChunks: boolean | null = null;

/**
 * Live retriever export. Uses hybridRetriever when KB has indexed chunks,
 * falls back to emptyRetriever otherwise (for empty-KB tests).
 */
export const retriever: Retriever = {
  async retrieve(query: string, opts?: RetrieveOptions): Promise<KbChunk[]> {
    if (cachedHasChunks === null) {
      cachedHasChunks = await hasIndexedChunks();
    }
    if (!cachedHasChunks) {
      return emptyRetriever.retrieve(query, opts);
    }
    return hybridRetriever.retrieve(query, opts);
  },
};

export function invalidateRetrieverCache(): void {
  cachedHasChunks = null;
}
