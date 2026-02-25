import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppSettings, useUpdateSetting } from "@/hooks/useAdmin";

interface ColorPalette {
  primary: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;
  textOnDark: string;
  border: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  navBackground: string;
  navText: string;
}

const DEFAULT_PALETTE: ColorPalette = {
  primary: "#e26729",
  background: "#f4f4f4",
  surface: "#f4f4f4",
  surfaceAlt: "#efefef",
  textPrimary: "#000000",
  textSecondary: "#818181",
  textOnPrimary: "#ffffff",
  textOnDark: "#ffffff",
  border: "#cccccc",
  error: "#b20101",
  warning: "#FAE55F",
  success: "#2d8a4e",
  info: "#5bbad5",
  navBackground: "#303030",
  navText: "#ffffff",
};

const PALETTE_KEYS: Record<keyof ColorPalette, string> = {
  primary: "admin:palette.primary",
  background: "admin:palette.background",
  surface: "admin:palette.surface",
  surfaceAlt: "admin:palette.surface_alt",
  textPrimary: "admin:palette.text_primary",
  textSecondary: "admin:palette.text_secondary",
  textOnPrimary: "admin:palette.text_on_primary",
  textOnDark: "admin:palette.text_on_dark",
  border: "admin:palette.border",
  error: "admin:palette.error",
  warning: "admin:palette.warning",
  success: "admin:palette.success",
  info: "admin:palette.info",
  navBackground: "admin:palette.nav_background",
  navText: "admin:palette.nav_text",
};

