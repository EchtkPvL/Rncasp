import { useTranslation } from "react-i18next";
import { WebhookManager } from "@/components/webhooks/WebhookManager";

export function AdminWebhooksPage() {
  const { t } = useTranslation(["admin"]);

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">{t("global_webhooks.title")}</h2>
      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
        {t("global_webhooks.description")}
      </p>
      <WebhookManager global />
    </div>
  );
}
