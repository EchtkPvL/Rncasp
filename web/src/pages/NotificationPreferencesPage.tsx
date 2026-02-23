import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from "@/hooks/useNotifications";

const TRIGGER_TYPES = [
  "shift.created",
  "shift.updated",
  "shift.deleted",
  "event.locked",
  "event.unlocked",
];

const CHANNELS = ["in_app", "email"];

export function NotificationPreferencesPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { data: preferences = [], isLoading } = useNotificationPreferences();
  const updatePref = useUpdateNotificationPreference();

  function isEnabled(triggerType: string, channel: string) {
    const pref = preferences.find(
      (p) => p.trigger_type === triggerType && p.channel === channel
    );
    return pref ? pref.is_enabled : true; // Default enabled
  }

  function handleToggle(triggerType: string, channel: string) {
    const current = isEnabled(triggerType, channel);
    updatePref.mutate({
      trigger_type: triggerType,
      channel,
      is_enabled: !current,
    });
  }

  function triggerLabel(trigger: string) {
    const labels: Record<string, string> = {
      "shift.created": t("notifications.trigger_shift_created", "Shift created"),
      "shift.updated": t("notifications.trigger_shift_updated", "Shift updated"),
      "shift.deleted": t("notifications.trigger_shift_deleted", "Shift deleted"),
      "event.locked": t("notifications.trigger_event_locked", "Event locked"),
      "event.unlocked": t("notifications.trigger_event_unlocked", "Event unlocked"),
    };
    return labels[trigger] || trigger;
  }

  function channelLabel(channel: string) {
    const labels: Record<string, string> = {
      in_app: t("notifications.channel_in_app", "In-App"),
      email: t("notifications.channel_email", "Email"),
    };
    return labels[channel] || channel;
  }

  if (isLoading) {
    return <p className="text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  return (
    <div>
      <div className="mb-2">
        <Link to="/settings/security" className="text-sm text-[var(--color-primary)] hover:underline">
          {t("common:back")}
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold">
        {t("notifications.preferences_title", "Notification Preferences")}
      </h1>

      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
        {t("notifications.preferences_description", "Choose which notifications you want to receive and how.")}
      </p>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
              <th className="px-4 py-3 text-left font-medium">
                {t("notifications.trigger", "Trigger")}
              </th>
              {CHANNELS.map((ch) => (
                <th key={ch} className="px-4 py-3 text-center font-medium">
                  {channelLabel(ch)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRIGGER_TYPES.map((trigger) => (
              <tr key={trigger} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-4 py-3">{triggerLabel(trigger)}</td>
                {CHANNELS.map((ch) => (
                  <td key={ch} className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(trigger, ch)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isEnabled(trigger, ch)
                          ? "bg-[var(--color-primary)]"
                          : "bg-[var(--color-muted)]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                          isEnabled(trigger, ch) ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
