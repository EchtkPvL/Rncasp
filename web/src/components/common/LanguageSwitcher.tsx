import { useTranslation } from "react-i18next";

const languages = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
] as const;

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");

  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="rounded-md border border-[var(--color-nav-border)] bg-[var(--color-nav-hover)] px-2 py-1 text-sm text-[var(--color-nav-text)]"
      aria-label={t("language")}
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
