import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";

const TABS = [
  { path: "/settings/security", labelKey: "nav.settings" },
  { path: "/settings/notifications", labelKey: "nav.notification_prefs" },
  { path: "/settings/ical", labelKey: "nav.ical_subscriptions" },
] as const;

export function SettingsTabs() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="mb-6 flex gap-1 border-b border-[var(--color-border)]">
      {TABS.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              active
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-border)]"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
