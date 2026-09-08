// server/__tests__/advisors.test.js
//
// Unit tests for the pure, accent-insensitive advisor matching helpers
// (sdd/advisor-auto-provisioning, PR 1 — design 3.4/D3). No Supabase/network
// involved: `matchesAdvisor` operates on already-merged advisor rows.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeTerm, matchesAdvisor, mapAdvisorRow, isAdvisorAccountActive } from '../advisors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('normalizeTerm', () => {
  it('strips accents, lowercases and trims', () => {
    expect(normalizeTerm('María José')).toBe('maria jose');
    expect(normalizeTerm('  GÓMEZ  ')).toBe('gomez');
  });

  it('returns an empty string for null/undefined', () => {
    expect(normalizeTerm(null)).toBe('');
    expect(normalizeTerm(undefined)).toBe('');
  });
});

describe('matchesAdvisor', () => {
  const mariaJose = {
    name: 'María José Fernández',
    firstName: 'María José',
    lastName: 'Fernández',
    producerCode: 'PROMO_MJ',
    email: 'mj@medinex.com',
    dni: '28555111',
  };

  const gomez = {
    name: 'Pedro Gómez',
    firstName: 'Pedro',
    lastName: 'Gómez',
    producerCode: 'PROMO_PEDRO',
    email: 'pedro@medinex.com',
    dni: '30123456',
  };

  // Escenario 11: nombre, acento-insensible, mayúsculas
  it('matches by first name, ignoring accents and case (Esc.11)', () => {
    expect(matchesAdvisor(mariaJose, 'maria')).toBe(true);
    expect(matchesAdvisor(mariaJose, 'MARIA')).toBe(true);
  });

  // Escenario 12: apellido, acento-insensible
  it('matches by last name, ignoring accents (Esc.12)', () => {
    expect(matchesAdvisor(gomez, 'gomez')).toBe(true);
    expect(matchesAdvisor(gomez, 'Gómez')).toBe(true);
  });

  // Escenario 13: prefijo de DNI
  it('matches a numeric term as a DNI prefix (Esc.13)', () => {
    expect(matchesAdvisor(gomez, '301')).toBe(true);
    expect(matchesAdvisor(gomez, '30123456')).toBe(true);
    expect(matchesAdvisor(gomez, '999')).toBe(false);
  });

  it('does NOT match a numeric term against the middle/end of the DNI (prefix only)', () => {
    expect(matchesAdvisor(gomez, '123456')).toBe(false);
  });

  // Escenario 14: código/email, retrocompatibilidad
  it('matches by producer code substring (Esc.14)', () => {
    expect(matchesAdvisor(gomez, 'PEDRO')).toBe(true);
    expect(matchesAdvisor(gomez, 'promo_pedro')).toBe(true);
  });

  it('matches by email substring (Esc.14)', () => {
    expect(matchesAdvisor(gomez, 'pedro@medinex')).toBe(true);
  });

  it('a numeric term also matches a numeric-looking producer code by substring', () => {
    const withNumericCode = { ...gomez, producerCode: 'PROMO301' };
    expect(matchesAdvisor(withNumericCode, '301')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesAdvisor(gomez, 'zzz-no-match')).toBe(false);
  });

  it('treats an empty/whitespace term as matching everything', () => {
    expect(matchesAdvisor(gomez, '')).toBe(true);
    expect(matchesAdvisor(gomez, '   ')).toBe(true);
  });
});

describe('mapAdvisorRow', () => {
  it('maps a producer with a linked profile — hasAccount: true', () => {
    const producer = {
      id: 'adv-1',
      name: 'Pedro Gómez',
      producer_code: 'PROMO_PEDRO',
      email: 'pedro@medinex.com',
      phone: '3416123456',
      status: 'active',
      commission_rate: 10,
    };
    const profile = { id: 'adv-1', first_name: 'Pedro', last_name: 'Gómez', dni: '30123456', is_active: true };

    const mapped = mapAdvisorRow(producer, profile, 3);

    expect(mapped).toEqual({
      id: 'adv-1',
      name: 'Pedro Gómez',
      firstName: 'Pedro',
      lastName: 'Gómez',
      producerCode: 'PROMO_PEDRO',
      email: 'pedro@medinex.com',
      phone: '3416123456',
      dni: '30123456',
      status: 'active',
      isActive: true,
      hasAccount: true,
      commissionRate: 10,
      totalAffiliatesReferred: 3,
    });
  });

  // Escenario 7 / D2: placeholder producer without a linked profile
  it('maps a placeholder producer with no linked profile — hasAccount: false', () => {
    const producer = {
      id: 'placeholder-1',
      name: 'Landing Directo (sin asesor)',
      producer_code: 'LANDING',
      email: 'landing@medinex.com',
      phone: null,
      status: 'active',
      commission_rate: 0,
    };

    const mapped = mapAdvisorRow(producer, null, 0);

    expect(mapped.hasAccount).toBe(false);
    expect(mapped.firstName).toBeNull();
    expect(mapped.dni).toBeNull();
    expect(mapped.isActive).toBe(true); // derives from producer.status when there is no account
  });

  // Escenario 18: inactivos correctamente etiquetados
  it('reflects an inactive linked profile in isActive', () => {
    const producer = { id: 'adv-2', name: 'Ana Ruiz', producer_code: 'PROMO_ANA', email: 'ana@medinex.com', phone: null, status: 'inactive', commission_rate: 10 };
    const profile = { id: 'adv-2', first_name: 'Ana', last_name: 'Ruiz', dni: '31000111', is_active: false };

    const mapped = mapAdvisorRow(producer, profile, 0);

    expect(mapped.status).toBe('inactive');
    expect(mapped.isActive).toBe(false);
  });
});

// Commission-freeze "Corte 2" (design 3.7, Esc.10): a deactivated advisor's
// session is not closed, but must stop generating new activity/metrics.
describe('isAdvisorAccountActive', () => {
  it('returns false for an explicitly inactive profile', () => {
    expect(isAdvisorAccountActive({ is_active: false })).toBe(false);
  });

  it('returns true for an active profile', () => {
    expect(isAdvisorAccountActive({ is_active: true })).toBe(true);
  });

  it('returns true when there is no profile row (nothing to gate)', () => {
    expect(isAdvisorAccountActive(null)).toBe(true);
    expect(isAdvisorAccountActive(undefined)).toBe(true);
  });
});

describe('POST /api/advisor/increment-share is_active guard wiring (server.js source, Esc.10)', () => {
  it('checks isAdvisorAccountActive on the caller profile before the RPC increment call', () => {
    const serverSource = readFileSync(resolve(__dirname, '..', '..', 'server.js'), 'utf-8');

    const routeMatch = serverSource.match(
      /app\.post\(\s*['"]\/api\/advisor\/increment-share['"][\s\S]*?(?=\napp\.)/
    );
    expect(routeMatch).not.toBeNull();

    const routeBody = routeMatch[0];
    const guardIndex = routeBody.indexOf('isAdvisorAccountActive');
    const rpcIndex = routeBody.indexOf("rpc('increment_links_shared'");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(rpcIndex);
  });
});
