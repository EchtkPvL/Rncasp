import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/api/auth";
import { oauthApi } from "@/api/oauth";
import { ApiError } from "@/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SettingsTabs } from "@/components/common/SettingsTabs";

export function SecuritySettingsPage() {
  const { t } = useTranslation(["common", "admin"]);
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">{t("common:nav.settings")}</h1>
      <SettingsTabs />
      <ProfileSection />
      <TOTPSection totpEnabled={user?.totp_enabled ?? false} />
      <OAuthConnectionsSection />
    </div>
  );
}

function ProfileSection() {
  const { t } = useTranslation(["common", "admin"]);
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data: Record<string, string> = {};
      if (fullName !== (user?.full_name ?? "")) data.full_name = fullName;
      if (displayName !== (user?.display_name ?? "")) data.display_name = displayName;
      if (email !== (user?.email ?? "")) data.email = email;
      if (password) data.password = password;

      if (Object.keys(data).length === 0) {
        setLoading(false);
        return;
      }

      await authApi.updateProfile(data);
      setPassword("");
      setSuccess(t("admin:profile.saved"));
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-6">
      <h2 className="text-lg font-semibold">{t("admin:profile.title")}</h2>
      {error && (
        <div className="mt-3 rounded-md bg-[var(--color-destructive-light)] p-3 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded-md bg-[var(--color-success-light,var(--color-muted))] p-3 text-sm text-[var(--color-success)]">
          {success}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="profile-fullname" className="block text-sm font-medium">
            {t("admin:profile.full_name")}
          </label>
          <input
            id="profile-fullname"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="profile-displayname" className="block text-sm font-medium">
            {t("admin:profile.display_name")}
          </label>
          <input
            id="profile-displayname"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("common:optional")}
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium">
            {t("admin:profile.email")}
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("common:optional")}
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="profile-password" className="block text-sm font-medium">
            {t("admin:profile.new_password")}
          </label>
          <input
            id="profile-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("admin:users.password_placeholder")}
            autoComplete="new-password"
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
        >
          {loading ? t("loading") : t("save")}
        </button>
      </form>
    </section>
  );
}

