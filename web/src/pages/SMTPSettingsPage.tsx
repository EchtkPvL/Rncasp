import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { smtpApi } from "@/api/smtp";
import type { UpdateSMTPConfigRequest } from "@/api/types";

export function SMTPSettingsPage() {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["smtp", "config"],
    queryFn: async () => {
      const res = await smtpApi.getConfig();
      return res.data;
    },
  });

  const updateConfig = useMutation({
    mutationFn: (data: UpdateSMTPConfigRequest) => smtpApi.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp", "config"] });
      setMessage(t("smtp.saved", "SMTP configuration saved"));
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const testConnection = useMutation({
    mutationFn: (to: string) => smtpApi.testConnection(to),
    onSuccess: () => {
      setMessage(t("smtp.test_sent", "Test email sent successfully"));
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const [form, setForm] = useState({
    host: "",
    port: 587,
    username: "",
    password: "",
    from_address: "",
    from_name: "",
    use_tls: true,
  });
  const [testEmail, setTestEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (config) {
      setForm({
        host: config.host,
        port: config.port,
        username: config.username || "",
        password: "",
        from_address: config.from_address,
        from_name: config.from_name || "",
        use_tls: config.use_tls,
      });
    }
  }, [config]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    const data: UpdateSMTPConfigRequest = {
      host: form.host,
      port: form.port,
      from_address: form.from_address,
      use_tls: form.use_tls,
    };
    if (form.username) data.username = form.username;
    if (form.password) data.password = form.password;
    if (form.from_name) data.from_name = form.from_name;
    updateConfig.mutate(data);
  }

  function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!testEmail) return;
    testConnection.mutate(testEmail);
  }

  if (isLoading) {
    return <p className="text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t("smtp.title", "SMTP Settings")}</h1>

      {message && (
        <div className="mb-4 rounded-md bg-[var(--color-success-light)] p-3 text-sm text-[var(--color-success)]">{message}</div>
      )}
      {error && (
        <div className="mb-4 rounded-md bg-[var(--color-destructive-light)] p-3 text-sm text-[var(--color-destructive)]">{error}</div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("smtp.host", "SMTP Host")}</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder="smtp.example.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("smtp.port", "Port")}</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("smtp.username", "Username")}</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("smtp.password", "Password")}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder={config ? t("admin:oauth.leave_blank") : ""}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("smtp.from_address", "From Address")}</label>
            <input
              type="email"
              value={form.from_address}
              onChange={(e) => setForm({ ...form, from_address: e.target.value })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder="noreply@example.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("smtp.from_name", "From Name")}</label>
            <input
              type="text"
              value={form.from_name}
              onChange={(e) => setForm({ ...form, from_name: e.target.value })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder="Rncasp"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.use_tls}
            onChange={(e) => setForm({ ...form, use_tls: e.target.checked })}
            className="rounded"
          />
          {t("smtp.use_tls", "Use TLS")}
        </label>

        <button
          type="submit"
          disabled={updateConfig.isPending}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
        >
          {t("common:save")}
        </button>
      </form>

      {/* Test email section */}
      <div className="mt-8 rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("smtp.test_title", "Test Connection")}</h2>
        <form onSubmit={handleTest} className="flex gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder={t("smtp.test_recipient", "Recipient email")}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={testConnection.isPending}
            className="rounded-md bg-[var(--color-muted)] px-4 py-2 text-sm hover:bg-[var(--color-border)] disabled:opacity-50"
          >
            {t("smtp.send_test", "Send Test")}
          </button>
        </form>
      </div>
    </div>
  );
}
