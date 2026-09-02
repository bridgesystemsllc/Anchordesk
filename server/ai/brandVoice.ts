/**
 * Brand voice strings for AI draft generation.
 * AD-106: Reads from cs_brand_settings with fallback to constants.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { csBrandSettings } from '../db/schema';

export interface BrandVoice {
  voice: string;
  signature: string;
}

const FALLBACK_VOICES: Record<string, BrandVoice> = {
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

const DEFAULT_VOICE: BrandVoice = {
  voice: 'Professional, helpful, and empathetic.',
  signature: 'Customer Care Team',
};

export async function getBrandVoice(brandCode: string): Promise<BrandVoice> {
  try {
    const [row] = await db
      .select({ voice: csBrandSettings.voice, signature: csBrandSettings.signature })
      .from(csBrandSettings)
      .where(eq(csBrandSettings.brandCode, brandCode))
      .limit(1);

    if (row) {
      return { voice: row.voice, signature: row.signature };
    }
  } catch {
    // DB not ready or table missing — fall back to constants
  }

  return FALLBACK_VOICES[brandCode] ?? DEFAULT_VOICE;
}

export function getBrandVoiceSync(brandCode: string): BrandVoice {
  return FALLBACK_VOICES[brandCode] ?? DEFAULT_VOICE;
}
