export const roles = ["admin", "veterinarian", "assistant"] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  admin: "Administradora",
  veterinarian: "Veterinária",
  assistant: "Assistente",
};
export const permissions = [
  "agenda.write",
  "registry.write",
  "clinical.read",
  "clinical.write",
  "products.write",
  "payments.write",
  "finance.read",
  "finance.write",
  "settings.write",
  "profile.write",
  "iam.manage",
  "audit.read",
] as const;
export type Permission = (typeof permissions)[number];
const grants: Record<Role, readonly Permission[]> = {
  admin: permissions,
  veterinarian: [
    "profile.write",
    "agenda.write",
    "registry.write",
    "clinical.read",
    "clinical.write",
    "payments.write",
  ],
  assistant: ["agenda.write", "registry.write", "payments.write"],
};
export const can = (role: Role, permission: Permission) =>
  grants[role]?.includes(permission) ?? false;
export function commandPermission(type: string): Permission | null {
  const prefix = type.split(".")[0];
  return (
    (
      {
        tutor: "registry.write",
        patient: "registry.write",
        product: "products.write",
        visit: "agenda.write",
        consultation: "clinical.write",
        application: "clinical.write",
        prescription: "clinical.write",
        exam: "clinical.write",
        note: "clinical.write",
        payment: "payments.write",
        expense: "finance.write",
      } as Record<string, Permission>
    )[prefix] || null
  );
}
export interface Identity {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  role: Role;
  local: boolean;
  isVeterinarian?: boolean;
  sessionId?: string;
  sessionFresh?: boolean;
}

export const isVeterinarian = (actor?: Identity) =>
  Boolean(
    actor &&
      (actor.role === "veterinarian" ||
        (actor.role === "admin" && actor.isVeterinarian)),
  );
