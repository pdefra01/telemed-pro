export type Role = 'patient' | 'doctor' | 'admin' | 'advisor' | 'supervisor';

export type ProspectStatus = 'new' | 'contacted' | 'interested' | 'affiliated' | 'lost';

/** Per-advisor figures for one month, from `advisor_monthly_metrics`. */
export interface AdvisorMonthMetrics {
  advisorId: string;
  advisorName: string;
  supervisorId?: string;
  month: string;
  affiliatesSold: number;
  revenue: number;
  prospectsLoaded: number;
  prospectsContacted: number;
  prospectsAffiliated: number;
  prospectsStale: number;
  linksShared: number;
  goalAffiliates?: number;
  goalRevenue?: number;
  /** Approved sales whose affiliate has no confirmed payment yet (they count from the first payment). */
  affiliatesUnconfirmed: number;
}

export type CollectionStatus = 'current' | 'pending' | 'overdue';
export type CollectionActionType = 'call' | 'whatsapp' | 'visit' | 'note' | 'promise';

/** An affiliate an advisor brought, with the state of their account, from `advisor_collections`. */
export interface CollectionAffiliate {
  affiliateId: string;
  affiliateName: string;
  affiliatePhone?: string;
  advisorId: string;
  advisorName: string;
  planName?: string;
  paymentStatus: CollectionStatus;
  balance: number;
  paidThrough?: string;
  lastActionAt?: string;
  lastActionType?: CollectionActionType;
  promisedDate?: string;
  actionsCount: number;
  /** The current Mercado Pago debit subscription is 'payment_failed'. */
  debitRejected: boolean;
  /** Date of the last rejected debit (kept after a recovery, as history). */
  debitRejectedAt?: string;
  debitFailures: number;
}

