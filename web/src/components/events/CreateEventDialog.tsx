import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useCreateEvent } from "@/hooks/useEvents";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { ApiError } from "@/api/client";
import { snapToGranularity } from "@/lib/time";
import { DateTimePicker } from "@/components/common/DateTimePicker";

interface CreateEventDialogProps {
  onClose: () => void;
}

function toSlug(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateEventDialog({ onClose }: CreateEventDialogProps) {
  const { t } = useTranslation(["events", "common"]);
  const navigate = useNavigate();
  const createEvent = useCreateEvent();
  useEscapeKey(useCallback(() => onClose(), [onClose]));

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [participantCount, setParticipantCount] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [granularity, setGranularity] = useState<"15min" | "30min" | "1hour">("30min");
  const [error, setError] = useState("");

  const snap = (v: string) => snapToGranularity(v, granularity);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugManual) {
      setSlug(toSlug(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      const res = await createEvent.mutateAsync({
        name,
        slug,
        description: description || undefined,
        location: location || undefined,
        participant_count: participantCount ? parseInt(participantCount) : undefined,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        time_granularity: granularity,
      });
      onClose();
      if (res.data) {
        navigate(`/events/${res.data.slug}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.field ? `${err.field}: ${err.message}` : err.message);
      } else {
        setError(t("common:error"));
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border)] sm:hidden" />
        <h2 className="text-xl font-bold">{t("events:create")}</h2>

        {error && (
          <div className="mt-3 rounded-md border border-[var(--color-destructive-border)] bg-[var(--color-destructive-light)] px-4 py-2 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("events:name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("events:slug")}</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              required
              pattern="^[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("events:description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:location")}</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:participants", "Participants")}</label>
              <input
                type="number"
                value={participantCount}
                onChange={(e) => setParticipantCount(e.target.value)}
                min={1}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:start_time")}</label>
              <DateTimePicker
                value={startTime}
                granularity={granularity}
                onChange={(v) => setStartTime(snap(v))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("events:end_time")}</label>
              <DateTimePicker
                value={endTime}
                granularity={granularity}
                onChange={(v) => setEndTime(snap(v))}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("events:granularity")}</label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as "15min" | "30min" | "1hour")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="15min">{t("events:granularity_15min")}</option>
              <option value="30min">{t("events:granularity_30min")}</option>
              <option value="1hour">{t("events:granularity_1hour")}</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
            >
              {t("common:cancel")}
            </button>
            <button
              type="submit"
              disabled={createEvent.isPending}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("common:create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
