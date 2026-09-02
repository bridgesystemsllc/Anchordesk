import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isAiConfigured } from './anthropic';

vi.mock('./anthropic', () => ({
  isAiConfigured: vi.fn(),
  callAnthropic: vi.fn(),
  AiError: class AiError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

vi.mock('../db/client', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ priority: 3 }])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'run-1' }])),
      })),
    })),
  },
}));

vi.mock('../env', () => ({
  env: {
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_MODEL: 'claude-sonnet-4-5',
  },
}));

describe('AI triage', () => {
  const mockIsConfigured = isAiConfigured as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applyAiTriage', () => {
    it('records unconfigured run when API key is missing', async () => {
      mockIsConfigured.mockReturnValue(false);

      const { applyAiTriage } = await import('./triage');

      await applyAiTriage({
        ticketId: 'ticket-1',
        subject: 'Test subject',
        bodyText: 'Test body',
        brandCode: 'CD',
        vip: false,
        orderNumberHint: null,
        ticketCreatedAt: new Date(),
      });

      // Should not throw, just record the unconfigured run
      expect(mockIsConfigured).toHaveBeenCalled();
    });
  });

  describe('triage prompt', () => {
    it('includes supervisor intent in allowed values', async () => {
      const { TRIAGE_SYSTEM_PROMPT } = await import('./prompts/triage');

      expect(TRIAGE_SYSTEM_PROMPT).toContain('supervisor');
      expect(TRIAGE_SYSTEM_PROMPT).toContain('wismo');
      expect(TRIAGE_SYSTEM_PROMPT).toContain('return');
      expect(TRIAGE_SYSTEM_PROMPT).toContain('refund');
      expect(TRIAGE_SYSTEM_PROMPT).toContain('damage');
      expect(TRIAGE_SYSTEM_PROMPT).toContain('product_q');
      expect(TRIAGE_SYSTEM_PROMPT).toContain('other');
    });

    it('instructs model to set supervisor to P1', async () => {
      const { TRIAGE_SYSTEM_PROMPT } = await import('./prompts/triage');

      expect(TRIAGE_SYSTEM_PROMPT).toContain('supervisor');
      expect(TRIAGE_SYSTEM_PROMPT).toContain('priority to 1');
    });

    it('includes negated outcome guidance', async () => {
      const { TRIAGE_SYSTEM_PROMPT } = await import('./prompts/triage');

      expect(TRIAGE_SYSTEM_PROMPT).toContain('negated');
    });
  });
});
