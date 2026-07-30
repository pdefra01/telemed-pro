import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://127.0.0.1:54321', 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH');

async function test() {
  const { data: admin } = await supabase.auth.signInWithPassword({
    email: 'admin@telemed.com', // Seed admin
    password: 'password123'
  });

  if (!admin.user) {
    console.log('Login failed');
    return;
  }
  console.log('Logged in as admin', admin.user.id);

  const { data: patient } = await supabase.from('profiles').select('id').eq('role', 'patient').limit(1).single();
  if (!patient) {
    console.log('No patient found');
    return;
  }
  console.log('Patient ID:', patient.id);

  const { data, error } = await supabase.rpc('post_manual_adjustment', {
    p_entity_id: patient.id,
    p_amount: 15000,
    p_type: 'payment',
    p_external_ref: 'TEST-' + Date.now(),
    p_source: 'Efectivo / Manual'
  });

  console.log('RPC Result:', data, error);

  const { data: movs, error: err2 } = await supabase.from('affiliate_account_movements').select('*').eq('entity_id', patient.id);
  console.log('Movements:', movs, err2);
}

test();
