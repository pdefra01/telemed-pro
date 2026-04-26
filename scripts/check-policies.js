import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env.local' });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function check() {
  await client.connect();
  const res = await client.query("SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE tablename = 'appointments'");
  console.log(res.rows);
  
  const profiles = await client.query("SELECT * FROM profiles WHERE role = 'doctor'");
  console.log("Doctors:", profiles.rows);
  
  await client.end();
}
check();