import pg from 'pg';
const { Client } = pg;

async function listProfiles() {
  const client = new Client({
    connectionString: "postgresql://postgres.fevdxgmtrhvwiuulopcf:ZO1OqZgv0K8L23qp@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  });
  
  try {
    await client.connect();
    
    console.log("--- Todos los perfiles ---");
    const res = await client.query("SELECT * FROM profiles");
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

listProfiles();
