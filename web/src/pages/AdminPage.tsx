import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

const SECTIONS = [
  { path: "/admin", labelKey: "admin:dashboard.title", end: true },
  { path: "/admin/users", labelKey: "admin:users.title" },
  { path: "/admin/settings", labelKey: "admin:settings.title" },
  { path: "/admin/oauth", labelKey: "admin:oauth.title" },
  { path: "/admin/smtp", labelKey: "admin:smtp.title" },
  { path: "/admin/dummy-accounts", labelKey: "admin:dummy.title" },
  { path: "/admin/audit-log", labelKey: "common:nav.audit_log" },
];

export function AdminPage() {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <div className="flex min-h-0 flex-col sm:flex-row sm:gap-6">
      {/* Mobile: horizontal scrollable tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] pb-2 sm:hidden">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.path}
            to={s.path}
            end={s.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              }`
            }
          >
            {t(s.labelKey)}
          </NavLink>
        ))}
      </nav>

      {/* Desktop: fixed-width sidebar */}
      <nav className="hidden w-56 shrink-0 sm:block">
        <ul className="space-y-1">
          {SECTIONS.map((s) => (
            <li key={s.path}>
              <NavLink
                to={s.path}
                end={s.end}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-l-2 border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]"
                      : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  }`
                }
              >
                {t(s.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content area */}
      <div className="mt-4 min-w-0 flex-1 sm:mt-0">
        <Outlet />
      </div>
    </div>
  );
}
