import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Team } from "@/api/types";

export type GridView = "everything" | "by_team" | "my_shifts" | "per_user";

interface UserOption {
  id: string;
  name: string;
  username: string;
}

interface ViewSelectorProps {
  view: GridView;
  onViewChange: (view: GridView) => void;
  teams?: Team[];
  selectedTeamId?: string;
  onTeamChange?: (teamId: string) => void;
  users?: UserOption[];
  selectedUserIds?: string[];
  onUserChange?: (userIds: string[]) => void;
}

export function ViewSelector({
  view,
  onViewChange,
  teams,
  selectedTeamId,
  onTeamChange,
  users,
  selectedUserIds = [],
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
        <UserMultiSelect
          users={users}
          selectedIds={selectedUserIds}
          onChange={(ids) => onUserChange?.(ids)}
          placeholder={t("events:search_user")}
        />
      )}
    </div>
  );
}

interface UserMultiSelectProps {
  users: UserOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}

function UserMultiSelect({ users, selectedIds, onChange, placeholder }: UserMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = query
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.username.toLowerCase().includes(query.toLowerCase()),
      )
    : users;

  const toggle = useCallback(
    (id: string) => {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((sid) => sid !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    },
    [selectedIds, onChange],
  );

  const removeUser = useCallback(
    (id: string) => {
      onChange(selectedIds.filter((sid) => sid !== id));
    },
    [selectedIds, onChange],
  );

  const selectedUsers = users.filter((u) => selectedIds.includes(u.id));

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips + search input */}
      <div
        className="flex min-w-[200px] max-w-[320px] flex-wrap items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {selectedUsers.map((u) => (
          <span
            key={u.id}
            className="flex items-center gap-1 rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-xs"
          >
            {u.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeUser(u.id);
              }}
              className="ml-0.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={selectedUsers.length === 0 ? placeholder : ""}
          className="min-w-[80px] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
        />
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-lg">
          {filtered.map((u) => {
            const isSelected = selectedIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  toggle(u.id);
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--color-muted)] ${
                  isSelected ? "font-medium" : ""
                }`}
              >
                <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isSelected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "border-[var(--color-border)]"
                }`}>
                  {isSelected && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{u.name}</span>
                <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">@{u.username}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
