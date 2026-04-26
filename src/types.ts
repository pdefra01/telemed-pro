export type Role = 'patient' | 'doctor' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  phone?: string;
  dni?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  age: number;
}

export interface Patient extends User {
  role: 'patient';
  familyMembers?: FamilyMember[];
  planStatus: 'active' | 'pending' | 'suspended';
  address?: string;
  birthDate?: string;
  planName?: string; // e.g., "Plan Familiar Premium"
}

export interface DoctorMetrics {
  showRate: number; // Porcentaje de asistencia
  avgConsultationTime: string; // e.g., "18 min"
  totalConsultations: number;
  prescriptionsIssued: number;
  rankingScore: number; // 0 to 100 internal score
  starRating: number; // 1 to 5 based on patient reviews
  qualityAlert: boolean; // PRD 3.13.4 (< 4 stars)
}

export interface Doctor extends User {
  role: 'doctor';
  specialty: string;
  rating: number; // Deprecated in favor of metrics.starRating but kept for compatibility
  reviewCount: number;
  isVerified: boolean;
  availability: string[];
  metrics?: DoctorMetrics; // PRD 3.13
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  type: 'video' | 'chat' | 'in-person';
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  date: string;
  diagnosis: string;
  notes: string;
  doctorName: string;
  type: 'consultation' | 'emergency' | 'checkup';
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorName: string;
  medication: string;
  instructions: string;
  date: string;
  status: 'active' | 'dispensed' | 'expired';
  digitalSignature: string; // PRD 3.4
  expirationDate: string;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  title: string;
  type: 'lab_result' | 'imaging' | 'certificate';
  date: string;
  url: string;
  uploadedBy: 'patient' | 'doctor';
}

export interface Payment {
  id: string;
  patientId: string;
  amount: number;
  date: string;
  period: string; // e.g., "Mayo 2024"
  status: 'paid' | 'pending' | 'overdue';
  invoiceUrl?: string;
}