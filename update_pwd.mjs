import pg from 'pg';
const { Client } = pg;

async function updatePasswords() {
  const client = new Client({
    connectionString: "postgresql://postgres.fevdxgmtrhvwiuulopcf:ZO1OqZgv0K8L23qp@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  });
  
  try {
    await client.connect();
    
    // 1. Obtener hash del paciente (sabemos que es Test123456!)
    const patientRes = await client.query("SELECT encrypted_password FROM auth.users WHERE email = '55544433@telemed-paciente.com'");
    const hash = patientRes.rows[0]?.encrypted_password;
    
    if (!hash) {
        console.error("No se encontró el hash del paciente.");
        return;
    }
    
    console.log(`Usando hash: ${hash}`);
    
    // 2. Actualizar el password del doctor House
    const docEmail = 'dr.house.10101010@telemed.pro';
    const res = await client.query("UPDATE auth.users SET encrypted_password = $1 WHERE email = $2", [hash, docEmail]);
    console.log(`Doctor ${docEmail} actualizado: ${res.rowCount}`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

updatePasswords();
