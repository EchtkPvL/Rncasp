import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useUsers, useSearchUsers, useUpdateUser, useCreateUser, useDeleteDummy, useDisableUserTotp } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/client";
import type { User } from "@/api/types";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

const PAGE_SIZE = 50;

export function UserManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("");
  const [hideDummy, setHideDummy] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingSelfRole, setPendingSelfRole] = useState<{ user: User; role: string } | null>(null);
  const [pendingSelfDeactivate, setPendingSelfDeactivate] = useState<User | null>(null);

  const deleteDummy = useDeleteDummy();
  const updateUser = useUpdateUser();

  const effectiveExclude = hideDummy && !accountTypeFilter ? "dummy" : undefined;

  const { data: listResult, isLoading } = useUsers({
    role: roleFilter || undefined,
    account_type: accountTypeFilter || undefined,
    exclude_account_type: effectiveExclude,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const { data: searchResults } = useSearchUsers(search);

  const users = search.length >= 1 ? searchResults : listResult?.users;
  const total = listResult?.total ?? 0;
  const isSearching = search.length >= 1;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const hasNext = (page + 1) * PAGE_SIZE < total;
  const hasPrev = page > 0;

  async function handleRoleChange(user: User, newRole: string) {
    if (user.id === currentUser?.id && newRole !== user.role) {
      setPendingSelfRole({ user, role: newRole });
      return;
    }
    await doRoleChange(user, newRole);
  }

  async function doRoleChange(user: User, newRole: string) {
    setError("");
    try {
      await updateUser.mutateAsync({ userId: user.id, data: { role: newRole } });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleToggleActive(user: User) {
    if (user.id === currentUser?.id && user.is_active) {
      setPendingSelfDeactivate(user);
      return;
    }
    await doToggleActive(user);
  }

  async function doToggleActive(user: User) {
    setError("");
    try {
      await updateUser.mutateAsync({ userId: user.id, data: { is_active: !user.is_active } });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  function handleDelete(userId: string) {
    deleteDummy.mutate(userId, {
      onSuccess: () => setConfirmDelete(null),
      onError: (err) => {
        if (err instanceof ApiError) setError(err.message);
        setConfirmDelete(null);
      },
    });
  }

  // Reset page when filters change
  function handleRoleFilterChange(value: string) {
    setRoleFilter(value);
    setPage(0);
  }
  function handleAccountTypeFilterChange(value: string) {
    setAccountTypeFilter(value);
    setPage(0);
  }
  function handleHideDummyChange(checked: boolean) {
    setHideDummy(checked);
    setPage(0);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin:users.title")}</h1>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
        >
          + {t("admin:users.create_user")}
        </button>
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
          onChange={(e) => handleRoleFilterChange(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="">{t("admin:users.all_roles")}</option>
          <option value="super_admin">{t("admin:users.roles.super_admin")}</option>
          <option value="user">{t("admin:users.roles.user")}</option>
          <option value="read_only">{t("admin:users.roles.read_only")}</option>
        </select>
        <select
          value={accountTypeFilter}
          onChange={(e) => handleAccountTypeFilterChange(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="">{t("admin:users.all_types")}</option>
          <option value="local">local</option>
          <option value="oauth">oauth</option>
          <option value="dummy">dummy</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={hideDummy}
            onChange={(e) => handleHideDummyChange(e.target.checked)}
            disabled={accountTypeFilter !== ""}
            className="rounded"
          />
          {t("admin:users.hide_dummy")}
        </label>
      </div>

      {/* User list */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:loading")}</p>
      ) : users && users.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.username")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.full_name")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.type")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.role")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("admin:users.status")}</th>
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
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(user)}
                      disabled={updateUser.isPending}
                      className={`touch-compact relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
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
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(user)}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {t("common:edit")}
                      </button>
                      {user.account_type === "dummy" && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(user.id)}
                            className="text-xs text-[var(--color-destructive)] hover:underline"
                          >
                            {t("common:delete")}
                          </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("common:no_results")}</p>
      )}

      {/* Pagination */}
      {!isSearching && total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-muted-foreground)]">
            {t("admin:users.showing", { from, to, total })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-50"
            >
              {t("admin:users.prev_page")}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-50"
            >
              {t("admin:users.next_page")}
            </button>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Create User Dialog */}
      {showCreateDialog && (
        <CreateUserDialog onClose={() => setShowCreateDialog(false)} />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("common:delete")}
        message={t("admin:users.delete_confirm")}
        destructive
        loading={deleteDummy.isPending}
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete); }}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={pendingSelfRole !== null}
        title={t("admin:users.role")}
        message={t("admin:users.self_role_warning")}
        destructive
        onConfirm={() => {
          if (pendingSelfRole) doRoleChange(pendingSelfRole.user, pendingSelfRole.role);
          setPendingSelfRole(null);
        }}
        onCancel={() => setPendingSelfRole(null)}
      />

      <ConfirmDialog
        open={pendingSelfDeactivate !== null}
        title={t("admin:users.status")}
        message={t("admin:users.self_deactivate_warning")}
        destructive
        onConfirm={() => {
          if (pendingSelfDeactivate) doToggleActive(pendingSelfDeactivate);
          setPendingSelfDeactivate(null);
        }}
        onCancel={() => setPendingSelfDeactivate(null)}
      />
    </div>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["admin", "common"]);
  const createUser = useCreateUser();
  const [accountType, setAccountType] = useState<"local" | "dummy">("local");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (accountType === "local" && password !== confirmPassword) {
      setError(t("common:auth.passwords_mismatch"));
      return;
    }
    try {
      await createUser.mutateAsync({
        account_type: accountType,
        username,
        full_name: fullName,
        display_name: displayName || undefined,
        email: email || undefined,
        password: accountType === "local" ? password : undefined,
        role,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{t("admin:users.create_user_title")}</h2>

        {error && (
          <div className="mt-3 rounded-md bg-[var(--color-destructive-light)] p-2 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {/* Account type toggle */}
          <div>
            <label className="block text-sm font-medium">{t("admin:users.account_type")}</label>
            <div className="mt-1 flex rounded-md border border-[var(--color-border)] overflow-hidden">
              <button
                type="button"
                onClick={() => setAccountType("local")}
                className={`flex-1 px-3 py-1.5 text-sm ${
                  accountType === "local"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "bg-[var(--color-background)] hover:bg-[var(--color-muted)]"
                }`}
              >
                {t("admin:users.type_regular")}
              </button>
              <button
                type="button"
                onClick={() => setAccountType("dummy")}
                className={`flex-1 px-3 py-1.5 text-sm ${
                  accountType === "dummy"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "bg-[var(--color-background)] hover:bg-[var(--color-muted)]"
                }`}
              >
                {t("admin:users.type_dummy")}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">{t("admin:users.username")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">{t("admin:users.full_name")}</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
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

          {accountType === "local" && (
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
          )}

          {accountType === "local" && (
            <>
              <div>
                <label className="block text-sm font-medium">{t("admin:users.password")}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                {password.length > 0 && password.length < 8 && (
                  <p className="mt-1 text-xs text-[var(--color-warning)]">{t("common:auth.weak_password")}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium">{t("common:auth.confirm_password")}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={`mt-1 block w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm ${
                    confirmPassword && confirmPassword !== password
                      ? "border-[var(--color-destructive)]"
                      : "border-[var(--color-border)]"
                  }`}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-xs text-[var(--color-destructive)]">{t("common:auth.passwords_mismatch")}</p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium">{t("admin:users.role")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="user">{t("admin:users.roles.user")}</option>
              <option value="super_admin">{t("admin:users.roles.super_admin")}</option>
              <option value="read_only">{t("admin:users.roles.read_only")}</option>
            </select>
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
              disabled={createUser.isPending}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("common:create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation(["admin", "common"]);
  const updateUser = useUpdateUser();
  const disableTotp = useDisableUserTotp();
  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.full_name);
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState(user.account_type);
  const [error, setError] = useState("");
  const [showTotpConfirm, setShowTotpConfirm] = useState(false);

  const isConvertingToLocal = accountType === "local" && user.account_type === "dummy";
  const isConvertingToDummy = accountType === "dummy" && user.account_type !== "dummy";
  const isOAuth = user.account_type === "oauth";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password && password !== confirmPassword) {
      setError(t("common:auth.passwords_mismatch"));
      return;
    }
    try {
      const data: Record<string, unknown> = {};
      if (username !== user.username) data.username = username;
      if (fullName !== user.full_name) data.full_name = fullName;
      if (displayName !== (user.display_name || "")) data.display_name = displayName;
      if (email !== (user.email || "")) data.email = email;
      if (password) data.password = password;
      if (accountType !== user.account_type) data.account_type = accountType;

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
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{t("admin:users.edit_user")} — @{user.username}</h2>

        {error && (
          <div className="mt-3 rounded-md bg-[var(--color-destructive-light)] p-2 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium">{t("admin:users.username")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>
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

          {/* Account type (only for local/dummy, not oauth) */}
          {!isOAuth && (
            <div>
              <label className="block text-sm font-medium">{t("admin:users.account_type")}</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as "local" | "dummy")}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="local">local</option>
                <option value="dummy">dummy</option>
              </select>
              {isConvertingToLocal && (
                <p className="mt-1 text-xs text-[var(--color-info)]">
                  {t("admin:users.convert_to_local")}
                </p>
              )}
              {isConvertingToDummy && (
                <p className="mt-1 text-xs text-[var(--color-warning-foreground)]">
                  {t("admin:users.convert_to_dummy")}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium">{t("admin:users.new_password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("admin:users.password_placeholder")}
              autoComplete="new-password"
              required={isConvertingToLocal}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            {password.length > 0 && password.length < 8 && (
              <p className="mt-1 text-xs text-[var(--color-warning)]">{t("common:auth.weak_password")}</p>
            )}
          </div>

          {password && (
            <div>
              <label className="block text-sm font-medium">{t("common:auth.confirm_password")}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={`mt-1 block w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm ${
                  confirmPassword && confirmPassword !== password
                    ? "border-[var(--color-destructive)]"
                    : "border-[var(--color-border)]"
                }`}
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1 text-xs text-[var(--color-destructive)]">{t("common:auth.passwords_mismatch")}</p>
              )}
            </div>
          )}

          {/* Admin disable 2FA */}
          {user.totp_enabled && (
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("admin:security.totp_title")}</p>
                  <p className="text-xs text-[var(--color-success)]">{t("admin:security.totp_enabled")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTotpConfirm(true)}
                  className="rounded-md border border-[var(--color-destructive-border)] px-2.5 py-1 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-destructive-light)]"
                >
                  {t("admin:users.disable_totp")}
                </button>
              </div>
            </div>
          )}

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

        <ConfirmDialog
          open={showTotpConfirm}
          title={t("admin:users.disable_totp")}
          message={t("admin:users.disable_totp_confirm")}
          destructive
          loading={disableTotp.isPending}
          onConfirm={() => {
            disableTotp.mutate(user.id, {
              onSuccess: () => {
                setShowTotpConfirm(false);
                onClose();
              },
              onError: (err) => {
                setShowTotpConfirm(false);
                if (err instanceof ApiError) setError(err.message);
              },
            });
          }}
          onCancel={() => setShowTotpConfirm(false)}
        />
      </div>
    </div>
  );
}
