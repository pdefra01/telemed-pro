// Seeds the LOCAL Supabase database with the demo personas. Idempotent.
// Never touches the linked/production project: the URLs come from
// `supabase status` and are rejected unless they point at this machine.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDbUrl, assertLocalUrl, isMainModule, readLocalSupabaseStatus } from './lib/local-env.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEMO = {
  doctor: {
    email: 'lucia.fernandez.demo@example.com',
    password: 'DemoMedinex2026!',
    professionalTitle: 'Dra.',
    firstName: 'Lucía',
    lastName: 'Fernández',
    specialty: 'Clínica Médica',
    licenseNumber: 'MN 154.872',
  },
  patient: {
    dni: '40987321',
    password: 'DemoMedinex2026!',
    firstName: 'Camila',
    lastName: 'Rodríguez',
  },
};
DEMO.patient.email = `${DEMO.patient.dni}@medinex-paciente.com`;

// A short window of hourly slots around the current hour, every day
// (0 = Sunday). The slot of the current hour already started, so the app
// offers "Atención Inmediata" at any time of day, and the booking grid stays
// small enough for the captions. The seed runs at the start of every recording.
export function slotsAround(now = new Date()) {
  const hour = now.getHours();
  return [-1, 0, 1, 2, 3, 4]
    .map((offset) => (hour + offset + 24) % 24)
    .sort((a, b) => a - b)
    .map((h) => `${String(h).padStart(2, '0')}:00`);
}

// Two earlier visits with the same doctor, so her "Historia clínica" view of
// the patient has content before the demo call. The allergic rhinitis note
// sets up today's prescription (loratadine).
export function priorConsultations(now = new Date()) {
  const daysAgo = (days, hour) => {
    const at = new Date(now);
    at.setDate(at.getDate() - days);
    at.setHours(hour, 30, 0, 0);
    return at;
  };
  return [
    {
      at: daysAgo(152, 10),
      type: 'consultation',
      diagnosis: 'Faringitis aguda',
      notes:
        'Odinofagia y febrícula de 24 h. Fauces congestivas, sin exudado ni adenopatías. ' +
        'Se indica paracetamol 500 mg cada 8 h, hidratación y control si persiste la fiebre. ' +
        'Evolución favorable a las 72 h.',
    },
    {
      at: daysAgo(41, 16),
      type: 'checkup',
      diagnosis: 'Control de salud anual',
      notes:
        'Asintomática. TA 110/70 mmHg, FC 72 lpm, IMC 22. ' +
        'Antecedente de rinitis alérgica estacional; usa loratadina 10 mg a demanda en primavera. ' +
        'Se solicita laboratorio de rutina.',
    },
  ];
}

const availabilityAround = (now) => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, slots: slotsAround(now) }));

// A profile update that matches no row means the auth trigger did not create
// the profile: fail instead of recording a demo with a half-seeded persona.
export function expectOneRow(result, what) {
  if (result.rowCount !== 1) throw new Error(`[seed] Expected to update 1 ${what} profile, updated ${result.rowCount}.`);
}

async function ensureUser(admin, { email, password, metadata }) {
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user.id;
}

