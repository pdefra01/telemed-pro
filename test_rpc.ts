import { supabase } from './src/services/supabase.js';

async function test() {
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  if (!profiles || profiles.length === 0) {
    console.log('No profiles found');
    return;
  }
  const patientId = profiles[0].id;

  console.log('Testing post_manual_adjustment for', patientId);
  const { data, error } = await supabase.rpc('post_manual_adjustment', {
    p_entity_id: patientId,
    p_amount: 15000,
    p_type: 'payment',
    p_external_ref: `TEST-${Date.now()}`,
    p_source: 'Efectivo / Manual',
  });

  console.log('Result:', data, error);
}

test();
