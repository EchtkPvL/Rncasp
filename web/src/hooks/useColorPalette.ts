import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";

// Maps DB palette keys to CSS custom property names
const CSS_VAR_MAP: Record<string, string[]> = {
  primary: ["--color-primary"],
  primaryDark: ["--color-primary-dark"],
  surface: ["--color-background"],
  surfaceAlt: ["--color-surface-alt"],
  textPrimary: ["--color-foreground"],
  textSecondary: ["--color-muted-foreground"],
  textOnPrimary: ["--color-primary-foreground"],
  textOnDark: ["--color-text-on-dark", "--color-text-on-color"],
  border: ["--color-border"],
  error: ["--color-destructive"],
  warning: ["--color-warning"],
  success: ["--color-success"],
  info: ["--color-info"],
  navBackground: ["--color-nav-background"],
  navText: ["--color-nav-text"],
  buttonPrimary: ["--color-button-primary"],
  buttonSecondary: ["--color-button-secondary"],
};

// Derive light/foreground/border variants from a hex color
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function deriveSemantic(root: HTMLElement, cssBase: string, hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const [r, g, b] = rgb;
  const lum = luminance(r, g, b);
  // Light variant: 10% opacity over white
  const lr = Math.round(255 - 0.1 * (255 - r));
  const lg = Math.round(255 - 0.1 * (255 - g));
  const lb = Math.round(255 - 0.1 * (255 - b));
  root.style.setProperty(`${cssBase}-light`, `rgb(${lr}, ${lg}, ${lb})`);
  // Border variant: 40% opacity over white
  const br = Math.round(255 - 0.4 * (255 - r));
  const bg2 = Math.round(255 - 0.4 * (255 - g));
  const bb = Math.round(255 - 0.4 * (255 - b));
  root.style.setProperty(`${cssBase}-border`, `rgb(${br}, ${bg2}, ${bb})`);
  // Foreground: dark text for light colors, white for dark
  root.style.setProperty(`${cssBase}-foreground`, lum > 0.5 ? "#1a1a1a" : "#ffffff");
}

export function useColorPalette() {
  const { data: settings } = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => {
      const res = await adminApi.getPublicSettings();
      return res.data!;
    },
    staleTime: 5 * 60 * 1000,
  });

  const palette = settings?.find((s) => s.key === "color_palette")?.value as
    | Record<string, string>
    | undefined;

  useEffect(() => {
    if (!palette || typeof palette !== "object") return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(palette)) {
      const cssVars = CSS_VAR_MAP[key];
      if (cssVars && typeof value === "string") {
        for (const cssVar of cssVars) {
          root.style.setProperty(cssVar, value);
        }
        // Derive semantic variants for status colors
        if (key === "error") deriveSemantic(root, "--color-destructive", value);
        if (key === "warning") deriveSemantic(root, "--color-warning", value);
        if (key === "success") deriveSemantic(root, "--color-success", value);
        if (key === "info") deriveSemantic(root, "--color-info", value);
      }
    }
    // Derive nav overlay colors from navText
    const navText = palette.navText as string | undefined;
    if (navText) {
      const rgb = hexToRgb(navText);
      if (rgb) {
        const [r, g, b] = rgb;
        root.style.setProperty("--color-nav-hover", `rgba(${r}, ${g}, ${b}, 0.1)`);
        root.style.setProperty("--color-nav-active", `rgba(${r}, ${g}, ${b}, 0.2)`);
        root.style.setProperty("--color-nav-border", `rgba(${r}, ${g}, ${b}, 0.1)`);
      }
    }
  }, [palette]);
}
