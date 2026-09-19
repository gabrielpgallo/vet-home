import { it, expect } from "vitest";
import {
  cpfSchema,
  cnpjSchema,
  documentSchema,
  phoneSchema,
  crmvSchema,
  sipeagroSchema,
  formatInput,
  formatOnBlur,
  maskedEdit,
  maskError,
  phoneMatches,
} from "../src/lib/input-formats";
import { tutorSchema } from "../src/lib/domain";
it("normalizes and checks CPF/CNPJ including alphanumeric CNPJ", () => {
  expect(cpfSchema.parse(" 111.444.777-35 ")).toBe("11144477735");
  expect(cnpjSchema.parse("11.222.333/0001-81")).toBe("11222333000181");
  expect(cnpjSchema.parse("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  for (const v of [
    "00000000000",
    "11144477734",
    "111444777",
    "111444777350",
    "abc11144477735",
  ])
    expect(cpfSchema.safeParse(v).success).toBe(false);
  for (const v of ["00000000000000", "11222333000182", "12ABC34501DE34"])
    expect(cnpjSchema.safeParse(v).success).toBe(false);
  expect(documentSchema.parse("111.444.777-35")).toBe("11144477735");
  expect(documentSchema.parse("12.ABC.345/01DE-35")).toBe("12ABC34501DE35");
  expect(cpfSchema.parse("")).toBe("");
});
it("normalizes Brazilian phones with optional country code without guessing a DDD", () => {
  for (const v of ["(11) 99999-0101", "+55 (11) 99999-0101", "5511999990101"])
    expect(phoneSchema.parse(v)).toBe("11999990101");
  expect(phoneSchema.parse("(11) 3333-2222")).toBe("1133332222");
  for (const v of [
    "999990101",
    "011999990101",
    "abc11999990101",
    "+1 202 555 0100",
    "119999901012",
  ])
    expect(phoneSchema.safeParse(v).success).toBe(false);
  expect(phoneMatches("11999990101", "(11) 99999")).toBe(true);
});
it("formats incomplete typing, pasted values and punctuation deletion without truncation", () => {
  expect(formatInput("cpf", "11144477735")).toBe("111.444.777-35");
  expect(formatInput("cpf", "1114")).toBe("111.4");
  expect(formatInput("document", "11222333000181")).toBe("11.222.333/0001-81");
  expect(formatInput("cnpj", "12abc34501de35")).toBe("12.ABC.345/01DE-35");
  expect(formatInput("phone", "1133332222")).toBe("(11) 3333-2222");
  expect(formatInput("phone", "11999990101")).toBe("(11) 99999-0101");
  expect(formatInput("cpf", "111444777350").replace(/\D/g, "")).toBe(
    "111444777350",
  );
  expect(
    maskedEdit("cpf", "111.4", "1114", 3, "deleteContentBackward"),
  ).toEqual({ value: "114", caret: 2 });
  expect(formatOnBlur("money", "25")).toBe("25,00");
  expect(formatInput("money", "R$ 1.234,56")).toBe("1234,56");
  expect(formatInput("money", "25.50")).toBe("25,50");
  expect(formatInput("money", "-25")).toBe("-25");
  expect(maskError("money", "-25")).not.toBe("");
  expect(maskError("money", "25,999")).not.toBe("");
});
it("normalizes professional registers without changing the registered number", () => {
  expect(crmvSchema.parse("crmv-sp 53.181")).toBe("CRMV-SP 53181");
  expect(crmvSchema.parse("sp-12345-vp")).toBe("CRMV-SP 12345-VP");
  expect(crmvSchema.safeParse("12345").success).toBe(false);
  expect(crmvSchema.safeParse("CRMV-ZZ 12345").success).toBe(false);
  expect(sipeagroSchema.parse("mv00000000001")).toBe("MV00000000001");
  expect(sipeagroSchema.parse("000123/sp")).toBe("000123/SP");
  expect(sipeagroSchema.parse("00001212/2016")).toBe("00001212/2016");
  expect(sipeagroSchema.safeParse("MV123").success).toBe(false);
});
it("validates raw API input independently of the input masks", () => {
  const data = {
    name: "Teste",
    phone: "+55 (11) 99999-0101",
    email: "",
    address: "Rua Teste",
    document: "111.444.777-35",
  };
  expect(tutorSchema.parse(data)).toMatchObject({
    phone: "11999990101",
    document: "11144477735",
  });
  expect(
    tutorSchema.safeParse({ ...data, document: "11144477734" }).success,
  ).toBe(false);
});
