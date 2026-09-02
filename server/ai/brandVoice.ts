/**
 * Brand voice strings for AI draft generation.
 * Copied from src/data/brands.ts (do not import from src/).
 */

export interface BrandVoice {
  voice: string;
  signature: string;
}

export const BRAND_VOICES: Record<string, BrandVoice> = {
  CD: {
    voice: 'Warm, personal, community-minded. Speaks to hair journeys, never clinical.',
    signature: "The Carol's Daughter Care Team",
  },
  DB: {
    voice: 'Clinical, precise, reassuring. Leads with coverage claims and skin safety.',
    signature: 'Dermablend Professional Support',
  },
  BOC: {
    voice: 'Understated, confident, minimal. Short sentences. No exclamation marks.',
    signature: 'Baxter of California',
  },
  AMBI: {
    voice: 'Encouraging and plainspoken. Explains ingredients without jargon.',
    signature: 'The Ambi Skincare Team',
  },
  AF: {
    voice: 'Direct, practical, upbeat. Regimen-first answers.',
    signature: 'AcneFree Customer Care',
  },
};

export function getBrandVoice(brandCode: string): BrandVoice {
  return (
    BRAND_VOICES[brandCode] ?? {
      voice: 'Professional, helpful, and empathetic.',
      signature: 'Customer Care Team',
    }
  );
}
