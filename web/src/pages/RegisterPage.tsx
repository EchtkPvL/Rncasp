import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/client";

const API_ERROR_KEYS: Record<string, string> = {
  "registration is disabled": "auth.registration_disabled",
  "username already taken": "auth.username_taken",
  "email already in use": "auth.email_taken",
};

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFieldError("");
    setLoading(true);
    try {
      await register(
        username,
        password,
        fullName,
        email || undefined,
      );
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        const key = API_ERROR_KEYS[err.message];
        setError(key ? t(key) : err.message);
        if (err.field) setFieldError(err.field);
      } else {
        setError(t("error"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-2xl font-bold">{t("auth.register_title")}</h1>
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
            minLength={3}
            maxLength={50}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
              fieldError === "username"
                ? "border-[var(--color-destructive)]"
                : "border-[var(--color-border)]"
            } bg-[var(--color-background)]`}
          />
        </div>
        <div>
          <label
            htmlFor="full_name"
            className="block text-sm font-medium text-[var(--color-foreground)]"
          >
            {t("auth.full_name")}
          </label>
          <input
            id="full_name"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[var(--color-foreground)]"
          >
            {t("auth.email")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
              fieldError === "email"
                ? "border-[var(--color-destructive)]"
                : "border-[var(--color-border)]"
            } bg-[var(--color-background)]`}
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
          {password.length > 0 && password.length < 8 && (
            <p className="mt-1 text-xs text-[var(--color-warning)]">{t("auth.weak_password")}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
        >
          {loading ? t("loading") : t("auth.register_button")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--color-muted-foreground)]">
        {t("auth.has_account")}{" "}
        <Link
          to="/login"
          className="text-[var(--color-primary)] hover:underline"
        >
          {t("nav.login")}
        </Link>
      </p>
    </div>
  );
}
