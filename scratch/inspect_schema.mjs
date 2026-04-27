import pg from 'pg';
const { Client } = pg;

async function checkSchema() {
  const client = new Client({
    connectionString: "postgresql://postgres.fevdxgmtrhvwiuulopcf:ZO1OqZgv0K8L23qp@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  });
  
  try {
    await client.connect();
    
    console.log("--- Columnas de medical_records ---");
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'medical_records'");
    console.log(JSON.stringify(res.rows, null, 2));

    console.log("\n--- Columnas de appointments ---");
    const res2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'appointments'");
    console.log(JSON.stringify(res2.rows, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkSchema();
