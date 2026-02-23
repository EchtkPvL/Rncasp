import { useState, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/client";
import { oauthApi } from "@/api/oauth";
import type { PublicOAuthProvider } from "@/api/types";

export function LoginPage() {
  const { t } = useTranslation();
  const { login, verifyTOTP } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // TOTP state
  const [pendingToken, setPendingToken] = useState("");
  const [totpCode, setTotpCode] = useState("");

  // OAuth providers
  const [oauthProviders, setOauthProviders] = useState<PublicOAuthProvider[]>(
    []
  );

  useEffect(() => {
    oauthApi
      .listEnabled()
      .then((res) => setOauthProviders(res.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const oauthError = searchParams.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
    }
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(username, password);
      if ("totp_required" in result) {
        setPendingToken(result.pending_token);
      } else {
        navigate("/");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("error"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTOTPVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyTOTP(pendingToken, totpCode);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("error"));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOAuthLogin(providerName: string) {
    window.location.href = `/api/auth/oauth/${encodeURIComponent(providerName)}/authorize`;
  }

  // TOTP verification step
  if (pendingToken) {
    return (
      <div className="mx-auto mt-16 max-w-sm">
        <h1 className="text-2xl font-bold">{t("auth.totp_title")}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          {t("auth.totp_description")}
        </p>
        {error && (
          <div className="mt-4 rounded-md bg-[var(--color-destructive-light)] p-3 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}
        <form onSubmit={handleTOTPVerify} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="totp-code"
              className="block text-sm font-medium text-[var(--color-foreground)]"
            >
              {t("auth.totp_code")}
            </label>
            <input
              id="totp-code"
              type="text"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={20}
              placeholder="123456"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-center text-lg tracking-widest"
              autoFocus
            />
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {t("auth.totp_recovery_hint")}
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
          >
            {loading ? t("loading") : t("auth.totp_verify_button")}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setPendingToken("");
            setTotpCode("");
            setError("");
          }}
          className="mt-4 block w-full text-center text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          {t("back")}
        </button>
      </div>
    );
  }

  // Main login form
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-2xl font-bold">{t("auth.login_title")}</h1>
      {error && (
        <div className="mt-4 rounded-md bg-[var(--color-destructive-light)] p-3 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-[var(--color-foreground)]"
          >
            {t("auth.username")}
          </label>
          <input
            id="username"
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-[var(--color-foreground)]"
          >
            {t("auth.password")}
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
        >
          {loading ? t("loading") : t("auth.login_button")}
        </button>
      </form>

      {oauthProviders.length > 0 && (
        <>
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {t("auth.or_continue_with")}
            </span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <div className="mt-4 space-y-2">
            {oauthProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleOAuthLogin(provider.name)}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-muted)]"
              >
                {provider.name}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mt-4 text-center text-sm text-[var(--color-muted-foreground)]">
        {t("auth.no_account")}{" "}
        <Link
          to="/register"
          className="text-[var(--color-primary)] hover:underline"
        >
          {t("nav.register")}
        </Link>
      </p>
    </div>
  );
}
