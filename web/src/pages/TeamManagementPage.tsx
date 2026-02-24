import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from "@/hooks/useTeams";
import type { Team } from "@/api/types";
import { ApiError } from "@/api/client";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

export function TeamManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { data: teams, isLoading } = useTeams();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [sortOrder, setSortOrder] = useState(0);

  function resetForm() {
    setName("");
    setAbbreviation("");
    setColor("#3B82F6");
    setSortOrder(0);
    setEditing(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(team: Team) {
    setName(team.name);
    setAbbreviation(team.abbreviation);
    setColor(team.color);
    setSortOrder(team.sort_order);
    setEditing(team);
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      if (editing) {
        await updateTeam.mutateAsync({
          id: editing.id,
          data: { name, abbreviation, color, sort_order: sortOrder },
        });
      } else {
        await createTeam.mutateAsync({
          name,
          abbreviation,
          color,
          sort_order: sortOrder,
        });
      }
      resetForm();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.field ? `${err.field}: ${err.message}` : err.message);
      } else {
        setError(t("common:error"));
      }
    }
  }

  function handleDelete(id: string) {
    setDeletingTeamId(id);
  }

  const doDeleteTeam = useCallback(async () => {
    if (!deletingTeamId) return;
    try {
      await deleteTeam.mutateAsync(deletingTeamId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setDeletingTeamId(null);
    }
  }, [deletingTeamId, deleteTeam]);

  async function handleToggleActive(team: Team) {
    try {
      await updateTeam.mutateAsync({
        id: team.id,
        data: { is_active: !team.is_active },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }

  if (isLoading) {
    return <div className="text-[var(--color-muted-foreground)]">{t("common:loading")}</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin:teams.title")}</h1>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)]"
          >
            {t("common:create")}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-[var(--color-destructive-border)] bg-[var(--color-destructive-light)] px-4 py-3 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-[var(--color-border)] p-4">
          <h2 className="text-lg font-semibold">
            {editing ? t("common:edit") : t("common:create")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin:teams.name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin:teams.abbreviation")}</label>
              <input
                type="text"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
                required
                maxLength={10}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin:teams.color")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-[var(--color-border)]"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  pattern="^#[0-9a-fA-F]{6}$"
                  className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Sort Order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createTeam.isPending || updateTeam.isPending}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("common:save")}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
            >
              {t("common:cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        {!teams?.length ? (
          <p className="text-[var(--color-muted-foreground)]">{t("common:no_results")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 font-medium">{t("admin:teams.color")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin:teams.name")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin:teams.abbreviation")}</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <div
                        className="h-6 w-6 rounded"
                        style={{ backgroundColor: team.color }}
                        title={team.color}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{team.name}</td>
                    <td className="px-3 py-2 font-mono">{team.abbreviation}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleToggleActive(team)}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          team.is_active
                            ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                            : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                        }`}
                      >
                        {team.is_active ? t("admin:users.active") : t("admin:users.deactivated")}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(team)}
                          className="text-sm text-[var(--color-primary)] hover:underline"
                        >
                          {t("common:edit")}
                        </button>
                        <button
                          onClick={() => handleDelete(team.id)}
                          className="text-sm text-[var(--color-destructive)] hover:underline"
                        >
                          {t("common:delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingTeamId}
        title={t("common:delete")}
        message={t("admin:teams.delete_confirm")}
        destructive
        loading={deleteTeam.isPending}
        onConfirm={doDeleteTeam}
        onCancel={() => setDeletingTeamId(null)}
      />
    </div>
  );
}
