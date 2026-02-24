import { useTranslation } from "react-i18next";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
} from "@/hooks/useNotifications";

interface NotificationListProps {
  onClose: () => void;
}

export function NotificationList({ onClose }: NotificationListProps) {
  const { t } = useTranslation("common");
  const { data: notifications = [], isLoading } = useNotifications(20);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  function handleMarkAllRead() {
    markAllRead.mutate();
  }

  function handleClick(id: string, isRead: boolean) {
    if (!isRead) {
      markRead.mutate(id);
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return t("notifications.just_now", "just now");
    if (diffMin < 60) return t("notifications.minutes_ago", "{{count}}m ago", { count: diffMin });
    if (diffHr < 24) return t("notifications.hours_ago", "{{count}}h ago", { count: diffHr });
    return t("notifications.days_ago", "{{count}}d ago", { count: diffDay });
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-sm font-semibold">{t("notifications.title", "Notifications")}</h3>
        {notifications.some((n) => !n.is_read) && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            {t("notifications.mark_all_read", "Mark all read")}
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-[var(--color-muted-foreground)]">
            {t("loading")}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-[var(--color-muted-foreground)]">
            {t("notifications.empty", "No notifications")}
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleClick(notification.id, notification.is_read)}
              className={`w-full border-b border-[var(--color-border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--color-muted)] ${
                !notification.is_read ? "bg-[var(--color-accent)]" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                {!notification.is_read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{notification.title}</div>
                  {notification.body && (
                    <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">
                      {notification.body}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                    {formatTime(notification.created_at)}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-2 text-center">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          {t("notifications.close", "Close")}
        </button>
      </div>
    </div>
  );
}
