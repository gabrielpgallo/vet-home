import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizeLogo } from "../src/server/settings";
import { settingsSchema } from "../src/lib/settings";
describe("configurações da clínica", () => {
  it("valida os dados obrigatórios e a revisão de edição", () => {
    expect(
      settingsSchema.safeParse({
        companyName: " ",
        veterinarianName: "Isabelli Ricordi",
        crmv: "CRMV-SP 53.181",
        revision: 0,
      }).success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({
        companyName: "IR Saúde Animal",
        veterinarianName: "Isabelli Ricordi",
        crmv: "CRMV-SP 53.181",
        revision: -1,
      }).success,
    ).toBe(false);
  });
  it("normaliza o logo preservando sua proporção", async () => {
    const input = await sharp({
      create: { width: 1200, height: 600, channels: 3, background: "#245bdb" },
    })
      .jpeg()
      .toBuffer();
    const output = await normalizeLogo(input);
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(300);
  });
  it("rejeita arquivo disfarçado, SVG e excesso de tamanho", async () => {
    await expect(
      normalizeLogo(Buffer.from("arquivo não é PNG")),
    ).rejects.toThrow();
    await expect(
      normalizeLogo(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        ),
      ),
    ).rejects.toThrow();
    await expect(
      normalizeLogo(Buffer.alloc(2 * 1024 * 1024 + 1)),
    ).rejects.toThrow();
  });
});