function TOTPSection({ totpEnabled: initialTotpEnabled }: { totpEnabled: boolean }) {
  const { t } = useTranslation(["common", "admin"]);
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [totpEnabled, setTotpEnabled] = useState(initialTotpEnabled);
  const [step, setStep] = useState<"idle" | "setup" | "codes">("idle");
  const [setupData, setSetupData] = useState<{
    secret: string;
    provision_uri: string;
    recovery_codes: string[];
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const { data: codeCount } = useQuery({
    queryKey: ["totp-recovery-count"],
    queryFn: async () => {
      const res = await authApi.recoveryCodeCount();
      return res.data!.remaining;
    },
    enabled: totpEnabled,
  });

  async function handleSetup() {
    setError("");
    setLoading(true);
    try {
      const res = await authApi.totpSetup();
      setSetupData(res.data!);
      setStep("setup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleEnable(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.totpEnable(verifyCode);
      setRecoveryCodes(setupData?.recovery_codes ?? []);
      setStep("codes");
      setSetupData(null);
      setVerifyCode("");
      setTotpEnabled(true);
      queryClient.invalidateQueries({ queryKey: ["totp-recovery-count"] });
      refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.totpDisable(disableCode);
      setDisableCode("");
      setTotpEnabled(false);
      refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateCodes(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.regenerateRecoveryCodes(verifyCode);
      setRecoveryCodes(res.data!.recovery_codes);
      setStep("codes");
      setVerifyCode("");
      queryClient.invalidateQueries({ queryKey: ["totp-recovery-count"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  // Recovery codes display
  if (step === "codes" && recoveryCodes.length > 0) {
    return (
      <section className="rounded-lg border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold">
          {t("admin:security.recovery_codes")}
        </h2>
        <div className="mt-2 rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-4 py-3 text-sm text-[var(--color-warning-foreground)]">
          {t("admin:security.recovery_codes_warning")}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-[var(--color-muted)] p-4 font-mono text-sm">
          {recoveryCodes.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(recoveryCodes.join("\n"));
          }}
          className="mt-3 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)]"
        >
          {t("admin:security.copy_codes")}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("idle");
            setRecoveryCodes([]);
          }}
          className="ml-2 mt-3 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
        >
          {t("admin:security.codes_saved")}
        </button>
      </section>
    );
  }

  // TOTP setup step
  if (step === "setup" && setupData) {
    return (
      <section className="rounded-lg border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold">
          {t("admin:security.totp_setup")}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          {t("admin:security.totp_scan_qr")}
        </p>
        {error && (
          <div className="mt-3 rounded-md bg-[var(--color-destructive-light)] p-3 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}
        <div className="mt-4 flex justify-center">
          <QRCodeSVG value={setupData.provision_uri} size={200} />
        </div>
        <div className="mt-3 text-center">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t("admin:security.totp_manual_entry")}
          </p>
          <code className="mt-1 block break-all rounded bg-[var(--color-muted)] px-2 py-1 text-xs">
            {setupData.secret}
          </code>
        </div>
        <form onSubmit={handleEnable} className="mt-6 space-y-3">
          <label
            htmlFor="totp-verify"
            className="block text-sm font-medium"
          >
            {t("admin:security.totp_enter_code")}
          </label>
          <input
            id="totp-verify"
            type="text"
            required
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)}
            className="block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-center text-lg tracking-widest"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("idle");
                setSetupData(null);
                setError("");
              }}
              className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {loading ? t("loading") : t("admin:security.totp_enable")}
            </button>
          </div>
        </form>
      </section>
    );
  }

  // Main section
  return (
    <section className="rounded-lg border border-[var(--color-border)] p-6">
      <h2 className="text-lg font-semibold">
        {t("admin:security.totp_title")}
      </h2>
      {error && (
        <div className="mt-3 rounded-md bg-[var(--color-destructive-light)] p-3 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {totpEnabled ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)]" />
            {t("admin:security.totp_enabled")}
          </div>
          {codeCount !== undefined && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("admin:security.recovery_codes_remaining", {
                count: codeCount,
              })}
            </p>
          )}
          <form onSubmit={handleDisable} className="space-y-3">
            <label htmlFor="totp-disable" className="block text-sm font-medium">
              {t("admin:security.totp_disable_prompt")}
            </label>
            <input
              id="totp-disable"
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              className="block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-md border border-[var(--color-destructive-border)] px-3 py-1.5 text-sm text-[var(--color-destructive)] hover:bg-[var(--color-destructive-light)] disabled:opacity-50"
            >
              {loading ? t("loading") : t("admin:security.totp_disable")}
            </button>
          </form>
          <div className="border-t border-[var(--color-border)] pt-4">
            <form onSubmit={handleRegenerateCodes} className="space-y-3">
              <label
                htmlFor="regen-code"
                className="block text-sm font-medium"
              >
                {t("admin:security.regenerate_codes_prompt")}
              </label>
              <input
                id="regen-code"
                type="text"
                required
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
              >
                {loading
                  ? t("loading")
                  : t("admin:security.regenerate_codes")}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t("admin:security.totp_disabled_description")}
          </p>
          <button
            type="button"
            onClick={handleSetup}
            disabled={loading}
            className="mt-3 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
          >
            {loading ? t("loading") : t("admin:security.totp_setup")}
          </button>
        </div>
      )}
    </section>
  );
}

function OAuthConnectionsSection() {
  const { t } = useTranslation(["common", "admin"]);
  const queryClient = useQueryClient();

  const { data: connections, isLoading } = useQuery({
    queryKey: ["oauth-connections"],
    queryFn: async () => {
      const res = await oauthApi.listConnections();
      return res.data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["oauth-providers-public"],
    queryFn: async () => {
      const res = await oauthApi.listEnabled();
      return res.data ?? [];
    },
  });

  const unlink = useMutation({
    mutationFn: (id: string) => oauthApi.unlinkConnection(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["oauth-connections"] }),
  });

  function handleLink(providerName: string) {
    window.location.href = `/api/auth/oauth/${encodeURIComponent(providerName)}/authorize`;
  }

  // Don't show section if no providers exist
  if (!isLoading && (!providers || providers.length === 0)) {
    return null;
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-6">
      <h2 className="text-lg font-semibold">
        {t("admin:security.oauth_connections")}
      </h2>

      {isLoading ? (
        <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
          {t("loading")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {connections && connections.length > 0 ? (
            connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{conn.provider_name}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {conn.external_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unlink.mutate(conn.id)}
                  disabled={unlink.isPending}
                  className="text-sm text-[var(--color-destructive)] hover:underline disabled:opacity-50"
                >
                  {t("admin:security.disconnect")}
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("admin:security.no_connections")}
            </p>
          )}

          {providers &&
            providers
              .filter(
                (p) =>
                  !connections?.some((c) => c.provider_name === p.name)
              )
              .map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleLink(provider.name)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[var(--color-border)] px-4 py-3 text-sm hover:bg-[var(--color-muted)]"
                >
                  {t("admin:security.connect_provider", {
                    name: provider.name,
                  })}
                </button>
              ))}
        </div>
      )}
    </section>
  );
}
