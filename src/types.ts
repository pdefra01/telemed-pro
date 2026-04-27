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
  familyGroupId?: string;
  planStatus: 'active' | 'pending' | 'suspended';
  address?: string;
  birthDate?: string;
  planId?: string;
  planName?: string; // e.g., "Plan Familiar Premium"
  agreementId?: string;
  paymentStatus: 'paid' | 'overdue' | 'grace_period';
  currentPeriodQuotaUsed: number;
  bloodType?: string;
  credentialHash?: string;
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
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  type: 'video' | 'chat' | 'in-person';
  notes?: string; // Doctor's evolution notes
  consultationMetadata?: {
    patientJoinedAt?: string;
    doctorJoinedAt?: string;
    startedAt?: string;
    endedAt?: string;
    latencyAvg?: number;
    signalStrengthAvg?: number;
  };
}

export interface MedicalRecord {
  id: string;
  appointmentId?: string; // Optional for migration/old records
  patientId: string;
  doctorId?: string;
  date: string;
  diagnosis: string;
  notes: string;
  doctorName: string;
  type: 'consultation' | 'emergency' | 'checkup';
  attachments?: string[];
}

export interface Prescription {
  id: string;
  appointmentId?: string;
  patientId: string;
  doctorId?: string;
  doctorName: string;
  medications: {
    name: string;
    instructions: string;
    quantity: number;
  }[];
  date: string;
  status: 'active' | 'dispensed' | 'expired';
  digitalSignature: string; // PRD 3.4
  expirationDate: string;
  pdfUrl?: string;
  notes?: string;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  title: string;
  type: 'lab_result' | 'imaging' | 'certificate' | 'other';
  date: string;
  url: string;
  uploadedBy: 'patient' | 'doctor';
}

export interface Plan {
  id: string;
  name: string;
  monthlyCost: number;
  bonifiedConsultations: number;
  maxFamilyMembers: number;
  metadata?: Record<string, any>;
}

export interface Agreement {
  id: string;
  name: string;
  cuit?: string;
  billingEmail?: string;
  taxCategory?: string;
  basePlanId?: string;
  metadata?: Record<string, any>;
}

export interface FamilyGroup {
  id: string;
  primaryAffiliateId: string;
  name?: string;
}

export interface TaxConfiguration {
  id: string;
  name: string;
  rate: number;
  scope: 'national' | 'local';
  isActive: boolean;
}

export interface Invoice {
  id: string;
  entityType: 'affiliate' | 'agreement';
  entityId: string;
  period: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxDetails?: any[];
  status: 'issued' | 'paid' | 'cancelled';
  pdfUrl?: string;
  createdAt: string;
}

export interface SystemSettings {
  key: string;
  value: any;
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