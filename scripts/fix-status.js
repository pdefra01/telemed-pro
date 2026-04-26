import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const dbUrl = process.env.DATABASE_URL;
const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

const schema = `
  ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
  ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'));
`;

async function run() {
  try {
    await client.connect();
    await client.query(schema);
    console.log("Constraint updated successfully");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}
run();