import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useDummyAccounts, useCreateDummy, useUpdateDummy, useDeleteDummy } from "@/hooks/useUsers";
import type { User } from "@/api/types";

export function DummyAccountsPage() {
  const { t } = useTranslation(["common", "admin"]);
  const { data: dummies, isLoading } = useDummyAccounts();
  const createDummy = useCreateDummy();
  const updateDummy = useUpdateDummy();
  const deleteDummy = useDeleteDummy();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function resetForm() {
    setShowForm(false);
    setEditing(null);
    setUsername("");
    setFullName("");
    setDisplayName("");
  }

  function startEdit(user: User) {
    setEditing(user);
    setShowForm(true);
    setUsername(user.username);
    setFullName(user.full_name);
    setDisplayName(user.display_name ?? "");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (editing) {
      updateDummy.mutate(
        { userId: editing.id, data: { full_name: fullName, display_name: displayName || undefined } },
        { onSuccess: resetForm },
      );
    } else {
      createDummy.mutate(
        { username, full_name: fullName, display_name: displayName || undefined },
        { onSuccess: resetForm },
      );
    }
  }

  function handleDelete(userId: string) {
    deleteDummy.mutate(userId, { onSuccess: () => setConfirmDelete(null) });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin:dummy.title")}</h1>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
          >
            + {t("admin:dummy.add")}
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin:dummy.description")}</p>

      {/* Create/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <h3 className="font-medium">{editing ? t("admin:dummy.edit") : t("admin:dummy.add")}</h3>
          {!editing && (
            <div>
              <label htmlFor="dummy-username" className="block text-sm font-medium">{t("admin:dummy.username")}</label>
              <input
                id="dummy-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label htmlFor="dummy-fullname" className="block text-sm font-medium">{t("admin:dummy.full_name")}</label>
            <input
              id="dummy-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="dummy-displayname" className="block text-sm font-medium">{t("admin:dummy.display_name")}</label>
            <input
              id="dummy-displayname"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder={t("common:optional")}
            />
          </div>
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
              disabled={createDummy.isPending || updateDummy.isPending}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("common:save")}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:loading")}</p>
      ) : dummies && dummies.length > 0 ? (
        <div className="space-y-2">
          {dummies.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium italic">
                  {user.display_name || user.full_name}
                  <span className="ml-2 text-xs font-normal text-[var(--color-muted-foreground)]">@{user.username}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(user)}
                  className="text-sm text-[var(--color-primary)] hover:underline"
                >
                  {t("common:edit")}
                </button>
                {confirmDelete === user.id ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(user.id)}
                    disabled={deleteDummy.isPending}
                    className="text-sm text-[var(--color-destructive)] hover:underline disabled:opacity-50"
                  >
                    {t("common:confirm")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(user.id)}
                    className="text-sm text-[var(--color-destructive)] hover:underline"
                  >
                    {t("common:delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin:dummy.empty")}</p>
      )}
    </div>
  );
}
