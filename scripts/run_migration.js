import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.fevdxgmtrhvwiuulopcf:ZO1OqZgv0K8L23qp@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  });

  try {
    await client.connect();
    console.log('Connected to DB');
    
    const sql = fs.readFileSync('supabase/migrations/20260426000002_prescriptions_storage.sql', 'utf8');
    
    await client.query(sql);
    console.log('Migration applied successfully');

    // Also mark the previous migrations as applied to fix Supabase CLI state
    await client.query(`
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version character varying(14) NOT NULL,
        statements text[],
        name character varying(255)
      );
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES 
        ('20260426000000', 'scheduler_setup'),
        ('20260426000001', 'consultation_history'),
        ('20260426000002', 'prescriptions_storage')
      ON CONFLICT DO NOTHING;
    `);
    console.log('Migration state synced');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}

run();
