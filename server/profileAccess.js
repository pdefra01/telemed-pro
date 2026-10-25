/**
 * Sets the role and active flag of a profile the server just created through
 * `auth.admin.createUser`.
 *
 * handle_new_user never trusts user_metadata for these (a public signUp
 * controls it), and GoTrue writes app_metadata only AFTER inserting the user,
 * so the new profile always starts as an inactive patient. This service-role
 * update gives it the intended access. When it fails, the auth user is deleted
 * so no half-created account is left behind. Never throws.
 *
 * @param {object} supabaseAdmin service-role client
 * @param {string} userId
 * @param {{ role: string, isActive: boolean }} access
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function applyProfileAccess(supabaseAdmin, userId, { role, isActive }) {
  let error;
  try {
    const result = await supabaseAdmin
      .from('profiles')
      .update({ role, is_active: isActive })
      .eq('id', userId);
    error = result.error;
  } catch (err) {
    error = err;
  }
  if (!error) return { ok: true };

  const message = error.message || String(error);
  try {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch (rollbackErr) {
    console.error('[profileAccess] Rollback of auth user failed:', rollbackErr?.message || String(rollbackErr));
  }
  return { ok: false, error: message };
}
