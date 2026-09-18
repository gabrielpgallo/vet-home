import { expect, it } from "vitest";
import {
  brandPalette,
  brandThemeStyle,
  contrastRatio,
  DEFAULT_PRIMARY_COLOR,
} from "../src/lib/brand-color";
import { defaultSettings, settingsSchema } from "../src/lib/settings";

it("normaliza hexadecimal completo e rejeita valores inválidos", () => {
  const { hasLogo, hasGeminiKey, ...settings } = defaultSettings;
  void hasLogo;
  void hasGeminiKey;
  expect(
    settingsSchema.parse({ ...settings, primaryColor: " #AC27EF " })
      .primaryColor,
  ).toBe("#ac27ef");
});
it("rejeita cores incompletas, transparência e conteúdo CSS", () => {
  const { hasLogo, hasGeminiKey, ...settings } = defaultSettings;
  void hasLogo;
  void hasGeminiKey;
  for (const color of [
    "red",
    "#123",
    "#12345678",
    "#zzzzzz",
    "",
    "var(--text)",
    "#ffffff; color:red",
  ])
    expect(
      settingsSchema.safeParse({ ...settings, primaryColor: color }).success,
    ).toBe(false);
  expect(brandPalette("invalid").fill).toBe(DEFAULT_PRIMARY_COLOR);
});
it("mantém a cor escolhida nos botões e contraste de texto em ambos os temas", () => {
  const colors = [
    "#ffffff",
    "#000000",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#ff00ff",
    "#ff0000",
    "#777777",
    "#245bdb",
    "#148a83",
  ];
  for (const mode of ["light", "dark"] as const) {
    for (const color of colors) {
      const palette = brandPalette(color, mode);
      expect(palette.fill).toBe(color);
      expect(
        contrastRatio(palette.fill, palette.onPrimary),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.hover, palette.onPrimary),
      ).toBeGreaterThanOrEqual(4.5);
      for (const bg of [
        palette.surface,
        palette.accent,
        mode === "dark" ? "#101723" : "#f5f7fb",
        mode === "dark" ? "#202d3e" : "#f0f4fa",
      ])
        expect(contrastRatio(palette.primary, bg)).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(brandThemeStyle("#148a83")).not.toEqual(
    brandThemeStyle(DEFAULT_PRIMARY_COLOR),
  );
});
