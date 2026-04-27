import pg from 'pg';
const { Client } = pg;

async function clearPatient() {
  const client = new Client({
    connectionString: "postgresql://postgres.fevdxgmtrhvwiuulopcf:ZO1OqZgv0K8L23qp@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  });
  
  try {
    await client.connect();
    
    // 1. Encontrar el ID del paciente 55544433
    // Como no tenemos DNI en profiles, usamos el email de auth.users si podemos
    // O simplemente usamos el ID que ya conocemos: 74bcf2a3-28c6-4f39-8906-7254164ffd35
    const patientId = '74bcf2a3-28c6-4f39-8906-7254164ffd35';
    
    console.log(`Eliminando turnos para el paciente ${patientId}...`);
    const res = await client.query("DELETE FROM appointments WHERE patient_id = $1", [patientId]);
    console.log(`Eliminados: ${res.rowCount}`);

    // También eliminamos para el doctor House si queremos limpiar todo
    // const doctorId = '54d2874b-6878-4328-8fb9-70397cf1b287';
    // await client.query("DELETE FROM appointments WHERE doctor_id = $1", [doctorId]);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

clearPatient();
