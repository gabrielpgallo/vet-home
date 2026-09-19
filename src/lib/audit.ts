import { historicalVitalFields } from "./domain";

export const auditEntities = {
  tutors: "Tutores",
  patients: "Pacientes",
  visits: "Agenda",
  visit_patients: "Pacientes da visita",
  consultations: "Atendimentos",
  applications: "Aplicações",
  prescriptions: "Receitas",
  exams: "Exames",
  exam_links: "Vínculos de exames",
  attachments: "Anexos",
  timeline: "Notas do paciente",
  products: "Produtos",
  payments: "Recebimentos",
  expenses: "Despesas",
  practice_settings: "Configurações",
} as const;
export const auditOperations = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
} as const;
export type AuditEntry = {
  id: string;
  created_at: string;
  actor: string;
  entity_type: keyof typeof auditEntities;
  entity_id: string;
  operation: keyof typeof auditOperations;
  changed_fields: string[];
  label: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
};
export const auditFields: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  email: "E-mail",
  address: "Endereço",
  document: "Documento",
  tutor_id: "Tutor (ID)",
  patient_id: "Paciente (ID)",
  visit_id: "Visita (ID)",
  consultation_id: "Atendimento (ID)",
  product_id: "Produto (ID)",
  exam_id: "Exame (ID)",
  attachment_id: "Anexo (ID)",
  request_id: "Solicitação (ID)",
  species: "Espécie",
  breed: "Raça",
  sex: "Sexo",
  birth_date: "Nascimento",
  notes: "Anotações / anamnese",
  starts_at: "Horário da visita",
  duration_minutes: "Duração (minutos)",
  base_cents: "Valor da visita",
  status: "Status",
  reason: "Queixa",
  vitals: "Medições",
  unit: "Unidade",
  cost_cents: "Custo",
  sale_cents: "Preço de venda",
  active: "Ativo",
  product_name: "Produto",
  quantity_milli: "Quantidade",
  unit_cost_cents: "Custo por unidade",
  unit_sale_cents: "Venda por unidade",
  total_cents: "Total",
  batch: "Lote",
  route: "Via de aplicação",
  items: "Itens",
  instructions: "Orientações",
  mime: "Formato",
  size: "Tamanho (bytes)",
  kind: "Tipo",
  mode: "Modalidade",
  partner: "Parceiro",
  occurred_on: "Data",
  occurred_at: "Data e hora",
  amount_cents: "Valor",
  method: "Forma de pagamento",
  description: "Descrição",
  category: "Categoria",
  paid_on: "Data de pagamento",
  title: "Título",
  text: "Texto",
  company_name: "Clínica",
  veterinarian_name: "Veterinária(o)",
  veterinarian_title: "Tratamento",
  crmv: "CRMV",
  sipeagro: "Registro SIPEAGRO",
  cnpj: "CNPJ",
  veterinarian_cpf: "CPF da(o) veterinária(o)",
  primary_color: "Cor primária",
};
export function auditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number" && field.endsWith("_cents"))
    return (value / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  if (field === "quantity_milli" && typeof value === "number")
    return (value / 1000).toLocaleString("pt-BR");
  if (
    field === "vitals" &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const measurements = Object.entries(value)
      .filter(
        ([, measurement]) =>
          measurement !== null &&
          measurement !== undefined &&
          String(measurement).trim() !== "",
      )
      .map(([key, measurement]) => {
        const definition = historicalVitalFields.find(([name]) => name === key);
        const label = definition?.[1] || key;
        const unit = definition?.[2];
        const text = String(measurement).trim();
        const formatted = /^-?\d+(\.\d+)?$/.test(text)
          ? text.replace(".", ",")
          : text;
        return `${label}: ${formatted}${unit ? " " + unit : ""}`;
      });
    return measurements.join("\n") || "—";
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const labels: Record<string, string> = {
    scheduled: "Agendada",
    completed: "Concluído",
    cancelled: "Cancelada",
    draft: "Rascunho / em atendimento",
    active: "Ativo",
    voided: "Cancelado",
    order: "Solicitação",
    result: "Resultado",
  };
  return field === "status" || field === "kind"
    ? labels[String(value)] || String(value)
    : String(value);
}
