import pg from 'pg';
const { Client } = pg;
const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await c.connect();
const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' ORDER BY ordinal_position`);
console.log(JSON.stringify(r.rows, null, 2));
const fg = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'family_groups' ORDER BY ordinal_position`);
console.log('family_groups:', JSON.stringify(fg.rows, null, 2));
await c.end();
