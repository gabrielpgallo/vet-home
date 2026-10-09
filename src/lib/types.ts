import type { RxItem } from "./domain";
export interface Tutor {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  addressDetails?: import("./address").TutorAddress | null;
  document?: string;
}
export interface Patient {
  id: string;
  tutorId: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  birthDate: string | null;
  notes: string;
}
export interface Visit {
  id: string;
  tutorId: string;
  startsAt: string | null;
  origin?: "scheduled" | "direct";
  performedOn?: string | null;
  revision?: number;
  durationMinutes: number;
  address: string;
  baseCents: number;
  status: "draft" | "scheduled" | "completed" | "cancelled";
  totalCents: number;
  receivedCents: number;
}
export interface VisitPatient {
  visitId: string;
  patientId: string;
  reason: string;
}
export interface Consultation {
  occurredOn?: string | null;
  occurredTime?: string | null;
  correctedAt?: string | null;
  correctedBy?: string | null;
  id: string;
  visitId: string;
  patientId: string;
  notes: string;
  vitals: Record<string, string>;
  status: "draft" | "completed";
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Product {
  id: string;
  name: string;
  unit: "mL" | "dose" | "unidade" | "comprimido" | "g";
  costCents: number;
  saleCents: number;
  active: boolean;
}
export interface Application {
  revision?: number;
  status?: "active" | "voided";
  id: string;
  consultationId: string;
  productId: string;
  productName: string;
  unit: string;
  quantityMilli: number;
  unitCostCents: number;
  unitSaleCents: number;
  totalCents: number;
  batch: string;
  route: string;
  createdAt: string;
}
export interface Prescription {
  replacesId?: string | null;
  recordStatus?: "active" | "replaced" | "voided";
  prescriberId?: string | null;
  prescriber?: Omit<
    import("./professional-profile").ProfessionalProfile,
    "revision"
  > | null;
  signedAt?: string | null;
  id: string;
  consultationId: string;
  items: RxItem[];
  instructions: string;
  status: "draft";
  createdAt: string;
}
export interface Exam {
  replacesId?: string | null;
  recordStatus?: "active" | "replaced" | "voided";
  id: string;
  patientId: string;
  consultationId: string | null;
  requestId: string | null;
  kind: "order" | "result";
  name: string;
  mode: string;
  partner: string;
  notes: string;
  attachmentId: string | null;
  occurredOn: string;
  createdAt: string;
}
export interface ExamLink {
  examId: string;
  consultationId: string;
}
export interface TimelineEvent {
  id: string;
  patientId: string;
  consultationId: string | null;
  type:
    | "consultation"
    | "application"
    | "prescription"
    | "exam_order"
    | "exam_result"
    | "note";
  entityId: string | null;
  title: string;
  text: string;
  occurredAt: string;
}
export interface Payment {
  paidOn?: string;
  status?: "active" | "voided";
  replacesId?: string | null;
  id: string;
  visitId: string;
  amountCents: number;
  method: string;
  createdAt: string;
}
export interface Expense {
  id: string;
  visitId: string | null;
  description: string;
  category: (typeof import("./finance-schema").expenseCategories)[number];
  amountCents: number;
  occurredOn: string;
  paidOn: string | null;
  notes: string;
  revision: number;
  status: "active" | "voided";
  createdAt: string;
}
export interface Bootstrap {
  professionalProfile?:
    | import("./professional-profile").ProfessionalProfile
    | null;
  identity?: import("./permissions").Identity;
  expenses: Expense[];
  settings: import("./settings").PracticeSettings;
  payments: Payment[];
  tutors: Tutor[];
  patients: Patient[];
  visits: Visit[];
  visitPatients: VisitPatient[];
  consultations: Consultation[];
  products: Product[];
  applications: Application[];
  prescriptions: Prescription[];
  exams: Exam[];
  examLinks: ExamLink[];
  timeline: TimelineEvent[];
}
