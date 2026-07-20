export type Role = 'patient' | 'doctor' | 'admin' | 'advisor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  phone?: string;
  phoneVerified?: boolean;
  realEmail?: string;
  emailVerified?: boolean;
  communicationPreferences?: { whatsapp: boolean; sms: boolean; email: boolean };
  dni?: string;
  isActive?: boolean;
  digitalPublicKey?: string;
  encryptedPrivateKey?: string;
  promoter_code?: string;
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
  licenseNumber?: string;
  provincialLicense?: string;
  cuit?: string;
  phone?: string;
  university?: string;
  graduationYear?: number;
  consultationFee?: number;
  contractStartDate?: string;
  contractEndDate?: string;
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
  signaturePublicKey?: string;
  expirationDate: string;
  pdfUrl?: string;
  notes?: string;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  familyMemberId?: string;
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
  status?: string;
  baseCostPerAffiliate?: number;
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

export interface OperatingExpense {
  id: string;
  period: string;
  category: 'infrastructure' | 'medical_fees' | 'marketing' | 'administrative' | 'other';
  amount: number;
  description: string;
  createdAt: string;
}

export interface PLSummary {
  period: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  netMargin: number;
  breakdown: {
    revenue: {
      b2c: number;
      b2b: number;
      pharmacy: number;
    };
    expenses: {
      medicalFees: number;
      infrastructure: number;
      marketing: number;
      administrative: number;
      other: number;
    };
  };
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

export type QuestionType = 'single_choice' | 'multiple_choice' | 'boolean' | 'numeric' | 'text';

export interface SurveyQuestion {
  id: string;
  templateId: string;
  text: string;
  type: QuestionType;
  options?: string[];
  isRequired: boolean;
  orderIndex: number;
}

export interface SurveyTemplate {
  id: string;
  title: string;
  description?: string;
  createdBy?: string;
  createdAt: string;
  questions?: SurveyQuestion[];
}

export type CampaignStatus = 'draft' | 'active' | 'completed';
export type CampaignTargetGroup = 'all' | 'agreement' | 'risk_group';

export interface Campaign {
  id: string;
  title: string;
  description?: string;
  templateId: string;
  templateTitle?: string;
  status: CampaignStatus;
  targetGroup: CampaignTargetGroup;
  targetGroupId?: string;
  startDate: string;
  endDate?: string;
  createdAt: string;
}

export type ConditionOperator = 'equals' | 'greater_than' | 'less_than' | 'contains';
export type ActionType = 'medical_alert' | 'tag_risk_group' | 'recommend_appointment';

export interface CampaignAction {
  id: string;
  campaignId: string;
  questionId: string;
  conditionOperator: ConditionOperator;
  conditionValue: string;
  actionType: ActionType;
  actionPayload?: Record<string, any>;
}

export interface CampaignAssignment {
  id: string;
  campaignId: string;
  campaignTitle?: string;
  templateId?: string;
  patientId: string;
  status: 'pending' | 'completed';
  assignedAt: string;
  completedAt?: string;
}

export interface SurveyResponse {
  id: string;
  assignmentId: string;
  questionId: string;
  patientId: string;
  responseValue: string;
  createdAt: string;
}

export interface PharmacyProduct {
  id: string;
  name: string;
  activeIngredient: string;
  presentation: string;
  laboratory: string;
  price: number;
  requiresPrescription: boolean;
  category: string;
  imageUrl?: string;
  minStockThreshold?: number;
  reorderQuantity?: number;
}

export interface PharmacySupplier {
  id: string;
  name: string;
  cuit: string;
  contactEmail: string;
  phone?: string;
  currentBalance: number;
  status: 'active' | 'inactive';
  createdAt?: string;
}

export interface PharmacySupplierOrder {
  id: string;
  supplierId: string;
  productId: string;
  quantityOrdered: number;
  unitCost: number;
  totalCost: number;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  createdAt: string;
  supplierName?: string;
  productName?: string;
}

export interface SupplierAccountMovement {
  id: string;
  supplierId: string;
  orderId?: string;
  type: 'purchase_order' | 'payment';
  amount: number;
  description: string;
  createdAt: string;
}

export interface PharmacyInventory {
  id: string;
  productId: string;
  batchNumber: string;
  expirationDate: string;
  stockQuantity: number;
  reservedQuantity: number;
}

export interface PharmacyOrderItem {
  id?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
}

export interface PharmacyOrder {
  id: string;
  patientId: string;
  prescriptionId?: string;
  status: 'pending' | 'paid' | 'preparing' | 'dispatched' | 'delivered' | 'cancelled';
  subtotal: number;
  coverageDiscount: number;
  total: number;
  deliveryAddress: string;
  createdAt: string;
  items?: PharmacyOrderItem[];
}

export interface PharmacyDelivery {
  id: string;
  orderId: string;
  courierId?: string;
  courierName?: string;
  courierPhone?: string;
  trackingStatus: 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
  currentLat?: number;
  currentLng?: number;
  otpCode: string;
  updatedAt: string;
}

export interface ContactVerification {
  id: string;
  userId: string;
  channel: 'phone' | 'email';
  contactValue: string;
  otpCode: string;
  attempts: number;
  expiresAt: string;
  verifiedAt?: string;
}

export interface OfficeLocation {
  id: string;
  name: string;
  publicIp: string;
  isActive: boolean;
  createdAt?: string;
}

export interface DoctorWorkShift {
  id: string;
  doctorId: string;
  officeLocationId?: string;
  clockIn: string;
  clockOut?: string;
  durationMinutes?: number;
  ipAddress?: string;
  status: 'active' | 'completed' | 'abandoned';
  officeName?: string;
}

export interface Producer {
  id: string;
  name: string;
  producerCode: string;
  email: string;
  phone?: string;
  dni?: string;
  address?: string;
  hasAccount?: boolean;
  commissionRate: number;
  status: 'active' | 'inactive';
  createdAt?: string;
  totalAffiliatesReferred?: number;
}

export interface LegalTerm {
  id: string;
  version: string;
  title: string;
  contentMarkdown: string;
  isActive: boolean;
  createdAt?: string;
}

export interface LegalAcceptance {
  id: string;
  userId: string;
  termsVersion: string;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
}