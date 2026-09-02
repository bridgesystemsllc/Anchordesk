import { describe, expect, it } from 'vitest';
import { emptyRetriever, retriever } from './retriever';

describe('retriever', () => {
  describe('emptyRetriever', () => {
    it('returns empty array for any query', async () => {
      const result = await emptyRetriever.retrieve('where is my order', { brandCode: 'CD', limit: 5 });

      expect(result).toEqual([]);
    });

    it('handles various query types', async () => {
      const queries = [
        'return policy',
        'refund request',
        'damaged product',
        'ingredients list',
        '',
      ];

      for (const query of queries) {
        const result = await emptyRetriever.retrieve(query, { brandCode: 'DB', limit: 10 });
        expect(result).toEqual([]);
      }
    });

    it('respects limit parameter (returns empty regardless)', async () => {
      const result = await emptyRetriever.retrieve('test', { brandCode: 'BOC', limit: 100 });

      expect(result).toEqual([]);
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  describe('retriever port', () => {
    it('is currently the empty retriever (AD-103 scope)', async () => {
      const result = await retriever.retrieve('any query', { brandCode: 'CD', limit: 5 });

      expect(result).toEqual([]);
    });

    it('has the Retriever interface', () => {
      expect(typeof retriever.retrieve).toBe('function');
    });
  });
});
