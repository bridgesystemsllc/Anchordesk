/**
 * Retriever port for knowledge base chunks.
 * This ticket wires emptyRetriever. AD-103 replaces the export with
 * pgvector/SharePoint retrieval.
 */

export interface KbChunk {
  id: string;
  title: string;
  text: string;
  brandCode: string | null;
  source: string;
}

export interface RetrieveOptions {
  brandCode: string;
  limit?: number;
}

export interface Retriever {
  retrieve(query: string, opts: RetrieveOptions): Promise<KbChunk[]>;
}

export const emptyRetriever: Retriever = {
  async retrieve(_query: string, _opts: RetrieveOptions): Promise<KbChunk[]> {
    return [];
  },
};

export const retriever: Retriever = emptyRetriever;
