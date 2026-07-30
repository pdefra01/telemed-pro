import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://127.0.0.1:54321', 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH');

async function test() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: 'ALTER TABLE public.affiliate_account_movements ADD COLUMN receipt_number SERIAL;' });
  console.log('Result:', data, error);
}

test();
