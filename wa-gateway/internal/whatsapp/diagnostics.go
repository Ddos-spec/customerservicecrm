package whatsapp

import (
	"github.com/labstack/echo/v4"

	"customerservicecrm/wa-gateway/pkg/events"
	"customerservicecrm/wa-gateway/pkg/router"
	pkgWebhook "customerservicecrm/wa-gateway/pkg/webhook"
	pkgWhatsApp "customerservicecrm/wa-gateway/pkg/whatsapp"
)

func SessionStatus(c echo.Context) error {
	jid := jwtPayload(c).JID
	client := pkgWhatsApp.WhatsAppClient[jid]

	data := map[string]interface{}{
		"sessionId":   jid,
		"clientValid": client != nil,
		"connected":   false,
		"loggedIn":    false,
		"eventStats":  events.GetSessionStats(jid),
		"webhook":     pkgWebhook.Stats(),
	}

	if client != nil {
		data["connected"] = client.IsConnected()
		data["loggedIn"] = client.IsLoggedIn()
		if client.Store != nil && client.Store.ID != nil {
			data["deviceJid"] = client.Store.ID.String()
		}
	}

	return router.ResponseSuccessWithData(c, "Successfully Loaded Session Status", data)
}

func WebhookStats(c echo.Context) error {
	return router.ResponseSuccessWithData(c, "Successfully Loaded Webhook Stats", map[string]interface{}{
		"webhook":  pkgWebhook.Stats(),
		"sessions": events.GetAllSessionStats(),
	})
}

func WebhookRetryFailed(c echo.Context) error {
	count, err := pkgWebhook.RetryFailed()
	if err != nil {
		return router.ResponseInternalError(c, err.Error())
	}

	return router.ResponseSuccessWithData(c, "Successfully Requeued Failed Webhooks", map[string]interface{}{
		"requeued": count,
		"webhook":  pkgWebhook.Stats(),
	})
}
