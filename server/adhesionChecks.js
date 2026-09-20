// server/adhesionChecks.js
//
// Pre-insert validation for public adhesion requests (duplicate DNI/CUIL,
// duplicate titular phone, family size by plan kind). Extracted from
// server.js so it can be unit-tested (server.js calls app.listen at import).

import { normalizeArgentinePhone } from './whatsapp.js';

/** Additional members (besides the titular) admitted by each plan kind. */
export const MAX_ADDITIONAL_MEMBERS = { individual: 0, familiar: 4 };

const PHONE_MESSAGE = 'El telefono ya esta registrado en otro afiliado o solicitud pendiente.';

/**
 * Normaliza un identificador (DNI o CUIL) a su forma canónica: solo dígitos.
 * NULL/undefined normalizan a cadena vacía — nunca deben "matchear" entre sí.
 */
export function normalize(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Arma el mensaje de rechazo correspondiente a un identificador
 * (dni|cuil|phone) y a la razón de la coincidencia
 * (affiliate|family_member|pending_request). Función pura.
 */
export function buildConflictMessage(identifier, reason) {
  if (identifier === 'phone') return PHONE_MESSAGE;
  const label = identifier === 'cuil' ? 'CUIL' : 'DNI';
  if (reason === 'affiliate') return `Este ${label} ya se encuentra afiliado a Medinex.`;
  if (reason === 'family_member') return `Este ${label} ya está registrado como integrante de otro grupo familiar.`;
  if (reason === 'pending_request') return `Ya existe una solicitud pendiente con este ${label}.`;
  return `Este ${label} ya se encuentra registrado.`;
}

/** Resolves 'individual' | 'familiar' from a kind or a legacy plan name. */
async function resolvePlanKind(supabaseAdmin, planType) {
  const requested = (planType || '').toString().trim();
  const lowered = requested.toLowerCase();
  if (lowered === 'individual' || lowered === 'familiar') return lowered;
  if (requested) {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('plan_kind')
      .eq('name', requested)
      .limit(1)
      .maybeSingle();
    if (data?.plan_kind) return data.plan_kind;
  }
  return 'familiar';
}

/**
 * POST /api/adhesion/check-duplicates
 * Valida, antes del insert público, que el DNI y el CUIL del titular y de
 * cada familiar no colisionen con afiliados (profiles), integrantes de otro
 * grupo familiar (family_members) o solicitudes pendientes, que el teléfono
 * del titular no esté en uso, y que la cantidad de familiares respete el plan
 * (Individual 0, Familiar 4). Las solicitudes rechazadas nunca bloquean.
 */
export function checkDuplicatesHandler({ supabaseAdmin }) {
  return async function checkDuplicates(req, res) {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Servicio de administración no configurado.' });
    }

    const { titularDni, titularCuil, titularPhone, planType, family } = req.body || {};
    if (!titularDni) {
      return res.status(400).json({ error: 'Falta el DNI del titular.' });
    }

    const familyList = Array.isArray(family) ? family : [];

    try {
      const planKind = await resolvePlanKind(supabaseAdmin, planType);
      const maxMembers = MAX_ADDITIONAL_MEMBERS[planKind] ?? MAX_ADDITIONAL_MEMBERS.familiar;
      if (familyList.length > maxMembers) {
        const error = planKind === 'individual'
          ? 'El plan Individual no admite integrantes adicionales.'
          : `El plan Familiar admite hasta ${maxMembers} integrantes adicionales.`;
        return res.status(400).json({ error });
      }

      const people = [
        { person: 'titular', name: null, rawDni: titularDni, rawCuil: titularCuil, dni: normalize(titularDni), cuil: normalize(titularCuil) },
        ...familyList.map((f) => ({
          person: 'family',
          name: f?.name || null,
          rawDni: f?.dni,
          rawCuil: f?.cuil,
          dni: normalize(f?.dni),
          cuil: normalize(f?.cuil),
        })),
      ];

      const dniSet = [...new Set(people.map((p) => p.dni).filter(Boolean))];
      const cuilSet = [...new Set(people.map((p) => p.cuil).filter(Boolean))];
      const phone = normalizeArgentinePhone(titularPhone);

      const conflicts = [];
      function collectConflicts(row, reason) {
        const rowDni = normalize(row.dni);
        const rowCuil = normalize(row.cuil);
        for (const p of people) {
          if (rowDni && p.dni && rowDni === p.dni) {
            conflicts.push({ identifier: 'dni', value: p.rawDni, person: p.person, name: p.name, reason, message: buildConflictMessage('dni', reason) });
          }
          if (rowCuil && p.cuil && rowCuil === p.cuil) {
            conflicts.push({ identifier: 'cuil', value: p.rawCuil, person: p.person, name: p.name, reason, message: buildConflictMessage('cuil', reason) });
          }
        }
      }
      function collectPhoneConflict(rowPhone, reason) {
        if (phone && normalizeArgentinePhone(rowPhone) === phone) {
          conflicts.push({ identifier: 'phone', value: titularPhone, person: 'titular', name: null, reason, message: buildConflictMessage('phone', reason) });
        }
      }

      // Se traen las filas y se compara normalizado en JS: los identificadores
      // guardados pueden tener separadores y un .in() de PostgREST compara
      // string exacto contra la columna cruda. Las tablas son chicas.
      if (dniSet.length > 0 || cuilSet.length > 0) {
        // 1. Afiliados activos
        const { data: profileMatches, error: profileErr } = await supabaseAdmin
          .from('profiles')
          .select('id,dni,cuil')
          .or('dni.not.is.null,cuil.not.is.null');
        if (profileErr) throw profileErr;
        for (const row of profileMatches || []) collectConflicts(row, 'affiliate');

        // 2. Integrantes de otro grupo familiar
        const { data: familyMatches, error: familyErr } = await supabaseAdmin
          .from('family_members')
          .select('id,dni,cuil,full_name')
          .or('dni.not.is.null,cuil.not.is.null');
        if (familyErr) throw familyErr;
        for (const row of familyMatches || []) collectConflicts(row, 'family_member');
      }

      // 3. Solicitudes pendientes (DNI/CUIL y teléfono)
      const { data: pendingMatches, error: pendingErr } = await supabaseAdmin
        .from('adhesion_requests')
        .select('id,titular_dni,titular_cuil,titular_phone')
        .eq('status', 'pending');
      if (pendingErr) throw pendingErr;
      for (const row of pendingMatches || []) {
        collectConflicts({ dni: row.titular_dni, cuil: row.titular_cuil }, 'pending_request');
        collectPhoneConflict(row.titular_phone, 'pending_request');
      }

      // 4. Teléfono del titular contra afiliados (pacientes)
      if (phone) {
        const { data: phoneMatches, error: phoneErr } = await supabaseAdmin
          .from('profiles')
          .select('id,phone')
          .eq('role', 'patient');
        if (phoneErr) throw phoneErr;
        for (const row of phoneMatches || []) collectPhoneConflict(row.phone, 'affiliate');
      }

      if (conflicts.length > 0) {
        return res.status(409).json({ ok: false, conflicts });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[adhesion/check-duplicates] Unexpected error:', err);
      return res.status(500).json({ error: 'Error interno al validar duplicados.' });
    }
  };
}
