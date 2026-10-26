import React from 'react';
import { PatientChartData } from '../../repositories/PatientChartRepository';

interface PatientChartPanelProps {
    chart: PatientChartData | null;
}

const formatDate = (value: string | null | undefined): string => {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : value;
};

const Field: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
    <div className="min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
        <dd className="text-sm text-slate-200 break-words">{value || '—'}</dd>
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="bg-white/[0.03] rounded-xl p-4 sm:p-5 border border-white/5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">{title}</h4>
        {children}
    </section>
);

export const PatientChartPanel: React.FC<PatientChartPanelProps> = ({ chart }) => {
    if (!chart) {
        return (
            <p className="text-center py-20 text-slate-500 text-sm">
                No se pudieron cargar los datos del paciente.
            </p>
        );
    }

    const { profile, intake, groupMembers } = chart;
    const declared = intake?.familyMembers ?? [];
    const declaredNotInGroup = declared.filter(
        (m) => !groupMembers.some((g) => g.dni && m.dni && g.dni === m.dni)
    );
    const address = [profile.address, profile.neighborhood, profile.locality, profile.city, profile.province]
        .filter(Boolean)
        .join(', ');

    return (
        <div className="space-y-3">
            <Section title="Datos personales">
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Nombre" value={profile.fullName} />
                    <Field label="DNI" value={profile.dni} />
                    <Field label="CUIL" value={profile.cuil} />
                    <Field label="Nacimiento" value={profile.birthDate ? formatDate(profile.birthDate) : null} />
                    <Field label="Grupo sanguíneo" value={profile.bloodType} />
                    <Field label="Estado civil" value={intake?.civilStatus} />
                    <Field label="Teléfono" value={profile.phone} />
                    <Field label="Email" value={profile.email} />
                    <Field label="Domicilio" value={address} />
                    <Field label="Plan" value={profile.planName} />
                    <Field label="Cobertura médica" value={intake?.healthInsurance} />
                </dl>
            </Section>

            <Section title="Declaración de salud del alta">
                {intake ? (
                    <div className="space-y-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                                Enfermedades crónicas / antecedentes
                            </p>
                            {intake.medicalHistory.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {intake.medicalHistory.map((item) => (
                                        <span key={item} className="text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400">Sin antecedentes declarados.</p>
                            )}
                        </div>
                        <Field label="Otros / medicación permanente" value={intake.medicalHistoryOther} />
                        <p className="text-xs text-slate-500">Declarado el {formatDate(intake.declaredAt)}</p>
                    </div>
                ) : (
                    <p className="text-sm text-slate-400">Este paciente no tiene declaración de salud de alta.</p>
                )}
            </Section>

            <Section title="Grupo familiar">
                {groupMembers.length === 0 && declaredNotInGroup.length === 0 ? (
                    <p className="text-sm text-slate-400">Sin integrantes en el grupo familiar.</p>
                ) : (
                    <ul className="space-y-2">
                        {groupMembers.map((m) => (
                            <li key={`${m.fullName}-${m.dni ?? ''}`} className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/40 rounded-lg px-3 py-2">
                                <Field label="Nombre" value={m.fullName} />
                                <Field label="Parentesco" value={m.relation} />
                                <Field label="DNI" value={m.dni} />
                                <Field label="Nacimiento" value={m.birthDate ? formatDate(m.birthDate) : null} />
                            </li>
                        ))}
                        {declaredNotInGroup.map((m, i) => (
                            <li key={`declared-${i}`} className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/40 rounded-lg px-3 py-2">
                                <Field label="Nombre" value={m.name} />
                                <Field label="Parentesco" value={m.parentesco} />
                                <Field label="DNI" value={m.dni} />
                                <Field label="Nacimiento" value={m.birthDate ? formatDate(m.birthDate) : null} />
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
        </div>
    );
};
