import pg from 'pg';
const { Client } = pg;

async function listProfiles() {
  const client = new Client({
    connectionString: "postgresql://postgres.fevdxgmtrhvwiuulopcf:ZO1OqZgv0K8L23qp@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  });
  
  try {
    await client.connect();
    
    console.log("--- Executing unique active appointments index migration ---");
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_appointment 
      ON public.appointments (doctor_id, scheduled_at) 
      WHERE (status != 'cancelled')
    `);
    console.log("Migration executed successfully!");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

listProfiles();























