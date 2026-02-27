import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/api/client";
import { eventsApi } from "@/api/events";
import { shiftsApi } from "@/api/shifts";
import { WebhookManager } from "@/components/webhooks/WebhookManager";
import {
  useEvent,
  useUpdateEvent,
  useDeleteEvent,
  useSetEventLocked,
  useSetEventPublic,
  useEventTeams,
  useEventAdmins,
  useEventPinnedUsers,
  useEventHiddenRanges,
} from "@/hooks/useEvents";
import { useTeams } from "@/hooks/useTeams";
import { useSearchUsers } from "@/hooks/useUsers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { snapToGranularity } from "@/lib/time";
import { DateTimePicker } from "@/components/common/DateTimePicker";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

export function EventSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation(["events", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === "super_admin";

  const { data: event, isLoading } = useEvent(slug!);
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const setLocked = useSetEventLocked();
  const setPublic = useSetEventPublic();
  const { data: eventTeams } = useEventTeams(slug!);
  const { data: eventAdmins } = useEventAdmins(slug!, isSuperAdmin);
  const { data: pinnedUsers } = useEventPinnedUsers(slug!);
  const { data: hiddenRanges } = useEventHiddenRanges(slug!);
  const { data: allTeams } = useTeams();
  const { data: coverageList } = useQuery({
    queryKey: ["events", slug!, "coverage"],
    queryFn: async () => {
      const res = await shiftsApi.listCoverage(slug!);
      return res.data!;
    },
    enabled: !!slug,
  });

  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Confirmation dialog state for critical actions
  const [confirmAction, setConfirmAction] = useState<{
    type: "coverage" | "coverageByTeam" | "removeTeam" | "removeAdmin" | "removePinnedUser" | "removeHiddenRange";
    id: string;
    label?: string;
  } | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);

  // Hidden range form
  const [newHideStart, setNewHideStart] = useState(0);
  const [newHideEnd, setNewHideEnd] = useState(6);

  // Admin form
  const [adminSearch, setAdminSearch] = useState("");
  const [adminSelectedId, setAdminSelectedId] = useState("");
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);
  const { data: adminSearchResults } = useSearchUsers(adminSearch);

  // Pinned user form
  const [pinnedSearch, setPinnedSearch] = useState("");
  const [pinnedSelectedId, setPinnedSelectedId] = useState("");
  const [pinnedDropdownOpen, setPinnedDropdownOpen] = useState(false);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const { data: pinnedSearchResults } = useSearchUsers(pinnedSearch);

  // Coverage form (add new)
  const [covTeamId, setCovTeamId] = useState("");
  const [covStartTime, setCovStartTime] = useState("");
  const [covEndTime, setCovEndTime] = useState("");
  const [covCount, setCovCount] = useState(1);

  // Coverage edit state (editing existing)
  const [editingCovId, setEditingCovId] = useState<string | null>(null);
  const [editCovTeamId, setEditCovTeamId] = useState("");
  const [editCovStart, setEditCovStart] = useState("");
  const [editCovEnd, setEditCovEnd] = useState("");
  const [editCovCount, setEditCovCount] = useState(1);

  const doDelete = useCallback(async () => {
    try {
      await deleteEvent.mutateAsync(slug!);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setShowDeleteConfirm(false);
    }
  }, [deleteEvent, slug, navigate]);

  // Close admin/pinned dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminDropdownOpen(false);
      }
      if (pinnedRef.current && !pinnedRef.current.contains(e.target as Node)) {
        setPinnedDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) {
    return <p className="text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  if (!event) {
    return <p className="text-[var(--color-muted-foreground)]">{t("events:not_found")}</p>;
  }

  const isEventAdmin = event.is_event_admin ?? false;
  const canAccessSettings = isSuperAdmin || isEventAdmin;

  if (!canAccessSettings) {
    return (
      <div className="space-y-4">
        <Link to={`/events/${slug}`} className="text-sm text-[var(--color-primary)] hover:underline">
          {t("common:back")}
        </Link>
        <p className="text-[var(--color-muted-foreground)]">{t("common:access_denied")}</p>
      </div>
    );
  }

  function startEditDetails() {
    if (!event) return;
    setEditName(event.name);
    setEditSlug(event.slug);
    setEditDescription(event.description ?? "");
    setEditLocation(event.location ?? "");
    setEditingDetails(true);
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data: Record<string, unknown> = {};
      if (editName !== event!.name) data.name = editName;
      if (editSlug !== event!.slug) data.slug = editSlug;
      // Send empty string to clear; omit to keep current value
      if (editDescription !== (event!.description ?? "")) data.description = editDescription;
      if (editLocation !== (event!.location ?? "")) data.location = editLocation;

      if (Object.keys(data).length === 0) {
        setEditingDetails(false);
        return;
      }

      await updateEvent.mutateAsync({ slug: slug!, data });
      setEditingDetails(false);
      // Navigate to new slug if it changed
      if (data.slug && data.slug !== slug) {
        navigate(`/events/${data.slug}/settings`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  function handleDelete() {
    setShowDeleteConfirm(true);
  }

  async function toggleLock() {
    setError("");
    try {
      await setLocked.mutateAsync({ slug: slug!, is_locked: !event!.is_locked });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function togglePublic() {
    setError("");
    try {
      await setPublic.mutateAsync({ slug: slug!, is_public: !event!.is_public });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleSetTeam(teamId: string, isVisible: boolean) {
    setError("");
    try {
      await eventsApi.setTeam(slug!, teamId, isVisible);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "teams"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleRemoveTeam(teamId: string) {
    setError("");
    try {
      await eventsApi.removeTeam(slug!, teamId);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "teams"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminSelectedId) return;
    setError("");
    try {
      await eventsApi.addAdmin(slug!, adminSelectedId);
      setAdminSearch("");
      setAdminSelectedId("");
      setAdminDropdownOpen(false);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "admins"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleRemoveAdmin(userId: string) {
    setError("");
    try {
      await eventsApi.removeAdmin(slug!, userId);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "admins"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleAddPinnedUser(e: React.FormEvent) {
    e.preventDefault();
    if (!pinnedSelectedId) return;
    setError("");
    try {
      await eventsApi.addPinnedUser(slug!, pinnedSelectedId);
      setPinnedSearch("");
      setPinnedSelectedId("");
      setPinnedDropdownOpen(false);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "pinned-users"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleRemovePinnedUser(userId: string) {
    setError("");
    try {
      await eventsApi.removePinnedUser(slug!, userId);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "pinned-users"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleAddHiddenRange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const existing = (hiddenRanges ?? []).map((r) => ({
      hide_start_hour: r.hide_start_hour,
      hide_end_hour: r.hide_end_hour,
    }));
    try {
      await eventsApi.setHiddenRanges(slug!, [
        ...existing,
        { hide_start_hour: newHideStart, hide_end_hour: newHideEnd },
      ]);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "hidden-ranges"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleRemoveHiddenRange(index: number) {
    setError("");
    const remaining = (hiddenRanges ?? [])
      .filter((_, i) => i !== index)
      .map((r) => ({
        hide_start_hour: r.hide_start_hour,
        hide_end_hour: r.hide_end_hour,
      }));
    try {
      await eventsApi.setHiddenRanges(slug!, remaining);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "hidden-ranges"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  // Convert ISO datetime to datetime-local input value (YYYY-MM-DDTHH:MM)
  function toLocalInput(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Event time bounds for datetime-local min/max
  const eventMinTime = event ? toLocalInput(event.start_time) : "";
  const eventMaxTime = event ? toLocalInput(event.end_time) : "";
  const covSnap = (v: string) => event ? snapToGranularity(v, event.time_granularity) : v;

  async function handleAddCoverage(e: React.FormEvent) {
    e.preventDefault();
    const startVal = covStartTime || eventMinTime;
    const endVal = covEndTime || eventMaxTime;
    if (!covTeamId || !startVal || !endVal) return;
    setError("");
    try {
      await shiftsApi.createCoverage(slug!, {
        team_id: covTeamId,
        start_time: new Date(startVal).toISOString(),
        end_time: new Date(endVal).toISOString(),
        required_count: covCount,
      });
      setCovTeamId("");
      setCovStartTime("");
      setCovEndTime("");
      setCovCount(1);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "coverage"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  function startEditCoverage(cov: { id: string; team_id: string; start_time: string; end_time: string; required_count: number }) {
    setEditingCovId(cov.id);
    setEditCovTeamId(cov.team_id);
    setEditCovStart(toLocalInput(cov.start_time));
    setEditCovEnd(toLocalInput(cov.end_time));
    setEditCovCount(cov.required_count);
  }

  async function handleUpdateCoverage(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCovId) return;
    setError("");
    try {
      await shiftsApi.updateCoverage(slug!, editingCovId, {
        team_id: editCovTeamId,
        start_time: new Date(editCovStart).toISOString(),
        end_time: new Date(editCovEnd).toISOString(),
        required_count: editCovCount,
      });
      setEditingCovId(null);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "coverage"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleDeleteCoverage(coverageId: string) {
    setError("");
    try {
      await shiftsApi.deleteCoverage(slug!, coverageId);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "coverage"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleDeleteCoverageByTeam(teamId: string) {
    setError("");
    try {
      await shiftsApi.deleteCoverageByTeam(slug!, teamId);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "coverage"] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function executeConfirmAction() {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case "coverage":
        await handleDeleteCoverage(confirmAction.id);
        break;
      case "coverageByTeam":
        await handleDeleteCoverageByTeam(confirmAction.id);
        break;
      case "removeTeam":
        await handleRemoveTeam(confirmAction.id);
        break;
      case "removeAdmin":
        await handleRemoveAdmin(confirmAction.id);
        break;
      case "removePinnedUser":
        await handleRemovePinnedUser(confirmAction.id);
        break;
      case "removeHiddenRange":
        await handleRemoveHiddenRange(parseInt(confirmAction.id));
        break;
    }
    setConfirmAction(null);
  }

  // Teams not yet assigned to this event
  const assignedTeamIds = new Set((eventTeams ?? []).map((et) => et.team_id));
  const unassignedTeams = (allTeams ?? []).filter((t) => !assignedTeamIds.has(t.id));

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <Link to={`/events/${slug}`} className="text-sm text-[var(--color-primary)] hover:underline">
          {t("common:back")}
        </Link>
      </div>

      <h1 className="text-2xl font-bold">{t("events:settings")}: {event.name}</h1>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive-border)] bg-[var(--color-destructive-light)] px-4 py-3 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {/* Event Details Section */}
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("events:details")}</h2>
          {!editingDetails && (
            <button onClick={startEditDetails} className="text-sm text-[var(--color-primary)] hover:underline">
              {t("common:edit")}
            </button>
          )}
        </div>
        {editingDetails ? (
          <form onSubmit={saveDetails} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:name")}</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:slug")}</label>
              <input type="text" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} required
                pattern="[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*"
                title={t("events:slug_hint")}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono" />
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{t("events:slug_hint")}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:description")}</label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:location")}</label>
              <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={updateEvent.isPending}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50">
                {t("common:save")}
              </button>
              <button type="button" onClick={() => setEditingDetails(false)}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm">
                {t("common:cancel")}
              </button>
            </div>
          </form>
        ) : (
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-[var(--color-muted-foreground)]">{t("events:slug")}</dt><dd className="font-mono">{event.slug}</dd></div>
            <div><dt className="text-[var(--color-muted-foreground)]">{t("events:description")}</dt><dd>{event.description || "—"}</dd></div>
            <div><dt className="text-[var(--color-muted-foreground)]">{t("events:location")}</dt><dd>{event.location || "—"}</dd></div>
            <div><dt className="text-[var(--color-muted-foreground)]">{t("events:granularity")}</dt><dd>{event.time_granularity}</dd></div>
          </dl>
        )}
      </section>

      {/* Lock / Public Toggles — super admin only */}
      {isSuperAdmin && (
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("events:access_control")}</h2>
        <div className="mt-3 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{t("events:lock_event")}</h3>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {event.is_locked ? t("events:locked_on") : t("events:locked_off")}
              </p>
            </div>
            <button
              onClick={toggleLock}
              disabled={setLocked.isPending}
              className={`touch-compact relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                event.is_locked ? "bg-[var(--color-destructive)]" : "bg-[var(--color-muted)]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  event.is_locked ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{t("events:public_access")}</h3>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {event.is_public ? t("events:public_on") : t("events:public_off")}
              </p>
            </div>
            <button
              onClick={togglePublic}
              disabled={setPublic.isPending}
              className={`touch-compact relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                event.is_public ? "bg-[var(--color-primary)]" : "bg-[var(--color-muted)]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  event.is_public ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </section>
      )}

      {/* Team Visibility */}
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("events:teams")}</h2>
        <div className="mt-3 space-y-2">
          {eventTeams?.map((et) => (
            <div key={et.team_id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded" style={{ backgroundColor: et.team_color }} />
                <span className="text-sm font-medium">{et.team_name}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">({et.team_abbreviation})</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={et.is_visible}
                    onChange={(e) => handleSetTeam(et.team_id, e.target.checked)}
                  />
                  {t("events:visible")}
                </label>
                <button onClick={() => setConfirmAction({ type: "removeTeam", id: et.team_id, label: et.team_name })} className="text-xs text-[var(--color-destructive)] hover:underline">
                  {t("events:remove")}
                </button>
              </div>
            </div>
          ))}
          {unassignedTeams.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-[var(--color-muted-foreground)]">{t("events:add_team")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {unassignedTeams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => handleSetTeam(team.id, true)}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-muted)]"
                  >
                    <div className="h-3 w-3 rounded" style={{ backgroundColor: team.color }} />
                    {team.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Event Admins — super admin only */}
      {isSuperAdmin && (
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("events:admins")}</h2>
        <div className="mt-3 space-y-2">
          {eventAdmins?.map((admin) => (
            <div key={admin.user_id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
              <div className="text-sm">
                <span className="font-medium">{admin.full_name}</span>
                <span className="ml-2 text-[var(--color-muted-foreground)]">@{admin.username}</span>
              </div>
              <button onClick={() => setConfirmAction({ type: "removeAdmin", id: admin.user_id, label: admin.full_name })} className="text-xs text-[var(--color-destructive)] hover:underline">
                {t("events:remove")}
              </button>
            </div>
          ))}
          <form onSubmit={handleAddAdmin} className="flex gap-2">
            <div ref={adminRef} className="relative flex-1">
              <input
                type="text"
                value={adminSearch}
                onChange={(e) => {
                  setAdminSearch(e.target.value);
                  setAdminSelectedId("");
                  setAdminDropdownOpen(e.target.value.length >= 1);
                }}
                onFocus={() => { if (adminSearch.length >= 1) setAdminDropdownOpen(true); }}
                placeholder={t("events:search_user")}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
              />
              {adminDropdownOpen && adminSearchResults && adminSearchResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg">
                  {adminSearchResults
                    .filter((u) => !eventAdmins?.some((a) => a.user_id === u.id))
                    .map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setAdminSelectedId(u.id);
                            setAdminSearch(`@${u.username} — ${u.full_name}`);
                            setAdminDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                        >
                          <span className="font-medium">@{u.username}</span>
                          <span className="text-[var(--color-muted-foreground)]">{u.full_name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              disabled={!adminSelectedId}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("events:add")}
            </button>
          </form>
        </div>
      </section>
      )}

      {/* Pinned Users */}
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("events:pinned_users")}</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          {t("events:pinned_users_description")}
        </p>
        <div className="mt-3 space-y-2">
          {pinnedUsers && pinnedUsers.length > 0 ? (
            pinnedUsers.map((pu) => (
              <div key={pu.user_id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{pu.display_name || pu.full_name}</span>
                  <span className="ml-2 text-[var(--color-muted-foreground)]">@{pu.username}</span>
                </div>
                <button onClick={() => setConfirmAction({ type: "removePinnedUser", id: pu.user_id, label: pu.display_name || pu.full_name })} className="text-xs text-[var(--color-destructive)] hover:underline">
                  {t("events:remove")}
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">{t("events:no_pinned_users")}</p>
          )}
          <form onSubmit={handleAddPinnedUser} className="flex gap-2">
            <div ref={pinnedRef} className="relative flex-1">
              <input
                type="text"
                value={pinnedSearch}
                onChange={(e) => {
                  setPinnedSearch(e.target.value);
                  setPinnedSelectedId("");
                  setPinnedDropdownOpen(e.target.value.length >= 1);
                }}
                onFocus={() => { if (pinnedSearch.length >= 1) setPinnedDropdownOpen(true); }}
                placeholder={t("events:search_user")}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
              />
              {pinnedDropdownOpen && pinnedSearchResults && pinnedSearchResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg">
                  {pinnedSearchResults
                    .filter((u) => !pinnedUsers?.some((p) => p.user_id === u.id))
                    .map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPinnedSelectedId(u.id);
                            setPinnedSearch(`@${u.username} — ${u.full_name}`);
                            setPinnedDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                        >
                          <span className="font-medium">@{u.username}</span>
                          <span className="text-[var(--color-muted-foreground)]">{u.full_name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              disabled={!pinnedSelectedId}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("events:add")}
            </button>
          </form>
        </div>
      </section>

      {/* Hidden Hours */}
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("events:hidden_hours")}</h2>
        <div className="mt-3 space-y-2">
          {hiddenRanges?.map((range, i) => (
            <div key={range.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
              <span className="text-sm">{range.hide_start_hour}:00 - {range.hide_end_hour}:00</span>
              <button onClick={() => setConfirmAction({ type: "removeHiddenRange", id: String(i) })} className="text-xs text-[var(--color-destructive)] hover:underline">
                {t("events:remove")}
              </button>
            </div>
          ))}
          <form onSubmit={handleAddHiddenRange} className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs">{t("events:start_hour")}</label>
              <input type="number" min={0} max={23} value={newHideStart} onChange={(e) => setNewHideStart(parseInt(e.target.value))}
                className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs">{t("events:end_hour")}</label>
              <input type="number" min={0} max={23} value={newHideEnd} onChange={(e) => setNewHideEnd(parseInt(e.target.value))}
                className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm" />
            </div>
            <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]">
              {t("events:add")}
            </button>
          </form>
        </div>
      </section>

      {/* Coverage Requirements */}
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("events:coverage_requirements")}</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          {t("events:coverage_description")}
        </p>
        <div className="mt-3 space-y-2">
          {coverageList && coverageList.length > 0 ? (
            (() => {
              const byTeam = new Map<string, typeof coverageList>();
              for (const cov of coverageList) {
                const list = byTeam.get(cov.team_id) ?? [];
                list.push(cov);
                byTeam.set(cov.team_id, list);
              }
              return Array.from(byTeam.entries()).map(([teamId, entries]) => {
                const team = (allTeams ?? []).find((t) => t.id === teamId) ??
                  (eventTeams ?? []).find((t) => t.team_id === teamId);
                const teamName = team ? ("name" in team ? team.name : team.team_name) : teamId.slice(0, 8);
                const teamColor = team ? ("color" in team ? team.color : team.team_color) : "#888";
                return (
                  <div key={teamId} className="rounded-md border border-[var(--color-border)] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded" style={{ backgroundColor: teamColor }} />
                        <span className="text-sm font-medium">{teamName}</span>
                      </div>
                      <button
                        onClick={() => setConfirmAction({ type: "coverageByTeam", id: teamId, label: teamName })}
                        className="text-xs text-[var(--color-destructive)] hover:underline"
                      >
                        {t("events:remove_all")}
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {entries.map((cov) =>
                        editingCovId === cov.id ? (
                          <form key={cov.id} onSubmit={handleUpdateCoverage} className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-muted)] p-2">
                            <div>
                              <label className="mb-1 block text-xs">{t("events:team")}</label>
                              <select value={editCovTeamId} onChange={(e) => setEditCovTeamId(e.target.value)} required
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm">
                                {(eventTeams ?? []).map((et) => (
                                  <option key={et.team_id} value={et.team_id}>{et.team_name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs">{t("events:start")}</label>
                              <DateTimePicker
                                value={editCovStart}
                                granularity={event.time_granularity}
                                onChange={(v) => setEditCovStart(covSnap(v))}
                                min={eventMinTime} max={eventMaxTime} required
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs">{t("events:end")}</label>
                              <DateTimePicker
                                value={editCovEnd}
                                granularity={event.time_granularity}
                                onChange={(v) => setEditCovEnd(covSnap(v))}
                                min={eventMinTime} max={eventMaxTime} required
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs">{t("events:required_count")}</label>
                              <input type="number" min={1} value={editCovCount} onChange={(e) => setEditCovCount(parseInt(e.target.value) || 1)}
                                required className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm" />
                            </div>
                            <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]">
                              {t("common:save")}
                            </button>
                            <button type="button" onClick={() => setEditingCovId(null)}
                              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
                              {t("common:cancel")}
                            </button>
                          </form>
                        ) : (
                          <div key={cov.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
                            <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                              <span>
                                {new Date(cov.start_time).toLocaleString(i18n.language)} — {new Date(cov.end_time).toLocaleString(i18n.language)}
                              </span>
                              <span className="font-medium text-[var(--color-foreground)]">
                                {cov.required_count} {t("events:required_count").toLowerCase()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => startEditCoverage(cov)} className="text-xs text-[var(--color-primary)] hover:underline">
                                {t("common:edit")}
                              </button>
                              <button onClick={() => setConfirmAction({ type: "coverage", id: cov.id })} className="text-xs text-[var(--color-destructive)] hover:underline">
                                {t("common:delete")}
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              });
            })()
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">{t("events:no_coverage")}</p>
          )}

          {/* Add coverage form */}
          {(eventTeams ?? []).length > 0 && (
            <form onSubmit={handleAddCoverage} className="mt-3 space-y-2 rounded-md border border-dashed border-[var(--color-border)] p-3">
              <p className="text-xs font-medium">{t("events:add_coverage")}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs">{t("events:team")}</label>
                  <select
                    value={covTeamId}
                    onChange={(e) => setCovTeamId(e.target.value)}
                    required
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm"
                  >
                    <option value="">{t("events:select_team")}</option>
                    {(eventTeams ?? []).map((et) => (
                      <option key={et.team_id} value={et.team_id}>
                        {et.team_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs">{t("events:start")}</label>
                  <DateTimePicker
                    value={covStartTime || eventMinTime}
                    granularity={event.time_granularity}
                    onChange={(v) => setCovStartTime(covSnap(v))}
                    min={eventMinTime}
                    max={eventMaxTime}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs">{t("events:end")}</label>
                  <DateTimePicker
                    value={covEndTime || eventMaxTime}
                    granularity={event.time_granularity}
                    onChange={(v) => setCovEndTime(covSnap(v))}
                    min={eventMinTime}
                    max={eventMaxTime}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs">{t("events:required_count")}</label>
                  <input
                    type="number"
                    min={1}
                    value={covCount}
                    onChange={(e) => setCovCount(parseInt(e.target.value) || 1)}
                    required
                    className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
                >
                  {t("events:add")}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Webhooks */}
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <WebhookManager slug={slug!} />
      </section>

      {/* Danger Zone — super admin only */}
      {isSuperAdmin && (
      <section className="rounded-lg border border-[var(--color-destructive-border)] p-4">
        <h2 className="text-lg font-semibold text-[var(--color-destructive)]">{t("events:danger_zone")}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t("events:danger_description")}
        </p>
        <button
          onClick={handleDelete}
          disabled={deleteEvent.isPending}
          className="mt-3 rounded-md bg-[var(--color-destructive)] px-4 py-2 text-sm text-[var(--color-destructive-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {t("events:delete_event")}
        </button>
      </section>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("events:delete_event")}
        message={t("events:delete_confirm")}
        destructive
        loading={deleteEvent.isPending}
        onConfirm={doDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={confirmAction !== null}
        title={t("common:confirm")}
        message={
          confirmAction?.type === "coverage"
            ? t("events:delete_coverage_confirm")
            : confirmAction?.type === "coverageByTeam"
              ? t("events:delete_coverage_team_confirm", { team: confirmAction.label })
              : confirmAction?.type === "removeTeam"
                ? t("events:remove_team_confirm", { team: confirmAction.label })
                : confirmAction?.type === "removeAdmin"
                  ? t("events:remove_admin_confirm", { name: confirmAction.label })
                  : confirmAction?.type === "removePinnedUser"
                    ? t("events:remove_pinned_confirm", { name: confirmAction.label })
                    : t("events:remove_hidden_range_confirm")
        }
        destructive
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
