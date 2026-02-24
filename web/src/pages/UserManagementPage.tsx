import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useUsers, useSearchUsers, useUpdateUser } from "@/hooks/useUsers";
import { ApiError } from "@/api/client";
import type { User } from "@/api/types";

export function UserManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: allUsers, isLoading } = useUsers({ role: roleFilter || undefined, limit: 200 });
  const { data: searchResults } = useSearchUsers(search);
  const updateUser = useUpdateUser();

  const users = search.length >= 1 ? searchResults : allUsers;

  async function handleRoleChange(user: User, newRole: string) {
    setError("");
    try {
      await updateUser.mutateAsync({ userId: user.id, data: { role: newRole } });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleToggleActive(user: User) {
    setError("");
    try {
      await updateUser.mutateAsync({ userId: user.id, data: { is_active: !user.is_active } });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin:users.title")}</h1>
        <Link
          to="/admin/dummy-accounts"
          className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)]"
        >
          {t("common:nav.dummy_accounts")}
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive-border)] bg-[var(--color-destructive-light)] px-4 py-3 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common:search") + "..."}
          className="flex-1 min-w-[200px] rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="">{t("admin:users.all_roles", "All roles")}</option>
          <option value="super_admin">{t("admin:users.roles.super_admin")}</option>
          <option value="user">{t("admin:users.roles.user")}</option>
          <option value="read_only">{t("admin:users.roles.read_only")}</option>
        </select>
      </div>

      {/* User list */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:loading")}</p>
      ) : users && users.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.username", "Username")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.full_name", "Full Name")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.type", "Type")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.role")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.status", "Status")}</th>
                <th className="px-4 py-2.5 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--color-muted)]/50">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">@{user.username}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {user.display_name || user.full_name}
                    {user.email && (
                      <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">{user.email}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      user.account_type === "dummy"
                        ? "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                        : user.account_type === "oauth"
                        ? "bg-[var(--color-info-light)] text-[var(--color-info)]"
                        : "bg-[var(--color-success-light)] text-[var(--color-success)]"
                    }`}>
                      {user.account_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {user.account_type === "dummy" ? (
                      <span className="text-xs text-[var(--color-muted-foreground)]">—</span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        disabled={updateUser.isPending}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs"
                      >
                        <option value="super_admin">{t("admin:users.roles.super_admin")}</option>
                        <option value="user">{t("admin:users.roles.user")}</option>
                        <option value="read_only">{t("admin:users.roles.read_only")}</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {user.account_type === "dummy" ? (
                      <span className="text-xs text-[var(--color-muted-foreground)]">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(user)}
                        disabled={updateUser.isPending}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                          user.is_active ? "bg-[var(--color-success)]" : "bg-[var(--color-muted)]"
                        }`}
                        title={user.is_active ? t("admin:users.active") : t("admin:users.deactivated")}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                            user.is_active ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setEditingUser(user)}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {t("common:edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:no_results")}</p>
      )}

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

function EditUserDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation(["admin", "common"]);
  const updateUser = useUpdateUser();
  const [fullName, setFullName] = useState(user.full_name);
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data: Record<string, string> = {};
      if (fullName !== user.full_name) data.full_name = fullName;
      if (displayName !== (user.display_name || "")) data.display_name = displayName;
      if (email !== (user.email || "")) data.email = email;
      if (password) data.password = password;

      if (Object.keys(data).length === 0) {
        onClose();
        return;
      }

      await updateUser.mutateAsync({ userId: user.id, data });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{t("admin:users.edit_user")} — @{user.username}</h2>

        {error && (
          <div className="mt-3 rounded-md bg-[var(--color-destructive-light)] p-2 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium">{t("admin:users.full_name")}</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{t("admin:users.display_name")}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("common:optional")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{t("admin:users.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("common:optional")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{t("admin:users.new_password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("admin:users.password_placeholder")}
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            {password.length > 0 && password.length < 8 && (
              <p className="mt-1 text-xs text-[var(--color-warning)]">{t("common:auth.weak_password")}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)]"
            >
              {t("common:cancel")}
            </button>
            <button
              type="submit"
              disabled={updateUser.isPending}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("common:save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
