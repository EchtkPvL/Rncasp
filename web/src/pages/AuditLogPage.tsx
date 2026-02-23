import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { auditApi, type AuditLogParams } from "@/api/audit";

export function AuditLogPage() {
  const { t } = useTranslation(["admin", "common"]);
  const [params, setParams] = useState<AuditLogParams>({ limit: 50, offset: 0 });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit-log", params],
    queryFn: () => auditApi.list(params),
  });

  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  function applyFilters() {
    setParams((prev) => ({
      ...prev,
      action: actionFilter || undefined,
      entity_type: entityFilter || undefined,
      offset: 0,
    }));
  }

  function nextPage() {
    setParams((prev) => ({ ...prev, offset: (prev.offset ?? 0) + (prev.limit ?? 50) }));
  }

  function prevPage() {
    setParams((prev) => ({ ...prev, offset: Math.max(0, (prev.offset ?? 0) - (prev.limit ?? 50)) }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin:audit.title")}</h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin:audit.description")}</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        >
          <option value="">{t("admin:audit.all_actions")}</option>
          <option value="create">{t("admin:audit.action_create")}</option>
          <option value="update">{t("admin:audit.action_update")}</option>
          <option value="delete">{t("admin:audit.action_delete")}</option>
          <option value="lock_toggle">{t("admin:audit.action_lock")}</option>
          <option value="public_toggle">{t("admin:audit.action_public")}</option>
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        >
          <option value="">{t("admin:audit.all_entities")}</option>
          <option value="event">{t("admin:audit.entity_event")}</option>
          <option value="shift">{t("admin:audit.entity_shift")}</option>
        </select>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
        >
          {t("common:search")}
        </button>
      </div>

      {/* Results */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:loading")}</p>
      ) : entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-[var(--color-border)] px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    entry.action === "create" ? "bg-[var(--color-success-light)] text-[var(--color-success)]" :
                    entry.action === "delete" ? "bg-[var(--color-destructive-light)] text-[var(--color-destructive)]" :
                    "bg-[var(--color-info-light)] text-[var(--color-info)]"
                  }`}>
                    {entry.action}
                  </span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {entry.entity_type}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-sm">
                {entry.username ? (
                  <span className="font-medium">@{entry.username}</span>
                ) : (
                  <span className="italic text-[var(--color-muted-foreground)]">{t("admin:audit.system")}</span>
                )}
                {entry.entity_id && (
                  <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                    ID: {entry.entity_id.substring(0, 8)}...
                  </span>
                )}
              </div>
              {(entry.old_value != null || entry.new_value != null) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[var(--color-primary)]">
                    {t("admin:audit.show_details")}
                  </summary>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {entry.old_value != null && (
                      <div>
                        <p className="text-xs font-medium text-[var(--color-muted-foreground)]">{t("admin:audit.old_value")}</p>
                        <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-[var(--color-muted)] p-2 text-xs">
                          {String(JSON.stringify(entry.old_value, null, 2))}
                        </pre>
                      </div>
                    )}
                    {entry.new_value != null && (
                      <div>
                        <p className="text-xs font-medium text-[var(--color-muted-foreground)]">{t("admin:audit.new_value")}</p>
                        <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-[var(--color-muted)] p-2 text-xs">
                          {String(JSON.stringify(entry.new_value, null, 2))}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          ))}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={prevPage}
              disabled={!params.offset}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {t("admin:audit.prev_page")}
            </button>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {t("admin:audit.showing", { from: (params.offset ?? 0) + 1, to: (params.offset ?? 0) + entries.length })}
            </span>
            <button
              type="button"
              onClick={nextPage}
              disabled={entries.length < (params.limit ?? 50)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {t("admin:audit.next_page")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin:audit.empty")}</p>
      )}
    </div>
  );
}
