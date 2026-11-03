import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PatientChartPanel } from '../PatientChartPanel';
import { PatientChartData } from '../../../repositories/PatientChartRepository';

const chart: PatientChartData = {
    profile: {
        fullName: 'Ana Pérez', dni: '30111222', cuil: null, birthDate: '1980-05-10', phone: '3875111222',
        email: 'ana@test.local', address: 'Calle 1', locality: null, neighborhood: null, city: 'Salta',
        province: 'Salta', bloodType: 'A+', planName: 'Plan X', planStatus: 'active',
    },
    intake: {
        medicalHistory: ['Hipertensión Arterial', 'Asma'],
        medicalHistoryOther: 'Enalapril 10mg',
        healthInsurance: 'OSDE',
        civilStatus: null,
        familyMembers: [{ name: 'Hijo Declarado', dni: '50111222', parentesco: 'hijo/a' }],
        declaredAt: '2026-07-18T10:00:00Z',
    },
    groupMembers: [{ fullName: 'Hijo Chart', relation: 'hijo/a', birthDate: '2017-03-02', dni: '50111222' }],
};

describe('PatientChartPanel', () => {
    it('shows personal data, declared conditions and the family group', () => {
        render(<PatientChartPanel chart={chart} />);
        expect(screen.getByText('30111222')).toBeInTheDocument();
        expect(screen.getByText('Hipertensión Arterial')).toBeInTheDocument();
        expect(screen.getByText('Enalapril 10mg')).toBeInTheDocument();
        expect(screen.getByText('Hijo Chart')).toBeInTheDocument();
        expect(screen.getByText('02/03/2017')).toBeInTheDocument();
    });

    it('does not repeat a declared member already present in the group', () => {
        render(<PatientChartPanel chart={chart} />);
        expect(screen.queryByText('Hijo Declarado')).not.toBeInTheDocument();
    });

    describe('plan section', () => {
        const withPlan = (plan: PatientChartData['plan']): PatientChartData => ({ ...chart, plan });

        it('shows the patient plan and what it includes', () => {
            render(
                <PatientChartPanel
                    chart={withPlan({
                        name: 'Plan Familiar', kind: 'familiar', status: 'active',
                        bonifiedConsultations: 4, isUnlimited: false, maxFamilyMembers: 3, pharmacyDiscountPercent: 20,
                    })}
                />
            );
            expect(screen.getByText('Plan Familiar')).toBeInTheDocument();
            expect(screen.getByText('Familiar')).toBeInTheDocument();
            expect(screen.getByText('Activo')).toBeInTheDocument();
            expect(screen.getByText('4 consultas bonificadas por mes')).toBeInTheDocument();
            expect(screen.getByText('Hasta 3 integrantes además del titular')).toBeInTheDocument();
            expect(screen.getByText('20% de descuento en farmacia')).toBeInTheDocument();
        });

        it('says so when the plan has unlimited consultations and no pharmacy discount', () => {
            render(
                <PatientChartPanel
                    chart={withPlan({
                        name: 'Plan Libre', kind: 'individual', status: 'suspended',
                        bonifiedConsultations: 0, isUnlimited: true, maxFamilyMembers: 0, pharmacyDiscountPercent: 0,
                    })}
                />
            );
            expect(screen.getByText('Consultas ilimitadas')).toBeInTheDocument();
            expect(screen.getByText('Sin descuento en farmacia')).toBeInTheDocument();
            expect(screen.getByText('Suspendido')).toBeInTheDocument();
            expect(screen.getByText('Solo el titular')).toBeInTheDocument();
        });

        it('falls back to the plan name on the profile when the plan details are missing', () => {
            render(<PatientChartPanel chart={withPlan(null)} />);
            expect(screen.getByText('Plan X')).toBeInTheDocument();
            expect(screen.queryByText(/consultas bonificadas/)).not.toBeInTheDocument();
        });
    });

    it('shows a fallback when there is no chart', () => {
        render(<PatientChartPanel chart={null} />);
        expect(screen.getByText(/No se pudieron cargar/)).toBeInTheDocument();
    });
});
