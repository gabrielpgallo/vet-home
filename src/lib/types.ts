import type { RxItem } from "./domain";
export interface Tutor {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
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
  startsAt: string;
  durationMinutes: number;
  address: string;
  baseCents: number;
  status: "scheduled" | "completed" | "cancelled";
  totalCents: number;
  receivedCents: number;
}
export interface VisitPatient {
  visitId: string;
  patientId: string;
  reason: string;
}
export interface Consultation {
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
  id: string;
  consultationId: string;
  items: RxItem[];
  instructions: string;
  status: "draft";
  createdAt: string;
}
export interface Exam {
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
  id: string;
  visitId: string;
  amountCents: number;
  method: string;
  createdAt: string;
}
export interface Bootstrap {
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
