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

// Hourly slots 00:00–23:00 every day (0 = Sunday), so a run at any time of
// day finds a slot that already started and offers "Atención Inmediata".
const SLOTS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const AVAILABILITY = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, slots: SLOTS }));

// A profile update that matches no row means the auth trigger did not create
// the profile: fail instead of recording a demo with a half-seeded persona.
function expectOneRow(result, what) {
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
         is_verified = true, rating = 4.9
       where id = $1`,
      [doctorId, `Dra. ${doctor.firstName}`, doctor.lastName, doctor.specialty, doctor.licenseNumber, JSON.stringify(AVAILABILITY)]
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

    // Clean slate: previous demo consultations would clutter the queue.
    await db.query('delete from public.prescriptions where patient_id = $1', [patientId]);
    await db.query('delete from public.medical_records where patient_id = $1', [patientId]);
    await db.query('delete from public.notifications where user_id = any($1::uuid[])', [[patientId, doctorId]]);
    await db.query('delete from public.appointments where patient_id = $1 or doctor_id = $2', [patientId, doctorId]);

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