export function AppSettingsPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { data: settings, isLoading } = useAppSettings();
  const updateSetting = useUpdateSetting();

  // Local state for settings
  const [appName, setAppName] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [palette, setPalette] = useState<ColorPalette | null>(null);

  // Parse settings from API into local state
  useEffect(() => {
    if (!settings) return;
    for (const setting of settings) {
      switch (setting.key) {
        case "app_name":
          setAppName(setting.value as string);
          break;
        case "registration_enabled":
          setRegistrationEnabled(setting.value as boolean);
          break;
        case "default_language":
          setDefaultLanguage(setting.value as string);
          break;
        case "color_palette":
          setPalette(setting.value as ColorPalette);
          break;
      }
    }
  }, [settings]);

  function handleSaveName() {
    updateSetting.mutate({ key: "app_name", value: appName });
  }

  function handleToggleRegistration() {
    const newValue = !registrationEnabled;
    setRegistrationEnabled(newValue);
    updateSetting.mutate({ key: "registration_enabled", value: newValue });
  }

  function handleLanguageChange(lang: string) {
    setDefaultLanguage(lang);
    updateSetting.mutate({ key: "default_language", value: lang });
  }

  function handlePaletteColorChange(key: keyof ColorPalette, value: string) {
    if (!palette) return;
    setPalette({ ...palette, [key]: value });
  }

  function handleSavePalette() {
    if (!palette) return;
    updateSetting.mutate({ key: "color_palette", value: palette });
  }

  function handleResetPalette() {
    setPalette({ ...DEFAULT_PALETTE });
  }

  if (isLoading) {
    return <p className="text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{t("admin:settings.title")}</h1>

      {/* App Name */}
      <section className="mt-6 rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("admin:settings.app_name")}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t("admin:settings.app_name_description")}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
          <button
            onClick={handleSaveName}
            disabled={updateSetting.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
          >
            {t("common:save")}
          </button>
        </div>
      </section>

      {/* Registration Toggle */}
      <section className="mt-4 rounded-lg border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("admin:settings.registration")}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {t("admin:settings.registration_description")}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {registrationEnabled
                ? t("admin:settings.registration_on")
                : t("admin:settings.registration_off")}
            </p>
          </div>
          <button
            onClick={handleToggleRegistration}
            disabled={updateSetting.isPending}
            className={`touch-compact relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              registrationEnabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-muted)]"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                registrationEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Default Language */}
      <section className="mt-4 rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("admin:settings.default_language")}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t("admin:settings.default_language_description")}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => handleLanguageChange("en")}
            className={`rounded-md px-4 py-2 text-sm ${
              defaultLanguage === "en"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "bg-[var(--color-muted)] text-[var(--color-foreground)]"
            }`}
          >
            English
          </button>
          <button
            onClick={() => handleLanguageChange("de")}
            className={`rounded-md px-4 py-2 text-sm ${
              defaultLanguage === "de"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "bg-[var(--color-muted)] text-[var(--color-foreground)]"
            }`}
          >
            Deutsch
          </button>
        </div>
      </section>

      {/* Color Palette Editor */}
      {palette && (
        <section className="mt-4 rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("admin:settings.color_palette")}</h2>
            <div className="flex gap-2">
              <button
                onClick={handleResetPalette}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
              >
                {t("admin:settings.reset_palette")}
              </button>
              <button
                onClick={handleSavePalette}
                disabled={updateSetting.isPending}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
              >
                {t("common:save")}
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(Object.keys(PALETTE_KEYS) as (keyof ColorPalette)[]).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(e) => handlePaletteColorChange(key, e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-[var(--color-border)]"
                />
                <div>
                  <div className="text-xs font-medium">{t(PALETTE_KEYS[key])}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{palette[key]}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Live Preview */}
          <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3">
            <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-3">
              {t("admin:settings.preview", "Preview")}
            </div>

            {/* Nav preview */}
            <div
              className="flex items-center justify-between rounded-t-md px-4 py-2"
              style={{ backgroundColor: palette.navBackground }}
            >
              <span className="text-sm font-semibold" style={{ color: palette.navText }}>
                {appName || "App"}
              </span>
              <div className="flex gap-2">
                <span className="text-xs" style={{ color: palette.navText, opacity: 0.7 }}>
                  {t("common:nav.dashboard")}
                </span>
                <span className="text-xs" style={{ color: palette.navText, opacity: 0.7 }}>
                  {t("common:nav.events")}
                </span>
              </div>
            </div>

            {/* Body preview */}
            <div
              className="rounded-b-md px-4 py-3 space-y-3"
              style={{ backgroundColor: palette.background }}
            >
              <div className="text-sm font-bold" style={{ color: palette.textPrimary }}>
                {t("admin:palette.preview_title")}
              </div>
              <div className="text-xs" style={{ color: palette.textSecondary }}>
                {t("admin:palette.preview_secondary")}
              </div>

              {/* Card preview */}
              <div
                className="rounded-md p-3"
                style={{ backgroundColor: palette.surface, border: `1px solid ${palette.border}` }}
              >
                <div className="text-xs font-medium" style={{ color: palette.textPrimary }}>
                  {t("admin:palette.preview_card_title")}
                </div>
                <div className="mt-1 text-xs" style={{ color: palette.textSecondary }}>
                  {t("admin:palette.preview_card_content")}
                </div>
              </div>

              {/* Buttons preview */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: palette.primary, color: palette.textOnPrimary }}
                >
                  {t("admin:palette.primary")}
                </button>
                <button
                  type="button"
                  className="rounded-md px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: palette.textSecondary, color: palette.textOnDark }}
                >
                  {t("admin:palette.preview_secondary_btn")}
                </button>
              </div>

              {/* Status colors */}
              <div className="flex gap-2 text-xs">
                <span className="rounded px-2 py-0.5" style={{ backgroundColor: palette.success, color: "var(--color-success-foreground)" }}>
                  {t("admin:palette.success")}
                </span>
                <span className="rounded px-2 py-0.5" style={{ backgroundColor: palette.warning, color: "var(--color-warning-foreground)" }}>
                  {t("admin:palette.warning")}
                </span>
                <span className="rounded px-2 py-0.5" style={{ backgroundColor: palette.error, color: "var(--color-destructive-foreground)" }}>
                  {t("admin:palette.error")}
                </span>
                <span className="rounded px-2 py-0.5" style={{ backgroundColor: palette.info, color: "var(--color-info-foreground)" }}>
                  {t("admin:palette.info")}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
