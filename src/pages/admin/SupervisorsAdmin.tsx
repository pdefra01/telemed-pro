import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supervisorRepository, Supervisor, TeamAdvisor } from '../../repositories/SupervisorRepository';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', password: '', phone: '' };
const REQUIRED_MESSAGE = 'Completá nombre, apellido, email y contraseña.';

/** Admin screen: create supervisors and decide which advisors are on each team. */
const SupervisorsAdmin: React.FC = () => {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [advisors, setAdvisors] = useState<TeamAdvisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([supervisorRepository.listSupervisors(), supervisorRepository.listAdvisors()])
      .then(([sups, advs]) => {
        if (cancelled) return;
        setSupervisors(sups);
        setAdvisors(advs);
      })
      .catch(() => { if (!cancelled) setLoadError('No se pudieron cargar los supervisores.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleAssign = async (advisor: TeamAdvisor, value: string) => {
    const supervisorId = value || null;
    setActionError(null);
    try {
      await supervisorRepository.assignAdvisor(advisor.id, supervisorId);
      setAdvisors((current) => current.map((a) => (a.id === advisor.id ? { ...a, supervisorId } : a)));
    } catch {
      setActionError('No se pudo asignar el asesor.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.password) {
      setFormError(REQUIRED_MESSAGE);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const id = await supervisorRepository.createSupervisor(form);
      const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
      setSupervisors((current) =>
        [...current, { id, name, email: form.email.trim() }].sort((a, b) => a.name.localeCompare(b.name, 'es'))
      );
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear el supervisor.');
    } finally {
      setSaving(false);
    }
  };

  const supervisorSelect = (advisor: TeamAdvisor) => (
    <select
      aria-label={`Supervisor de ${advisor.name}`}
      value={advisor.supervisorId ?? ''}
      onChange={(e) => handleAssign(advisor, e.target.value)}
      className="px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm"
    >
      <option value="">Sin supervisor</option>
      {supervisors.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );

  const unassigned = advisors.filter((a) => !a.supervisorId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#003366]">Supervisores</h1>
          <p className="text-sm text-gray-500">Creá supervisores y armá el equipo de asesores de cada uno.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 hover:bg-teal-700"
        >
          <Plus size={18} /> Nuevo supervisor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre" name="sup-first-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input label="Apellido" name="sup-last-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input label="Email" name="sup-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Teléfono" name="sup-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Contraseña" name="sup-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <Button type="submit" isLoading={saving}>Crear supervisor</Button>
        </form>
      )}

      {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}

      {loading ? (
        <p className="text-gray-500">Cargando supervisores…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : (
        <>
          {supervisors.length === 0 && <p className="text-gray-500">Todavía no hay supervisores. Creá el primero con “Nuevo supervisor”.</p>}

          {supervisors.map((s) => {
            const team = advisors.filter((a) => a.supervisorId === s.id);
            return (
              <section key={s.id} data-testid={`supervisor-${s.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <div>
                  <h2 className="font-bold text-slate-900">{s.name}</h2>
                  <p className="text-sm text-gray-500">{s.email}</p>
                </div>
                {team.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin asesores asignados.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {team.map((a) => (
                      <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-slate-800">{a.name}</span>
                        {supervisorSelect(a)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <section data-testid="unassigned-advisors" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h2 className="font-bold text-slate-900">Asesores sin supervisor</h2>
            {unassigned.length === 0 ? (
              <p className="text-sm text-gray-500">Todos los asesores tienen supervisor.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {unassigned.map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="text-slate-800">{a.name}</span>
                    {supervisorSelect(a)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default SupervisorsAdmin;
