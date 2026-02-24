import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { auditApi, type AuditLogParams } from "@/api/audit";
import type { AuditLogEntry } from "@/api/types";
import { useTimeFormat } from "@/hooks/useTimeFormat";

// --- Pure formatting helpers ---

function formatTimestamp(iso: string, hour12: boolean): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (hour12) {
    const h = d.getHours() % 12 || 12;
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    return `${date} ${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
  }
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTime(iso: string, hour12: boolean): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hour12) {
    const h = d.getHours() % 12 || 12;
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    return `${h}:${pad(d.getMinutes())} ${ampm}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isTimestamp(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
}

function prettifyFieldName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Field display config ---

// Fields to always hide from detail views (internal IDs, derived/redundant)
const HIDDEN_FIELDS = new Set([
  "id",
  "event_id",
  "created_at",
  "updated_at",
  "created_by",
  "team_abbreviation",
  "team_color",
  "user_full_name",
  "user_display_name",
]);

// UUID fields → show the companion (human-readable) field value instead
const UUID_COMPANIONS: Record<string, string> = {
  user_id: "username",
  team_id: "team_name",
};

// Companion fields hidden separately (shown via their UUID field)
const COMPANION_FIELDS = new Set(["username", "team_name"]);

// Translation keys for common field labels (admin: namespace)
const FIELD_LABEL_KEYS: Record<string, string> = {
  name: "audit.field_name",
  slug: "audit.field_slug",
  description: "audit.field_description",
  location: "audit.field_location",
  participant_count: "audit.field_participants",
  start_time: "audit.field_start",
  end_time: "audit.field_end",
  time_granularity: "audit.field_granularity",
  is_locked: "audit.field_locked",
  is_public: "audit.field_public",
  user_id: "audit.field_user",
  team_id: "audit.field_team",
};

function shouldShowField(key: string): boolean {
  return !HIDDEN_FIELDS.has(key) && !COMPANION_FIELDS.has(key);
}

/** Resolve a field value to human-readable text, using companion fields for UUIDs */
function resolveValue(
  key: string,
  value: unknown,
  obj: Record<string, unknown>,
  hour12: boolean,
): string {
  if (value === null || value === undefined) return "—";

  const companion = UUID_COMPANIONS[key];
  if (companion && typeof obj[companion] === "string") {
    const name = obj[companion] as string;
    return key === "user_id" ? `@${name}` : name;
  }

  if (isTimestamp(value)) return formatTimestamp(value as string, hour12);
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// --- Action / entity labels ---

const ACTION_LABELS: Record<string, string> = {
  create: "audit.action_create",
  update: "audit.action_update",
  delete: "audit.action_delete",
  lock_toggle: "audit.action_lock",
  public_toggle: "audit.action_public",
};

const ENTITY_LABELS: Record<string, string> = {
  event: "audit.entity_event",
  shift: "audit.entity_shift",
};

function actionColor(action: string): string {
  if (action === "create")
    return "bg-[var(--color-success)]/15 text-[var(--color-success)]";
  if (action === "delete")
    return "bg-[var(--color-error)]/15 text-[var(--color-error)]";
  return "bg-[var(--color-info)]/15 text-[var(--color-info)]";
}

/** Build a human-readable entity description for the Entity column */
function describeEntity(entry: AuditLogEntry, hour12: boolean): string | null {
  const val = (entry.new_value ?? entry.old_value) as Record<string, unknown> | null;
  if (!val || typeof val !== "object") return null;

  if (entry.entity_type === "event") {
    return (val.name as string) || (val.slug as string) || null;
  }

  if (entry.entity_type === "shift") {
    const parts: string[] = [];
    if (typeof val.username === "string") parts.push(`@${val.username}`);
    if (typeof val.team_name === "string") parts.push(val.team_name as string);
    if (typeof val.start_time === "string" && typeof val.end_time === "string") {
      parts.push(
        `${formatTime(val.start_time, hour12)}–${formatTime(val.end_time, hour12)}`,
      );
    }
    return parts.join(" · ") || null;
  }

  for (const key of ["name", "slug", "title", "username"]) {
    if (typeof val[key] === "string" && val[key]) return val[key] as string;
  }
  return null;
}

// --- Component ---

export function AuditLogPage() {
  const { t } = useTranslation(["admin", "common"]);
  const hour12 = useTimeFormat();
  const [params, setParams] = useState<AuditLogParams>({ limit: 50, offset: 0 });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit-log", params],
    queryFn: () => auditApi.list(params),
  });

  function fieldLabel(key: string): string {
    const tKey = FIELD_LABEL_KEYS[key];
    if (tKey) return t(`admin:${tKey}`);
    return prettifyFieldName(key);
  }

  function renderChanges(entry: AuditLogEntry) {
    if (
      entry.action === "update" &&
      entry.old_value &&
      entry.new_value &&
      typeof entry.old_value === "object" &&
      typeof entry.new_value === "object"
    ) {
      const oldObj = entry.old_value as Record<string, unknown>;
      const newObj = entry.new_value as Record<string, unknown>;
      const allKeys = [
        ...new Set([...Object.keys(oldObj), ...Object.keys(newObj)]),
      ];
      const changed = allKeys
        .filter(
          (key) =>
            shouldShowField(key) &&
            JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key]),
        )
        .map((key) => ({
          label: fieldLabel(key),
          from: resolveValue(key, oldObj[key], oldObj, hour12),
          to: resolveValue(key, newObj[key], newObj, hour12),
        }));

      if (changed.length === 0) return null;

      return (
        <ul className="space-y-0.5 text-xs">
          {changed.map((c) => (
            <li key={c.label}>
              <span className="font-medium text-[var(--color-muted-foreground)]">
                {c.label}:
              </span>{" "}
              <span className="text-[var(--color-error)]">{c.from}</span>
              {" → "}
              <span className="text-[var(--color-success)]">{c.to}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Create or delete — show key-value summary instead of raw JSON
    const val = (entry.new_value ?? entry.old_value) as Record<
      string,
      unknown
    > | null;
    if (!val || typeof val !== "object") return null;

    const fields = Object.entries(val)
      .filter(([key]) => shouldShowField(key))
      .map(([key, value]) => ({
        label: fieldLabel(key),
        value: resolveValue(key, value, val, hour12),
      }));

    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
        {fields.map((f) => (
          <Fragment key={f.label}>
            <dt className="font-medium text-[var(--color-muted-foreground)]">
              {f.label}
            </dt>
            <dd>{f.value}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setFilter(key: "action" | "entity_type", value: string) {
    setParams((prev) => ({
      ...prev,
      [key]: value || undefined,
      offset: 0,
    }));
  }

  function nextPage() {
    setParams((prev) => ({
      ...prev,
      offset: (prev.offset ?? 0) + (prev.limit ?? 50),
    }));
  }

  function prevPage() {
    setParams((prev) => ({
      ...prev,
      offset: Math.max(0, (prev.offset ?? 0) - (prev.limit ?? 50)),
    }));
  }

  const selectClass =
    "rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin:audit.title")}</h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t("admin:audit.description")}
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={params.action ?? ""}
          onChange={(e) => setFilter("action", e.target.value)}
          className={selectClass}
        >
          <option value="">{t("admin:audit.all_actions")}</option>
          <option value="create">{t("admin:audit.action_create")}</option>
          <option value="update">{t("admin:audit.action_update")}</option>
          <option value="delete">{t("admin:audit.action_delete")}</option>
          <option value="lock_toggle">{t("admin:audit.action_lock")}</option>
          <option value="public_toggle">{t("admin:audit.action_public")}</option>
        </select>
        <select
          value={params.entity_type ?? ""}
          onChange={(e) => setFilter("entity_type", e.target.value)}
          className={selectClass}
        >
          <option value="">{t("admin:audit.all_entities")}</option>
          <option value="event">{t("admin:audit.entity_event")}</option>
          <option value="shift">{t("admin:audit.entity_shift")}</option>
        </select>
      </div>

      {/* Results */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t("common:loading")}
        </p>
      ) : entries && entries.length > 0 ? (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-muted-foreground)]">
                  <th className="pb-2 pr-3">
                    {t("admin:audit.col_timestamp")}
                  </th>
                  <th className="pb-2 pr-3">{t("admin:audit.col_user")}</th>
                  <th className="pb-2 pr-3">{t("admin:audit.col_action")}</th>
                  <th className="hidden pb-2 pr-3 sm:table-cell">
                    {t("admin:audit.col_type")}
                  </th>
                  <th className="hidden pb-2 pr-3 sm:table-cell">
                    {t("admin:audit.col_entity")}
                  </th>
                  <th className="w-8 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const hasDetails =
                    entry.old_value != null || entry.new_value != null;
                  const isExpanded = expandedIds.has(entry.id);
                  const entityDesc = describeEntity(entry, hour12);
                  return (
                    <Fragment key={entry.id}>
                      <tr className="border-b border-[var(--color-border)]/50">
                        <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">
                          {formatTimestamp(entry.created_at, hour12)}
                        </td>
                        <td className="py-2 pr-3">
                          {entry.username ? (
                            <span className="font-medium">
                              @{entry.username}
                            </span>
                          ) : (
                            <span className="italic text-[var(--color-muted-foreground)]">
                              {t("admin:audit.system")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${actionColor(entry.action)}`}
                          >
                            {t(
                              `admin:${ACTION_LABELS[entry.action] ?? `audit.action_${entry.action}`}`,
                            )}
                          </span>
                        </td>
                        <td className="hidden py-2 pr-3 text-xs text-[var(--color-muted-foreground)] sm:table-cell">
                          {t(
                            `admin:${ENTITY_LABELS[entry.entity_type] ?? `audit.entity_${entry.entity_type}`}`,
                          )}
                        </td>
                        <td
                          className="hidden max-w-[250px] truncate py-2 pr-3 text-xs sm:table-cell"
                          title={entityDesc ?? undefined}
                        >
                          {entityDesc}
                        </td>
                        <td className="py-2 text-center">
                          {hasDetails && (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(entry.id)}
                              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-text-primary)]"
                              aria-label={t("admin:audit.show_details")}
                            >
                              {isExpanded ? "▼" : "▶"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {hasDetails && isExpanded && (
                        <tr className="border-b border-[var(--color-border)]/50">
                          <td
                            colSpan={6}
                            className="bg-[var(--color-muted)]/30 px-4 py-3"
                          >
                            {renderChanges(entry)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

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
              {t("admin:audit.showing", {
                from: (params.offset ?? 0) + 1,
                to: (params.offset ?? 0) + entries.length,
              })}
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
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t("admin:audit.empty")}
        </p>
      )}
    </div>
  );
}
