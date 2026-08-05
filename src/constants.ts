import { Doctor, Patient, Appointment, MedicalRecord, Prescription, Payment, MedicalDocument } from './types';

export const APP_NAME = "MEDINEX";

export const MOCK_DOCTORS: Doctor[] = [
  {
    id: 'd1',
    name: 'Dr. Alejandro Silva',
    email: 'asilva@medinex.com',
    role: 'doctor',
    specialty: 'Cardiología',
    rating: 4.8,
    reviewCount: 215,
    isVerified: true,
    avatarUrl: 'https://picsum.photos/seed/doctor1/200/200',
    availability: [{ day: 1, slots: ['09:00', '10:00', '14:00', '15:00'] }],
    metrics: {
      showRate: 98,
      avgConsultationTime: '22 min',
      totalConsultations: 1240,
      prescriptionsIssued: 850,
      rankingScore: 95,
      starRating: 4.8,
      qualityAlert: false
    }
  },
  {
    id: 'd2',
    name: 'Dra. Elena Rossi',
    email: 'erossi@medinex.com',
    role: 'doctor',
    specialty: 'Pediatría',
    rating: 4.9,
    reviewCount: 340,
    isVerified: true,
    avatarUrl: 'https://picsum.photos/seed/doctor2/200/200',
    availability: [{ day: 1, slots: ['08:00', '11:00'] }, { day: 3, slots: ['08:00', '11:00'] }, { day: 5, slots: ['08:00', '11:00'] }],
    metrics: {
      showRate: 95,
      avgConsultationTime: '15 min',
      totalConsultations: 2100,
      prescriptionsIssued: 1200,
      rankingScore: 98,
      starRating: 4.9,
      qualityAlert: false
    }
  },
  {
    id: 'd3',
    name: 'Dr. Marco Polo',
    email: 'mpolo@medinex.com',
    role: 'doctor',
    specialty: 'Medicina General',
    rating: 3.8,
    reviewCount: 50,
    isVerified: true,
    avatarUrl: 'https://picsum.photos/seed/doctor3/200/200',
    availability: [{ day: 2, slots: ['13:00', '14:00'] }, { day: 4, slots: ['13:00', '14:00'] }],
    metrics: {
      showRate: 85,
      avgConsultationTime: '10 min',
      totalConsultations: 150,
      prescriptionsIssued: 80,
      rankingScore: 60,
      starRating: 3.8,
      qualityAlert: true // PRD Warning
    }
  }
];

export const MOCK_PATIENT: Patient = {
  id: 'p1',
  name: 'Juan Pérez',
  email: 'juan@gmail.com',
  role: 'patient',
  planStatus: 'active',
  dni: '12.345.678',
  phone: '+54 9 11 1234 5678',
  address: 'Av. Libertador 1234, CABA',
  birthDate: '1985-04-12',
  planName: 'Plan Familiar Premium',
  avatarUrl: 'https://picsum.photos/seed/patient1/200/200',
  paymentStatus: 'current',
  currentPeriodQuotaUsed: 0,
  familyMembers: [
    { id: 'f1', name: 'María Pérez', relation: 'Esposa', age: 34 },
    { id: 'f2', name: 'Tomas Pérez', relation: 'Hijo', age: 8 }
  ]
};

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: 'a1',
    patientId: 'p1',
    patientName: 'Juan Pérez',
    doctorId: 'd1',
    doctorName: 'Dr. Alejandro Silva',
    date: '2024-05-20',
    time: '14:00',
    status: 'confirmed',
    type: 'video'
  },
  {
    id: 'a2',
    patientId: 'p1',
    patientName: 'Tomas Pérez',
    doctorId: 'd2',
    doctorName: 'Dra. Elena Rossi',
    date: '2024-05-22',
    time: '09:00',
    status: 'pending',
    type: 'video'
  }
];

export const MOCK_RECORDS: MedicalRecord[] = [
  {
    id: 'mr1',
    patientId: 'p1',
    date: '2023-11-15',
    diagnosis: 'Bronquitis Aguda',
    notes: 'Paciente presenta tos seca y fiebre leve. Se recomienda reposo y abundante líquido.',
    doctorName: 'Dr. Marco Polo',
    type: 'consultation'
  },
  {
    id: 'mr2',
    patientId: 'p1',
    date: '2023-06-10',
    diagnosis: 'Control Anual',
    notes: 'Parámetros normales. Presión arterial 120/80.',
    doctorName: 'Dr. Alejandro Silva',
    type: 'checkup'
  }
];

export const MOCK_PRESCRIPTIONS: Prescription[] = [
  {
    id: 'pr1',
    patientId: 'p1',
    doctorName: 'Dr. Alejandro Silva',
    medications: [
      {
        name: 'Amoxicilina 500mg',
        instructions: 'Tomar 1 comprimido cada 8 horas por 7 días.',
        quantity: 1
      }
    ],
    date: '2023-11-15',
    expirationDate: '2023-12-15',
    status: 'dispensed',
    digitalSignature: 'SIG-99283-VALID'
  },
  {
    id: 'pr2',
    patientId: 'p1',
    doctorName: 'Dr. Alejandro Silva',
    medications: [
      {
        name: 'Ibuprofeno 400mg',
        instructions: 'Tomar en caso de dolor o fiebre.',
        quantity: 1
      }
    ],
    date: '2024-05-20',
    expirationDate: '2024-06-20',
    status: 'active',
    digitalSignature: 'SIG-11223-VALID'
  }
];

export const MOCK_PAYMENTS: Payment[] = [
  { id: 'pay1', patientId: 'p1', amount: 15000, date: '2024-05-01', period: 'Mayo 2024', status: 'pending' },
  { id: 'pay2', patientId: 'p1', amount: 15000, date: '2024-04-01', period: 'Abril 2024', status: 'paid' },
  { id: 'pay3', patientId: 'p1', amount: 14500, date: '2024-03-01', period: 'Marzo 2024', status: 'paid' },
];

export const MOCK_DOCUMENTS: MedicalDocument[] = [
  { id: 'doc1', patientId: 'p1', title: 'Análisis de Sangre', type: 'lab_result', date: '2024-01-10', url: '#', uploadedBy: 'doctor' },
  { id: 'doc2', patientId: 'p1', title: 'Radiografía Tórax', type: 'imaging', date: '2023-11-15', url: '#', uploadedBy: 'patient' },
];