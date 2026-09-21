/**
 * Builds the `requireAdmin` Express middleware. It must run after `requireAuth`
 * (it depends on req.user).
 *
 * The role comes ONLY from the `profiles` row. `user_metadata` is editable by the
 * signed-in user, so it is never used to grant access, and a failed lookup never
 * falls back to it.
 */
export function buildRequireAdmin(supabaseAdmin) {
  return async (req, res, next) => {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    // PGRST116 = no row for this user: a plain "not an admin", not a server fault.
    if (error && error.code !== 'PGRST116') {
      console.error('[requireAdmin] Profile lookup failed:', error.message);
      return res.status(500).json({ error: 'No se pudieron verificar los permisos.' });
    }

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    next();
  };
}
