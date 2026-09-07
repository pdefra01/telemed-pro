// server/advisors.js
//
// Pure, testable advisor-management logic (sdd/advisor-auto-provisioning,
// PR 1/2 — design 3.3/3.4). Mirrors server/affiliateActivation.js's
// convention: business logic lives here so it can be unit-tested; server.js
// keeps only routing (requireAuth/requireAdmin wiring + HTTP status
// mapping), since server.js itself calls app.listen(...) unconditionally at
// import time and therefore cannot be imported by a test runner (see
// server/__tests__/approveAdhesionAuth.test.js).

/** Strips accents/diacritics, lowercases and trims — the shared normalization
 * used for every text comparison in `matchesAdvisor` (design D3). */
export const normalizeTerm = (v) =>
  (v ?? '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Pure matcher over an already-merged advisor row (see `mapAdvisorRow`).
 * A numeric term matches by DNI PREFIX (Esc.13) or as a substring of the
 * producer code (retro-compat with numeric-looking codes). A non-numeric
 * term matches as a case/accent-insensitive substring of first name, last
 * name, full name, producer code or email (Esc.11, Esc.12, Esc.14). An
 * empty/whitespace-only term matches every row (design 3.5 — the UI only
 * calls the search endpoint for terms of length >= 2, but the pure matcher
 * itself stays permissive for a blank term, matching Escenario 15's "return
 * everything" contract at the handler level).
 */
export function matchesAdvisor(row, term) {
  const normalizedTerm = normalizeTerm(term);
  if (!normalizedTerm) return true;

  const isNumeric = /^\d+$/.test(normalizedTerm);
  if (isNumeric) {
    const dni = normalizeTerm(row.dni);
    const code = normalizeTerm(row.producerCode);
    return dni.startsWith(normalizedTerm) || code.includes(normalizedTerm);
  }

  const fullName = `${row.firstName || ''} ${row.lastName || ''}`;
  const haystacks = [row.firstName, row.lastName, row.name, fullName, row.producerCode, row.email].map(normalizeTerm);
  return haystacks.some((h) => h.includes(normalizedTerm));
}

/**
 * Merges a `producers` row with its (possibly absent) `profiles` row into
 * the shape returned by `GET /api/advisors/search` (design 3.4) and
 * consumed by `matchesAdvisor`. `profile` is `null` for placeholder producer
 * rows with no linked profiles/Auth account (D2, Esc.7) — `hasAccount`
 * reflects that, and `isActive` falls back to the producer's own commercial
 * status in that case (there is no login to gate).
 */
export function mapAdvisorRow(producer, profile, referralCount = 0) {
  const hasAccount = Boolean(profile);
  return {
    id: producer.id,
    name: producer.name,
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    producerCode: producer.producer_code,
    email: producer.email,
    phone: producer.phone,
    dni: profile?.dni ?? null,
    status: producer.status,
    isActive: hasAccount ? profile.is_active !== false : producer.status === 'active',
    hasAccount,
    commissionRate: Number(producer.commission_rate),
    totalAffiliatesReferred: referralCount,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure guard for the commission-freeze "Corte 2" (design 3.7, Esc.10):
 * an advisor with no linked profile row is treated as active (nothing to
 * gate); an explicit `is_active === false` blocks further activity. */
export function isAdvisorAccountActive(profile) {
  return !profile || profile.is_active !== false;
}

/**
 * `PATCH /api/advisors/:id/status` business logic (design 3.3). Express
 * wires this in behind `requireAuth, requireAdmin` — this function assumes
 * both already ran (`req.user` is a validated admin).
 */
export async function setAdvisorStatusHandler(req, res, { supabaseAdmin }) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const targetId = req.params.id;
  const { active } = req.body || {};

  if (!UUID_RE.test(targetId || '') || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Datos inválidos para el cambio de estado.' });
  }

  if (targetId === req.user.id) {
    return res.status(403).json({ error: 'Un administrador no puede modificar su propio estado.' });
  }

  const { data, error } = await supabaseAdmin.rpc('set_advisor_status', {
    p_advisor_id: targetId,
    p_active: active,
  });

  if (error) {
    if (error.code === 'P0002') {
      return res.status(404).json({ error: 'Asesor no encontrado.' });
    }
    console.error('[advisors/status] RPC error:', error.message);
    return res.status(500).json({ error: 'Error al actualizar el estado del asesor.' });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const status = row?.producer_status ?? (active ? 'active' : 'inactive');
  const hasAccount = Boolean(row?.has_account);

  return res.status(200).json({
    success: true,
    id: targetId,
    status,
    isActive: active,
    hasAccount,
  });
}

/**
 * `GET /api/advisors/search` business logic (design 3.4). A blank/missing
 * `q` returns the full list (Esc.15); `q` of exactly 1 significant
 * character is rejected (design's "obligatorio, >=2 o 400"); `q` >= 2
 * filters via `matchesAdvisor`. Results always include both active and
 * inactive advisors (Esc.18) unless `status` narrows them.
 */
export async function searchAdvisorsHandler(req, res, { supabaseAdmin }) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const trimmedQ = (req.query.q ?? '').toString().trim();
  if (trimmedQ.length === 1) {
    return res.status(400).json({ error: 'El término de búsqueda debe tener al menos 2 caracteres.' });
  }

  const statusFilter = req.query.status || 'all';
  if (!['all', 'active', 'inactive'].includes(statusFilter)) {
    return res.status(400).json({ error: 'Estado de búsqueda inválido.' });
  }

  const { data: producers, error: producersError } = await supabaseAdmin
    .from('producers')
    .select('*')
    .order('name')
    .limit(500);

  if (producersError) {
    console.error('[advisors/search] producers query error:', producersError.message);
    return res.status(500).json({ error: 'Error al buscar asesores.' });
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, dni, is_active')
    .eq('role', 'advisor');

  if (profilesError) {
    console.error('[advisors/search] profiles query error:', profilesError.message);
    return res.status(500).json({ error: 'Error al buscar asesores.' });
  }

  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  const preMatch = (producers || []).filter((producer) => {
    if (statusFilter !== 'all' && producer.status !== statusFilter) return false;
    if (trimmedQ.length < 2) return true;
    const merged = mapAdvisorRow(producer, profileById.get(producer.id) || null, 0);
    return matchesAdvisor(merged, trimmedQ);
  });

  const matchedIds = preMatch.map((p) => p.id);
  const referralCounts = new Map();
  if (matchedIds.length > 0) {
    const { data: referrals } = await supabaseAdmin
      .from('profiles')
      .select('producer_id')
      .in('producer_id', matchedIds);
    (referrals || []).forEach((r) => {
      if (r.producer_id) referralCounts.set(r.producer_id, (referralCounts.get(r.producer_id) || 0) + 1);
    });
  }

  const results = preMatch.map((producer) =>
    mapAdvisorRow(producer, profileById.get(producer.id) || null, referralCounts.get(producer.id) || 0)
  );

  return res.status(200).json({
    results,
    total: results.length,
    truncated: (producers || []).length >= 500,
  });
}
