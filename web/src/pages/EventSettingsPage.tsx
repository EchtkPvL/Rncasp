import { useState, useRef, useEffect } from "react";
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
  useEventHiddenRanges,
} from "@/hooks/useEvents";
import { useTeams } from "@/hooks/useTeams";
import { useSearchUsers } from "@/hooks/useUsers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { granularityToStep, snapToGranularity } from "@/lib/time";

export function EventSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation(["events", "common"]);
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

  // Edit form state
  const [editName, setEditName] = useState("");
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
    setEditDescription(event.description ?? "");
    setEditLocation(event.location ?? "");
    setEditingDetails(true);
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await updateEvent.mutateAsync({
        slug: slug!,
        data: {
          name: editName,
          description: editDescription || undefined,
          location: editLocation || undefined,
        },
      });
      setEditingDetails(false);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleDelete() {
    if (!confirm(t("events:delete_confirm"))) return;
    try {
      await deleteEvent.mutateAsync(slug!);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
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

  // Close admin dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleRemoveAdmin(userId: string) {
    setError("");
    try {
      await eventsApi.removeAdmin(slug!, userId);
      queryClient.invalidateQueries({ queryKey: ["events", slug!, "admins"] });
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
  const covStep = event ? granularityToStep(event.time_granularity) : undefined;
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
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={toggleLock}
            disabled={setLocked.isPending}
            className={`rounded-md px-4 py-2 text-sm ${
              event.is_locked ? "bg-[var(--color-warning-light)] text-[var(--color-warning-foreground)]" : "bg-[var(--color-muted)] text-[var(--color-foreground)]"
            }`}
          >
            {event.is_locked ? t("events:unlock_event") : t("events:lock_event")}
          </button>
          <button
            onClick={togglePublic}
            disabled={setPublic.isPending}
            className={`rounded-md px-4 py-2 text-sm ${
              event.is_public ? "bg-[var(--color-info-light)] text-[var(--color-info)]" : "bg-[var(--color-muted)] text-[var(--color-foreground)]"
            }`}
          >
            {event.is_public ? t("events:make_private") : t("events:make_public")}
          </button>
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
                <button onClick={() => handleRemoveTeam(et.team_id)} className="text-xs text-[var(--color-destructive)] hover:underline">
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
              <button onClick={() => handleRemoveAdmin(admin.user_id)} className="text-xs text-[var(--color-destructive)] hover:underline">
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

      {/* Hidden Hours */}
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-lg font-semibold">{t("events:hidden_hours")}</h2>
        <div className="mt-3 space-y-2">
          {hiddenRanges?.map((range, i) => (
            <div key={range.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
              <span className="text-sm">{range.hide_start_hour}:00 - {range.hide_end_hour}:00</span>
              <button onClick={() => handleRemoveHiddenRange(i)} className="text-xs text-[var(--color-destructive)] hover:underline">
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
                        onClick={() => handleDeleteCoverageByTeam(teamId)}
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
                              <input type="datetime-local" value={editCovStart} step={covStep}
                                onChange={(e) => setEditCovStart(covSnap(e.target.value))}
                                min={eventMinTime} max={eventMaxTime} required
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs">{t("events:end")}</label>
                              <input type="datetime-local" value={editCovEnd} step={covStep}
                                onChange={(e) => setEditCovEnd(covSnap(e.target.value))}
                                min={eventMinTime} max={eventMaxTime} required
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm" />
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
                                {new Date(cov.start_time).toLocaleString()} — {new Date(cov.end_time).toLocaleString()}
                              </span>
                              <span className="font-medium text-[var(--color-foreground)]">
                                {cov.required_count} {t("events:required_count").toLowerCase()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => startEditCoverage(cov)} className="text-xs text-[var(--color-primary)] hover:underline">
                                {t("common:edit")}
                              </button>
                              <button onClick={() => handleDeleteCoverage(cov.id)} className="text-xs text-[var(--color-destructive)] hover:underline">
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
                  <input
                    type="datetime-local"
                    value={covStartTime || eventMinTime}
                    step={covStep}
                    onChange={(e) => setCovStartTime(covSnap(e.target.value))}
                    min={eventMinTime}
                    max={eventMaxTime}
                    required
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs">{t("events:end")}</label>
                  <input
                    type="datetime-local"
                    value={covEndTime || eventMaxTime}
                    step={covStep}
                    onChange={(e) => setCovEndTime(covSnap(e.target.value))}
                    min={eventMinTime}
                    max={eventMaxTime}
                    required
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm"
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
    </div>
  );
}
