import { useState, useCallback, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { oauthApi } from "@/api/oauth";
import { ApiError } from "@/api/client";
import type { OAuthProvider, CreateOAuthProviderRequest } from "@/api/types";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

const emptyForm: CreateOAuthProviderRequest = {
  name: "",
  client_id: "",
  client_secret: "",
  authorize_url: "",
  token_url: "",
  userinfo_url: "",
  scopes: "openid email profile",
};

export function OAuthProvidersPage() {
  const { t } = useTranslation(["common", "admin"]);
  const queryClient = useQueryClient();

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [deletingProvider, setDeletingProvider] = useState<OAuthProvider | null>(null);

  const { data: providers, isLoading } = useQuery({
    queryKey: ["oauth-providers-admin"],
    queryFn: async () => {
      const res = await oauthApi.listProviders();
      return res.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateOAuthProviderRequest) =>
      oauthApi.createProvider(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oauth-providers-admin"] });
      resetForm();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : t("error")),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateOAuthProviderRequest & { is_enabled: boolean }>;
    }) => oauthApi.updateProvider(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oauth-providers-admin"] });
      resetForm();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : t("error")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => oauthApi.deleteProvider(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["oauth-providers-admin"] }),
  });

  function resetForm() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
  }

  function startEdit(provider: OAuthProvider) {
    setEditId(provider.id);
    setForm({
      name: provider.name,
      client_id: provider.client_id,
      client_secret: "",
      authorize_url: provider.authorize_url,
      token_url: provider.token_url,
      userinfo_url: provider.userinfo_url,
      scopes: provider.scopes,
    });
    setError("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (editId) {
      const data: Record<string, string> = {};
      if (form.name) data.name = form.name;
      if (form.client_id) data.client_id = form.client_id;
      if (form.client_secret) data.client_secret = form.client_secret;
      if (form.authorize_url) data.authorize_url = form.authorize_url;
      if (form.token_url) data.token_url = form.token_url;
      if (form.userinfo_url) data.userinfo_url = form.userinfo_url;
      if (form.scopes) data.scopes = form.scopes;
      updateMutation.mutate({ id: editId, data });
    } else {
      createMutation.mutate(form);
    }
  }

  function toggleEnabled(provider: OAuthProvider) {
    updateMutation.mutate({
      id: provider.id,
      data: { is_enabled: !provider.is_enabled },
    });
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const doDeleteProvider = useCallback(() => {
    if (!deletingProvider) return;
    deleteMutation.mutate(deletingProvider.id);
    setDeletingProvider(null);
  }, [deletingProvider, deleteMutation]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{t("admin:oauth.title")}</h1>

      {/* Provider list */}
      {isLoading ? (
        <p className="mt-6 text-sm text-[var(--color-muted-foreground)]">
          {t("loading")}
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {providers && providers.length > 0 ? (
            providers.map((provider) => (
              <div
                key={provider.id}
                className="rounded-lg border border-[var(--color-border)] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${provider.is_enabled ? "bg-[var(--color-success)]" : "bg-[var(--color-muted-foreground)]"}`}
                    />
                    <span className="font-medium">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleEnabled(provider)}
                      className="text-sm text-[var(--color-muted-foreground)] hover:underline"
                    >
                      {provider.is_enabled
                        ? t("admin:oauth.disable")
                        : t("admin:oauth.enable")}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(provider)}
                      className="text-sm text-[var(--color-primary)] hover:underline"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingProvider(provider)}
                      className="text-sm text-[var(--color-destructive)] hover:underline"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {provider.client_id} &middot; {provider.scopes}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("admin:oauth.no_providers")}
            </p>
          )}
        </div>
      )}

      {/* Create/Edit form */}
      <div className="mt-8 rounded-lg border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold">
          {editId
            ? t("admin:oauth.edit_provider")
            : t("admin:oauth.add_provider")}
        </h2>
        {error && (
          <div className="mt-3 rounded-md bg-[var(--color-destructive-light)] p-3 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">
                {t("admin:oauth.provider_name")}
              </label>
              <input
                type="text"
                required={!editId}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="GitHub"
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                {t("admin:oauth.scopes")}
              </label>
              <input
                type="text"
                value={form.scopes}
                onChange={(e) => setForm({ ...form, scopes: e.target.value })}
                placeholder="openid email profile"
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">
                {t("admin:oauth.client_id")}
              </label>
              <input
                type="text"
                required={!editId}
                value={form.client_id}
                onChange={(e) =>
                  setForm({ ...form, client_id: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                {t("admin:oauth.client_secret")}
              </label>
              <input
                type="password"
                required={!editId}
                value={form.client_secret}
                onChange={(e) =>
                  setForm({ ...form, client_secret: e.target.value })
                }
                placeholder={editId ? t("admin:oauth.leave_blank") : ""}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">
              {t("admin:oauth.authorize_url")}
            </label>
            <input
              type="url"
              required={!editId}
              value={form.authorize_url}
              onChange={(e) =>
                setForm({ ...form, authorize_url: e.target.value })
              }
              placeholder="https://github.com/login/oauth/authorize"
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">
              {t("admin:oauth.token_url")}
            </label>
            <input
              type="url"
              required={!editId}
              value={form.token_url}
              onChange={(e) => setForm({ ...form, token_url: e.target.value })}
              placeholder="https://github.com/login/oauth/access_token"
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">
              {t("admin:oauth.userinfo_url")}
            </label>
            <input
              type="url"
              required={!editId}
              value={form.userinfo_url}
              onChange={(e) =>
                setForm({ ...form, userinfo_url: e.target.value })
              }
              placeholder="https://api.github.com/user"
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            {editId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
              >
                {t("cancel")}
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {isSubmitting
                ? t("loading")
                : editId
                  ? t("save")
                  : t("create")}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={!!deletingProvider}
        title={t("delete")}
        message={deletingProvider ? t("admin:oauth.delete_confirm", { name: deletingProvider.name }) : ""}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={doDeleteProvider}
        onCancel={() => setDeletingProvider(null)}
      />
    </div>
  );
}
