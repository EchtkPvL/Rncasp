import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useICalTokens, useCreateICalToken, useRevokeICalToken } from "@/hooks/useExport";
import { useEvents } from "@/hooks/useEvents";
import { useTeams } from "@/hooks/useTeams";
import type { ICalToken, CreateICalTokenRequest } from "@/api/types";

export function ICalSettingsPage() {
  const { t } = useTranslation(["settings", "common"]);
  const { data: tokens, isLoading } = useICalTokens();
  const createToken = useCreateICalToken();
  const revokeToken = useRevokeICalToken();
  const { data: events } = useEvents();
  const { data: teams } = useTeams();

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<CreateICalTokenRequest["scope"]>("user");
  const [eventId, setEventId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function resetForm() {
    setShowForm(false);
    setLabel("");
    setScope("user");
    setEventId("");
    setTeamId("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const data: CreateICalTokenRequest = { label, scope };
    if (scope === "event" || scope === "team") data.event_id = eventId;
    if (scope === "team") data.team_id = teamId;

    createToken.mutate(data, { onSuccess: resetForm });
  }

  function handleCopyUrl(token: ICalToken) {
    if (token.url) {
      navigator.clipboard.writeText(token.url);
      setCopiedId(token.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function scopeLabel(token: ICalToken): string {
    switch (token.scope) {
      case "user":
        return t("settings:ical.scope_user");
      case "event":
        return t("settings:ical.scope_event");
      case "team":
        return t("settings:ical.scope_team");
      default:
        return token.scope;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("settings:ical.title")}</h1>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
          >
            + {t("settings:ical.create")}
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--color-muted-foreground)]">{t("settings:ical.description")}</p>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <h3 className="font-medium">{t("settings:ical.create")}</h3>
          <div>
            <label htmlFor="ical-label" className="block text-sm font-medium">{t("settings:ical.label")}</label>
            <input
              id="ical-label"
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder={t("settings:ical.label_placeholder")}
            />
          </div>
          <div>
            <label htmlFor="ical-scope" className="block text-sm font-medium">{t("settings:ical.scope")}</label>
            <select
              id="ical-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as CreateICalTokenRequest["scope"])}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="user">{t("settings:ical.scope_user")}</option>
              <option value="event">{t("settings:ical.scope_event")}</option>
              <option value="team">{t("settings:ical.scope_team")}</option>
            </select>
          </div>
          {(scope === "event" || scope === "team") && (
            <div>
              <label htmlFor="ical-event" className="block text-sm font-medium">{t("settings:ical.event")}</label>
              <select
                id="ical-event"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="">{t("settings:ical.select_event")}</option>
                {events?.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
          )}
          {scope === "team" && (
            <div>
              <label htmlFor="ical-team" className="block text-sm font-medium">{t("settings:ical.team")}</label>
              <select
                id="ical-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="">{t("settings:ical.select_team")}</option>
                {teams?.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)]"
            >
              {t("common:cancel")}
            </button>
            <button
              type="submit"
              disabled={createToken.isPending}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("common:create")}
            </button>
          </div>
        </form>
      )}

      {/* Token list */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:loading")}</p>
      ) : tokens && tokens.length > 0 ? (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="rounded-lg border border-[var(--color-border)] px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{token.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                    {scopeLabel(token)}
                    {token.last_used_at && (
                      <> &middot; {t("settings:ical.last_used")}: {new Date(token.last_used_at).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {token.url && (
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(token)}
                      className="text-sm text-[var(--color-primary)] hover:underline"
                    >
                      {copiedId === token.id ? t("settings:ical.copied") : t("settings:ical.copy_url")}
                    </button>
                  )}
                  {confirmRevoke === token.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        revokeToken.mutate(token.id, { onSuccess: () => setConfirmRevoke(null) });
                      }}
                      disabled={revokeToken.isPending}
                      className="text-sm text-[var(--color-destructive)] hover:underline disabled:opacity-50"
                    >
                      {t("common:confirm")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(token.id)}
                      className="text-sm text-[var(--color-destructive)] hover:underline"
                    >
                      {t("settings:ical.revoke")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("settings:ical.empty")}</p>
      )}
    </div>
  );
}
