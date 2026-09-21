import React, { useState } from 'react';
import { Edit2, Loader2 } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors the server rule (server/adhesionEmail.js): trimmed, name@domain.tld. */
export function isValidEmailInput(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

interface Props {
  email: string;
  /** Only pending requests can be corrected. */
  editable: boolean;
  /** Resolve on success; reject (the caller shows the error toast) to stay in edit mode. */
  onSave: (email: string) => Promise<void>;
}

export const AdhesionEmailEditor: React.FC<Props> = ({ email, editable, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(email);
  const [saving, setSaving] = useState(false);

  const start = () => { setDraft(email); setEditing(true); };
  const cancel = () => setEditing(false);

  const save = async () => {
    if (!isValidEmailInput(draft) || saving) return;
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch {
      // The parent already surfaced the server message; keep the input open.
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <>
        <span className="text-sm text-white font-semibold break-all">{email}</span>
        {editable && (
          <button
            type="button"
            aria-label="Editar email"
            title="Editar email"
            onClick={start}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <Edit2 size={12} />
          </button>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <input
        type="email"
        aria-label="Nuevo email"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="flex-1 min-w-[12rem] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !isValidEmailInput(draft)}
        className="text-xs font-bold px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-1"
      >
        {saving && <Loader2 size={10} className="animate-spin" />}Guardar
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        className="text-xs font-bold px-2 py-1 rounded border border-slate-600 text-slate-300"
      >
        Cancelar
      </button>
    </div>
  );
};