export async function seedLocal(status = readLocalSupabaseStatus(repoRoot)) {
  assertLocalUrl('Supabase API URL', status.apiUrl);
  assertLocalDbUrl('Supabase DB URL', status.dbUrl);

  const admin = createClient(status.apiUrl, status.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { doctor, patient } = DEMO;

  const doctorId = await ensureUser(admin, {
    email: doctor.email,
    password: doctor.password,
    metadata: { role: 'doctor', full_name: `${doctor.firstName} ${doctor.lastName}` },
  });
  const patientId = await ensureUser(admin, {
    email: patient.email,
    password: patient.password,
    metadata: { role: 'patient', full_name: `${patient.firstName} ${patient.lastName}`, is_active: true },
  });

  const db = new pg.Client({ connectionString: status.dbUrl });
  await db.connect();
  try {
    await db.query('begin');

    const doctorUpdate = await db.query(
      `update public.profiles set
         role = 'doctor', first_name = $2, last_name = $3, specialty = $4,
         license_number = $5, availability = $6::jsonb, is_active = true,
         is_verified = true, rating = 4.9, professional_title = $7
       where id = $1`,
      [doctorId, doctor.firstName, doctor.lastName, doctor.specialty, doctor.licenseNumber, JSON.stringify(availabilityAround(new Date())), doctor.professionalTitle]
    );
    expectOneRow(doctorUpdate, 'doctor');

    const patientUpdate = await db.query(
      `update public.profiles set
         role = 'patient', first_name = $2, last_name = $3, dni = $4,
         is_active = true, plan_status = 'active', payment_status = 'paid',
         current_period_quota_used = 0,
         plan_id = (select id from public.plans where name = 'Plan Individual' limit 1)
       where id = $1`,
      [patientId, patient.firstName, patient.lastName, patient.dni]
    );
    expectOneRow(patientUpdate, 'patient');

    // The dashboard reads the quota from the current coverage window (the
    // snapshot assign_plan opens in production). Open a 30-day one locally so
    // the badge shows the plan quota ("Consultas Bonificadas: n/∞" for the
    // unlimited Plan Individual) instead of "n/null".
    const coverage = await db.query(
      `insert into public.family_coverage_windows
         (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited)
       select pr.id, pl.id, now(), now() + interval '30 days',
              case when pl.is_unlimited then null else pl.bonified_consultations end, pl.is_unlimited
       from public.profiles pr join public.plans pl on pl.id = pr.plan_id
       where pr.id = $1
       on conflict (subject_profile_id) where subject_profile_id is not null do update set
         plan_id_snapshot = excluded.plan_id_snapshot, period_start = excluded.period_start,
         paid_through = excluded.paid_through, granted_quota = excluded.granted_quota,
         is_unlimited = excluded.is_unlimited`,
      [patientId]
    );
    if (coverage.rowCount !== 1) throw new Error('[seed] Could not open the patient coverage window (is "Plan Individual" seeded?).');

    // Clean slate: previous demo consultations would clutter the queue.
    await db.query('delete from public.prescriptions where patient_id = $1', [patientId]);
    await db.query('delete from public.medical_records where patient_id = $1', [patientId]);
    await db.query('delete from public.notifications where user_id = any($1::uuid[])', [[patientId, doctorId]]);
    await db.query('delete from public.appointments where patient_id = $1 or doctor_id = $2', [patientId, doctorId]);

    // Re-create the earlier, completed visits and their clinical notes.
    for (const [i, visit] of priorConsultations(new Date()).entries()) {
      const appt = await db.query(
        `insert into public.appointments (patient_id, doctor_id, scheduled_at, specialty, status, livekit_room_name, notes, created_at)
         values ($1, $2, $3, $4, 'completed', $5, $6, $3)
         returning id`,
        [patientId, doctorId, visit.at, doctor.specialty, `room-demo-prior-${i + 1}-${patientId.slice(0, 8)}`, visit.notes]
      );
      await db.query(
        `insert into public.medical_records (appointment_id, patient_id, doctor_id, doctor_name, date, diagnosis, notes, type, created_at)
         values ($1, $2, $3, $4, ($5::timestamptz)::date, $6, $7, $8, $5::timestamptz)`,
        [appt.rows[0].id, patientId, doctorId, `${doctor.firstName} ${doctor.lastName}`, visit.at, visit.diagnosis, visit.notes, visit.type]
      );
    }

    // finalize-consultation uploads the prescription PDF to this private
    // bucket. Production created it by hand (the migrations only make it
    // private), so a fresh local stack lacks it and falls back to a dummy URL.
    await db.query(
      `insert into storage.buckets (id, name, public) values ('prescriptions_pdfs', 'prescriptions_pdfs', false)
       on conflict (id) do update set public = false`
    );

    // The migrations do not ship an INSERT policy for appointments (production
    // got it from scripts/fix-rls.js). Add it locally so the patient can book.
    await db.query(`
      do $$ begin
        if not exists (
          select 1 from pg_policy
          where polrelid = 'public.appointments'::regclass
            and polname = 'Permitir insercion de turnos propios'
        ) then
          create policy "Permitir insercion de turnos propios" on public.appointments
            for insert with check (auth.uid() = patient_id or auth.uid() = doctor_id);
        end if;
      end $$;`);

    await db.query('commit');
  } catch (err) {
    await db.query('rollback').catch(() => {});
    throw err;
  } finally {
    await db.end();
  }

  console.log(`[seed] doctor ${doctor.email} (${doctorId}), patient DNI ${patient.dni} (${patientId})`);
  return { doctorId, patientId };
}

if (isMainModule(import.meta.url)) {
  seedLocal().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
