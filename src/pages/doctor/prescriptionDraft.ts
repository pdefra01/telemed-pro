export interface PrescriptionDraft {
  medications: { med: string; dose: string }[];
  recommendations: string;
}

/** Builds the navigate state from the video-call "Receta" tab; null when empty. */
export function buildPrescriptionDraft(
  prescription: { med: string; dose: string }[],
  recommendations: string
): PrescriptionDraft | null {
  // Never throws: it runs after the appointment is already completed.
  const medications: PrescriptionDraft['medications'] = [];
  for (const item of Array.isArray(prescription) ? prescription : []) {
    const med = typeof item?.med === 'string' ? item.med.trim() : '';
    if (!med) continue;
    medications.push({ med, dose: typeof item.dose === 'string' ? item.dose.trim() : '' });
  }
  const text = typeof recommendations === 'string' ? recommendations.trim() : '';
  if (medications.length === 0 && !text) return null;
  return { medications, recommendations: text };
}

/** Defensively reads the draft from router state; null when absent or malformed. */
export function parsePrescriptionDraft(state: unknown): PrescriptionDraft | null {
  const draft = (state as { prescriptionDraft?: unknown } | null | undefined)?.prescriptionDraft;
  if (!draft || typeof draft !== 'object') return null;
  const { medications, recommendations } = draft as { medications?: unknown; recommendations?: unknown };

  const items: PrescriptionDraft['medications'] = [];
  if (Array.isArray(medications)) {
    for (const entry of medications) {
      if (!entry || typeof entry !== 'object') continue;
      const { med, dose } = entry as { med?: unknown; dose?: unknown };
      if (typeof med !== 'string' || !med.trim()) continue;
      items.push({ med: med.trim(), dose: typeof dose === 'string' ? dose.trim() : '' });
    }
  }
  const text = typeof recommendations === 'string' ? recommendations.trim() : '';
  if (items.length === 0 && !text) return null;
  return { medications: items, recommendations: text };
}