export interface CollectionAction {
  id: string;
  affiliateId: string;
  actionType: CollectionActionType;
  note?: string;
  promisedDate?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface CollectionActionInput {
  actionType: CollectionActionType;
  note?: string;
  /** `YYYY-MM-DD`; only meaningful (and required) for a promise to pay. */
  promisedDate?: string;
}

export interface GoalTargets {
  targetAffiliates?: number | null;
  targetRevenue?: number | null;
}

export interface Prospect {
  id: string;
  advisorId: string;
  advisorName?: string;
  fullName: string;
  phone?: string;
  email?: string;
  notes?: string;
  status: ProspectStatus;
  source: 'manual' | 'lead_survey' | 'adhesion';
  lastContactAt?: string;
  createdAt: string;
  updatedAt: string;
}

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
  /** Medinex plan held by the account (patients, and advisors with a plan). */
  planId?: string;
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
  /** Listed in the affiliates screen while being an active advisor: holds the plan free of charge. */
  isAdvisor?: boolean;
  agreementId?: string;
  paymentStatus: 'current' | 'overdue' | 'pending';
  currentPeriodQuotaUsed: number;
  bloodType?: string;
  credentialHash?: string;
  locality?: string;
  neighborhood?: string;
  cuil?: string;
  firstName?: string;
  lastName?: string;
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

/**
 * Availability schedule entry: a day of the week with its associated time slots.
 * day follows JS Date.getDay() convention: 0 = Sunday … 6 = Saturday.
 */
export interface DaySchedule {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  slots: string[]; // e.g. ['09:00', '10:00']
}

/** Professional title shown before a doctor's name. DB: profiles.professional_title. */
export type ProfessionalTitle = 'Dr.' | 'Dra.';

export interface Doctor extends User {
  role: 'doctor';
  professionalTitle?: ProfessionalTitle;
  specialty: string;
  rating: number; // Deprecated in favor of metrics.starRating but kept for compatibility
  reviewCount: number;
  isVerified: boolean;
  availability: DaySchedule[];
  licenseNumber?: string;
  provincialLicense?: string;
  cuit?: string;
  phone?: string;
  notifyNewAppointmentWhatsapp?: boolean;
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
  /** The doctor's professional title; absent reads as "Dr.". */
  doctorTitle?: ProfessionalTitle;
  date: string;
  time: string;
  /** Exact ISO instant of the appointment (date/time above are display strings). */
  scheduledAt?: string;
  /** Attended family member; absent = the titular (patientId). */
  familyMemberId?: string;
  familyMemberName?: string;
  familyMemberRelation?: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
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
  /** Person attended; absent = the titular (patientId). */
  familyMemberId?: string;
  /** Filled when reading a patient's history, so the chart can say whose record it is. */
  familyMemberName?: string;
  familyMemberRelation?: string;
  doctorId?: string;
  date: string;
  diagnosis: string;
  notes: string;
  doctorName: string;
  /** The doctor's professional title; absent reads as "Dr.". */
  doctorTitle?: ProfessionalTitle;
  type: 'consultation' | 'emergency' | 'checkup';
  attachments?: string[];
}

export interface Prescription {
  id: string;
  appointmentId?: string;
  patientId: string;
  /** Person attended; absent = the titular (patientId). */
  familyMemberId?: string;
  doctorId?: string;
  doctorName: string;
  /** The doctor's professional title; absent reads as "Dr.". */
  doctorTitle?: ProfessionalTitle;
  medications: {
    name: string;
    instructions: string;
    quantity: number;
    /** Catalog product (pharmacy_products.id) the doctor picked; absent for free-text medications. */
    productId?: string;
  }[];
  date: string;
  status: 'active' | 'dispensed' | 'expired';
  digitalSignature: string; // PRD 3.4
  signaturePublicKey?: string;
  expirationDate: string;
  pdfUrl?: string;
  externalPrescriptionUrl?: string;
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
  isUnlimited: boolean;
  maxFamilyMembers: number;
  isDefault: boolean;
  /** Billed duration in months. Total price = monthlyCost × paidMonths. DB CHECK: >= 1. */
  paidMonths: number;
  /** Free promo duration in months, added on top of paidMonths. DB CHECK: >= 0. */
  bonusMonths: number;
  /** Sellable kind. DB column plan_kind. */
  planKind?: 'individual' | 'familiar' | null;
  /** Payment option this plan row represents (standard, card_debit, prepaid_6, prepaid_12). */
  paymentOption?: 'standard' | 'card_debit' | 'prepaid_6' | 'prepaid_12' | null;
  /** True when this row is sellable to new sign-ups right now. */
  isOffered?: boolean;
  /** Fixed advisor commission paid per sale of this plan. */
  advisorCommissionAmount?: number;
  /** Pharmacy discount (%) for affiliates on this plan, 0-100. 0 = no discount. */
  pharmacyDiscountPercent?: number;
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
  entityType: 'affiliate' | 'agreement' | 'producer';
  entityId: string;
  period: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxDetails?: Record<string, any>;
  status: 'draft' | 'issued' | 'paid' | 'void';
  pdfUrl?: string;
  createdAt: string;
  invoiceNumber?: number;
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
  purchasePrice?: number;
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

export type StockAdjustmentReason =
  | 'physical_count'
  | 'breakage'
  | 'loss'
  | 'expired'
  | 'correction'
  | 'other';

export interface PharmacyStockAdjustment {
  id: string;
  inventoryId: string;
  productId: string;
  batchNumber: string;
  userId?: string | null;
  reason: StockAdjustmentReason;
  previousQuantity: number;
  newQuantity: number;
  quantityDelta: number;
  notes?: string | null;
  createdAt: string;
}

export interface AdjustBatchStockPayload {
  inventoryId: string;
  newQuantity: number;
  reason: StockAdjustmentReason;
  notes?: string;
  userId?: string;
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
  latitude: number;
  longitude: number;
  radiusMeters: number;
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

/**
 * `affiliate_payment_subscriptions` lifecycle status (sdd/mercadopago-integration
 * design D-D). One-way per `mpPreapprovalId`: pending -> authorized ->
 * cancelled (terminal); authorized <-> payment_failed is the only
 * oscillation. No `paused` state (Resolved Decision #7) — an MP-side pause
 * is recorded as `cancelled`.
 */
export type PaymentSubscriptionStatus = 'pending' | 'authorized' | 'payment_failed' | 'cancelled';

export interface PaymentSubscription {
  id: string;
  profileId: string | null;
  adhesionRequestId: string | null;
  mpPreapprovalId: string | null;
  status: PaymentSubscriptionStatus;
  statusChangedAt: string | null;
  discountedMonthlyCost: number | null;
  discountThroughPeriod: string | null; // 'YYYY-MM'
  lastFailureAt: string | null;
  failureCount: number;
  billingDay?: number;
  createdAt: string;
  updatedAt: string;
  /** Only populated by queries that embed a `profiles` join (e.g. getFailedDebits). */
  profileName?: string;
  profileEmail?: string;
}

/**
 * `runDeferredReconciliation`'s return shape (sdd/mercadopago-integration
 * design-appendix D-H), surfaced verbatim by `POST /api/payments/reconcile-deferred`.
 * Consumed by `OCCBilling.tsx`'s chained cycle+sweep alert.
 */
export interface ReconciliationSummary {
  resolved: number;
  stillPending: number;
  needsAdmin: number;
  fetchFailures: number;
  linked: number;
  cancelledAtMp: number;
  reservationsReleased: number;
  chargesRecovered: number;
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
// ── Advisor commissions (S2/S3) ─────────────────────────────────────────────
export type CommissionStatus = 'generated' | 'retained' | 'approved' | 'excluded' | 'paid';
export type LiquidationStatus = 'draft' | 'approved' | 'paid';

/** Per advisor: generated (not approved yet), retained (debit rejected), approved to collect, collected. */
export interface CommissionSummary {
  advisorId: string;
  advisorName: string;
  generatedAmount: number;
  generatedCount: number;
  retainedAmount: number;
  retainedCount: number;
  toCollectAmount: number;
  toCollectCount: number;
  collectedAmount: number;
  collectedCount: number;
}

/** One commission (one confirmed sale). */
export interface CommissionLine {
  id: string;
  advisorId: string;
  advisorName: string;
  affiliateName: string | null;
  planName: string | null;
  amount: number;
  confirmedAt: string;
  status: CommissionStatus;
  exclusionReason: string | null;
  retainedReason: string | null;
  liquidationId: string | null;
}

/** Monthly liquidation of one advisor. `month` is the first day (YYYY-MM-01). */
export interface CommissionLiquidation {
  id: string;
  advisorId: string;
  month: string;
  status: LiquidationStatus;
  totalAmount: number;
  retainedAmount: number;
  retainedCount: number;
  approvedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
}

export interface CommissionGenerationResult {
  advisors: number;
  commissionsAttached: number;
  retainedCount: number;
  totalAmount: number;
}

/** An affiliate cancellation ("Dar de baja"): billing stops at once; the login is blocked once applied. */
export interface AffiliateCancellation {
  effectiveAt: string;
  appliedAt: string | null;
}
