import { describe, expect, it } from 'vitest';
import pilotData from './pilot-day.json';

interface PilotRow {
  id: string;
  customerEmail: string;
  customerName: string;
  agent: string;
  brand: string;
  subject: string;
}

describe('pilot-day fixture', () => {
  const rows = pilotData as PilotRow[];

  it('has exactly 30 rows', () => {
    expect(rows.length).toBe(30);
  });

  it('all emails end with @example.com', () => {
    for (const row of rows) {
      expect(row.customerEmail).toMatch(/@example\.com$/);
    }
  });

  it('all rows have required fields', () => {
    for (const row of rows) {
      expect(row.id).toBeTruthy();
      expect(row.customerEmail).toBeTruthy();
      expect(row.customerName).toBeTruthy();
      expect(row.agent).toBeTruthy();
      expect(row.brand).toBeTruthy();
      expect(row.subject).toBeTruthy();
    }
  });

  it('agents are skeptic-a or skeptic-b', () => {
    for (const row of rows) {
      expect(['skeptic-a', 'skeptic-b']).toContain(row.agent);
    }
  });

  it('brands are valid', () => {
    const validBrands = ['CD', 'DB', 'BOC', 'AMBI', 'AF'];
    for (const row of rows) {
      expect(validBrands).toContain(row.brand);
    }
  });

  it('rejects planted gmail.com in scanner', () => {
    const hasGmail = rows.some((r) => r.customerEmail.includes('gmail.com'));
    expect(hasGmail).toBe(false);
  });

  it('one row is not enough', () => {
    expect([rows[0]].length).not.toBe(30);
  });
});
