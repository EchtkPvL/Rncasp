import { useTranslation } from "react-i18next";
import type { Team } from "@/api/types";

export type GridView = "everything" | "by_team" | "my_shifts" | "per_user";

interface UserOption {
  id: string;
  name: string;
}

interface ViewSelectorProps {
  view: GridView;
  onViewChange: (view: GridView) => void;
  teams?: Team[];
  selectedTeamId?: string;
  onTeamChange?: (teamId: string) => void;
  users?: UserOption[];
  selectedUserId?: string;
  onUserChange?: (userId: string) => void;
}

export function ViewSelector({
  view,
  onViewChange,
  teams,
  selectedTeamId,
  onTeamChange,
  users,
  selectedUserId,
  onUserChange,
}: ViewSelectorProps) {
  const { t } = useTranslation(["shifts", "events"]);

  const views: { key: GridView; label: string }[] = [
    { key: "everything", label: t("shifts:views.everything") },
    { key: "by_team", label: t("shifts:views.by_team") },
    { key: "my_shifts", label: t("shifts:views.my_shifts") },
    { key: "per_user", label: t("events:per_user") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-[var(--color-border)]">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onViewChange(v.key)}
            className={`px-3 py-1.5 text-sm transition-colors ${
              view === v.key
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "hover:bg-[var(--color-muted)]"
            } ${v.key !== views[0].key ? "border-l border-[var(--color-border)]" : ""}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "by_team" && teams && teams.length > 0 && (
        <select
          value={selectedTeamId || ""}
          onChange={(e) => onTeamChange?.(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        >
          <option value="">{t("shifts:views.everything")}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      )}

      {view === "per_user" && users && users.length > 0 && (
        <select
          value={selectedUserId || ""}
          onChange={(e) => onUserChange?.(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        >
          <option value="">{t("events:select_user")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
