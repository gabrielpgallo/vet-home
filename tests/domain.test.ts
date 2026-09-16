import { describe, it, expect } from "vitest";
import {
  parseFixed,
  applicationTotal,
  commandSchema,
  dateKey,
} from "../src/lib/domain";
describe("quantidades e valores monetários", () => {
  it("converte decimais sem erro de ponto flutuante", () => {
    expect(parseFixed("0,29")).toBe(29);
    expect(parseFixed("2,125", 3)).toBe(2125);
    expect(applicationTotal(2500, 1200)).toBe(3000);
    expect(applicationTotal(125, 1250)).toBe(156);
    expect(applicationTotal(500, 1)).toBe(1);
  });
  it("rejeita quantidades negativas, precisão extra e preços inválidos", () => {
    for (const v of ["-1", "1.000,00", "NaN", "Infinity", "0,001"])
      expect(() => parseFixed(v)).toThrow();
    expect(() => applicationTotal(0, 10)).toThrow();
    expect(() => applicationTotal(1, -1)).toThrow();
  });
  it("usa o dia de Brasília e rejeita datas inexistentes", () => {
    expect(dateKey("2026-09-17T01:00:00Z")).toBe("2026-09-16");
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(
      commandSchema.safeParse({
        type: "visit.create",
        tutorId: uuid,
        patientIds: [uuid],
        date: "2026-02-30",
        time: "09:00",
        duration: 60,
        address: "Rua A",
        baseCents: 100,
        reason: "",
      }).success,
    ).toBe(false);
  });
});
