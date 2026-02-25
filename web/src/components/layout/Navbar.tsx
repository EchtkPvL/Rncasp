import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAppName } from "@/hooks/useAppName";

interface NavbarProps {
  user: { username: string; role: string } | null;
  onLogout: () => void;
}

export function Navbar({ user, onLogout }: NavbarProps) {
  const { t } = useTranslation(["common", "admin"]);
  const appName = useAppName();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close menu on click outside the entire header (includes hamburger button)
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <header ref={headerRef} className="border-b border-[var(--color-nav-background)] bg-[var(--color-nav-background)]">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-lg font-semibold text-[var(--color-nav-text)]"
          >
            {appName}
          </Link>
          {user && (
            <div className="hidden items-center gap-4 sm:flex">
              <Link
                to="/"
                className="text-sm text-[var(--color-nav-text)]/70 hover:text-[var(--color-nav-text)]"
              >
                {t("nav.dashboard")}
              </Link>
              <Link
                to="/events"
                className="text-sm text-[var(--color-nav-text)]/70 hover:text-[var(--color-nav-text)]"
              >
                {t("nav.events")}
              </Link>
              {user.role === "super_admin" && (
                <>
                  <Link
                    to="/teams"
                    className="text-sm text-[var(--color-nav-text)]/70 hover:text-[var(--color-nav-text)]"
                  >
                    {t("nav.teams")}
                  </Link>
                  <Link
                    to="/admin"
                    className="text-sm text-[var(--color-nav-text)]/70 hover:text-[var(--color-nav-text)]"
                  >
                    {t("nav.admin")}
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {user && <NotificationBell />}

          {/* Desktop auth/user section */}
          {user ? (
            <div className="hidden items-center gap-3 sm:flex">
              <Link
                to="/settings/security"
                className="text-sm text-[var(--color-nav-text)]/70 hover:text-[var(--color-nav-text)]"
              >
                {user.username}
              </Link>
              <button
                onClick={onLogout}
                className="rounded-md bg-[var(--color-nav-hover)] px-3 py-1.5 text-sm text-[var(--color-nav-text)] hover:bg-[var(--color-nav-active)]"
              >
                {t("nav.logout")}
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                to="/login"
                className="rounded-md px-3 py-1.5 text-sm text-[var(--color-nav-text)] hover:bg-[var(--color-nav-hover)]"
              >
                {t("nav.login")}
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
              >
                {t("nav.register")}
              </Link>
            </div>
          )}

          {/* Hamburger button (mobile) */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="touch-compact sm:hidden rounded-md p-2 text-[var(--color-nav-text)]/70 hover:bg-[var(--color-nav-hover)]"
            aria-label={t("nav.menu", "Menu")}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-[var(--color-nav-border)] bg-[var(--color-nav-background)] px-4 pb-4 sm:hidden">
          {user ? (
            <div className="flex flex-col gap-1 pt-2">
              <MobileLink to="/">{t("nav.dashboard")}</MobileLink>
              <MobileLink to="/events">{t("nav.events")}</MobileLink>
              <MobileLink to="/settings/security">{t("nav.settings")}</MobileLink>
              <MobileLink to="/settings/notifications">{t("nav.notification_prefs")}</MobileLink>
              <MobileLink to="/settings/ical">{t("nav.ical_subscriptions")}</MobileLink>
              {user.role === "super_admin" && (
                <>
                  <div className="mt-2 mb-1 text-xs font-semibold text-[var(--color-nav-text)]/50 uppercase tracking-wider">
                    {t("nav.admin")}
                  </div>
                  <MobileLink to="/admin">{t("admin:dashboard.title")}</MobileLink>
                  <MobileLink to="/admin/users">{t("admin:users.title")}</MobileLink>
                  <MobileLink to="/admin/settings">{t("admin:settings.title")}</MobileLink>
                  <MobileLink to="/admin/oauth">{t("admin:oauth.title")}</MobileLink>
                  <MobileLink to="/admin/smtp">{t("admin:smtp.title")}</MobileLink>
                  <MobileLink to="/admin/webhooks">{t("admin:global_webhooks.title")}</MobileLink>
                  <MobileLink to="/admin/audit-log">{t("nav.audit_log")}</MobileLink>
                </>
              )}
              <button
                onClick={onLogout}
                className="mt-2 rounded-md bg-[var(--color-nav-hover)] px-3 py-2 text-left text-sm text-[var(--color-nav-text)] hover:bg-[var(--color-nav-active)]"
              >
                {t("nav.logout")}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1 pt-2">
              <MobileLink to="/login">{t("nav.login")}</MobileLink>
              <MobileLink to="/register">{t("nav.register")}</MobileLink>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

function MobileLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-2 text-sm text-[var(--color-nav-text)] hover:bg-[var(--color-nav-hover)]"
    >
      {children}
    </Link>
  );
}
