// GET /api/admin/whatsapp-status  (requireAuth, requireAdmin)
// Current state of the company WhatsApp (WAHA) session, for the admin panel indicator.

export function whatsappStatusHandler({ waha }) {
  return async function whatsappStatus(_req, res) {
    if (!waha) return res.status(200).json({ status: 'NOT_CONFIGURED' });
    return res.status(200).json({ status: await waha.getSessionStatus() });
  };
}
