import type { CSSProperties } from "react";

export const DEFAULT_PRIMARY_COLOR = "#245bdb";
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function channels(color: string) {
  return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
}
function mix(color: string, target: string, amount: number) {
  const a = channels(color),
    b = channels(target);
  return (
    "#" +
    a
      .map((value, i) =>
        Math.round(value + (b[i] - value) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function luminance(color: string) {
  const [r, g, b] = channels(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string) {
  const l1 = luminance(a),
    l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Preserve the chosen color on filled controls; adapt text to each background. */
export function brandPalette(input: string, mode: "light" | "dark" = "light") {
  const fill = HEX_COLOR.test(input)
    ? input.toLowerCase()
    : DEFAULT_PRIMARY_COLOR;
  const dark = mode === "dark";
  const surface = dark ? "#182230" : "#ffffff";
  const accent = mix(surface, fill, 0.1);
  const backgrounds = [
    surface,
    accent,
    dark ? "#101723" : "#f5f7fb",
    dark ? "#202d3e" : "#f0f4fa",
  ];
  let primary = fill;
  for (let step = 0; step <= 100; step++) {
    primary = mix(fill, dark ? "#ffffff" : "#000000", step / 100);
    if (
      backgrounds.every(
        (background) => contrastRatio(primary, background) >= 4.5,
      )
    )
      break;
  }
  const onPrimary =
    contrastRatio(fill, "#ffffff") >= 4.5 ? "#ffffff" : "#000000";
  const hover = mix(
    fill,
    onPrimary === "#ffffff" ? "#000000" : "#ffffff",
    0.12,
  );
  return { fill, primary, hover, accent, onPrimary, surface };
}

export function brandThemeStyle(color: string): CSSProperties {
  const light = brandPalette(color),
    dark = brandPalette(color, "dark");
  return {
    "--clinic-primary-light": light.primary,
    "--clinic-primary-dark": dark.primary,
    "--clinic-accent-light": light.accent,
    "--clinic-accent-dark": dark.accent,
    "--clinic-fill": light.fill,
    "--clinic-hover": light.hover,
    "--clinic-onprimary": light.onPrimary,
  } as CSSProperties;
}
