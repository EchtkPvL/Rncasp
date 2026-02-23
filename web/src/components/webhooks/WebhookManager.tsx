import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webhooksApi } from "@/api/webhooks";
import type { CreateWebhookRequest, UpdateWebhookRequest, Webhook } from "@/api/types";

const TRIGGER_OPTIONS = [
  "shift.created",
  "shift.updated",
  "shift.deleted",
  "event.locked",
  "event.unlocked",
  "coverage.updated",
];

interface WebhookManagerProps {
  slug: string;
}

export function WebhookManager({ slug }: WebhookManagerProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ["events", slug, "webhooks"],
    queryFn: async () => {
      const res = await webhooksApi.list(slug);
      return res.data!;
    },
    enabled: !!slug,
  });

  const createWebhook = useMutation({
    mutationFn: (data: CreateWebhookRequest) => webhooksApi.create(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", slug, "webhooks"] });
      setShowForm(false);
      resetForm();
    },
  });

  const updateWebhook = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWebhookRequest }) =>
      webhooksApi.update(slug, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", slug, "webhooks"] });
      setEditingId(null);
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(slug, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", slug, "webhooks"] });
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    url: "",
    secret: "",
    trigger_types: [] as string[],
  });

  function resetForm() {
    setForm({ name: "", url: "", secret: "", trigger_types: [] });
  }

  function startEdit(wh: Webhook) {
    setEditingId(wh.id);
    setForm({
      name: wh.name,
      url: wh.url,
      secret: "",
      trigger_types: wh.trigger_types,
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createWebhook.mutate(form);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const data: UpdateWebhookRequest = {
      name: form.name,
      url: form.url,
      trigger_types: form.trigger_types,
    };
    if (form.secret) data.secret = form.secret;
    updateWebhook.mutate({ id: editingId, data });
  }

  function toggleTrigger(trigger: string) {
    setForm((prev) => ({
      ...prev,
      trigger_types: prev.trigger_types.includes(trigger)
        ? prev.trigger_types.filter((t) => t !== trigger)
        : [...prev.trigger_types, trigger],
    }));
  }

  function handleToggleEnabled(wh: Webhook) {
    updateWebhook.mutate({
      id: wh.id,
      data: { is_enabled: !wh.is_enabled },
    });
  }

  function handleDelete(wh: Webhook) {
    if (confirm(t("webhooks.delete_confirm", 'Delete webhook "{{name}}"?', { name: wh.name }))) {
      deleteWebhook.mutate(wh.id);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("webhooks.title", "Webhooks")}</h3>
        <button
          type="button"
          onClick={() => { setShowForm(true); setEditingId(null); resetForm(); }}
          className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
        >
          + {t("webhooks.add", "Add Webhook")}
        </button>
      </div>

      {/* Form for create/edit */}
      {(showForm || editingId) && (
        <form
          onSubmit={editingId ? handleUpdate : handleCreate}
          className="mb-4 rounded-lg border border-[var(--color-border)] p-4"
        >
          <h4 className="mb-3 text-sm font-medium">
            {editingId ? t("webhooks.edit", "Edit Webhook") : t("webhooks.add", "Add Webhook")}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">{t("webhooks.name", "Name")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">{t("webhooks.url", "URL")}</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium">
                {t("webhooks.secret", "Secret")}
                {editingId && (
                  <span className="ml-1 font-normal text-[var(--color-muted-foreground)]">
                    ({t("admin:oauth.leave_blank")})
                  </span>
                )}
              </label>
              <input
                type="password"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                required={!editingId}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium">{t("webhooks.triggers", "Trigger Types")}</label>
              <div className="flex flex-wrap gap-2">
                {TRIGGER_OPTIONS.map((trigger) => (
                  <label key={trigger} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={form.trigger_types.includes(trigger)}
                      onChange={() => toggleTrigger(trigger)}
                      className="rounded"
                    />
                    {trigger}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
            >
              {editingId ? t("common:save") : t("common:create")}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm"
            >
              {t("common:cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t("webhooks.empty", "No webhooks configured.")}
        </p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{wh.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      wh.is_enabled
                        ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                        : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    {wh.is_enabled ? t("admin:oauth.enable") : t("admin:oauth.disable")}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">
                  {wh.url}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {wh.trigger_types.map((tr) => (
                    <span
                      key={tr}
                      className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px]"
                    >
                      {tr}
                    </span>
                  ))}
                </div>
              </div>
              <div className="ml-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(wh)}
                  className="text-xs text-[var(--color-primary)] hover:underline"
                >
                  {wh.is_enabled ? t("admin:oauth.disable") : t("admin:oauth.enable")}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(wh)}
                  className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  {t("common:edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(wh)}
                  className="text-xs text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                >
                  {t("common:delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
