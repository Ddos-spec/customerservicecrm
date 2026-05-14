package whatsapp

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"

	"customerservicecrm/wa-gateway/pkg/ephemeralmedia"
	"customerservicecrm/wa-gateway/pkg/log"
	"customerservicecrm/wa-gateway/pkg/router"
	pkgWhatsApp "customerservicecrm/wa-gateway/pkg/whatsapp"
)

// EphemeralMedia downloads inbound WhatsApp media on demand using a short-lived reference token.
func EphemeralMedia(c echo.Context) error {
	jid := jwtPayload(c).JID
	token := strings.TrimSpace(c.Param("token"))
	if token == "" {
		return router.ResponseBadRequest(c, "media token is required")
	}

	meta, serialized, err := ephemeralmedia.LoadReference(context.Background(), token)
	if err != nil {
		if err == redis.Nil {
			return router.ResponseNotFound(c, "media reference not found or expired")
		}
		return router.ResponseInternalError(c, err.Error())
	}

	if meta.SessionID != jid {
		return router.ResponseUnauthorized(c, "media token does not belong to this session")
	}

	pkgWhatsApp.WhatsAppInitClient(nil, jid)
	if pkgWhatsApp.WhatsAppClient[jid] == nil {
		return router.ResponseBadGateway(c, "WhatsApp Client is not Valid")
	}

	if err := pkgWhatsApp.WhatsAppIsClientOK(jid); err != nil {
		log.Print(c).Warnf("[MEDIA] Session %s not ready, reconnecting before fetch: %v", jid, err)
		if reconnectErr := pkgWhatsApp.WhatsAppReconnect(jid); reconnectErr != nil {
			return router.ResponseBadGateway(c, reconnectErr.Error())
		}
		if err := pkgWhatsApp.WhatsAppIsClientOK(jid); err != nil {
			return router.ResponseBadGateway(c, err.Error())
		}
	}

	downloadable, err := ephemeralmedia.BuildDownloadableMessage(meta.MediaType, serialized)
	if err != nil {
		return router.ResponseInternalError(c, err.Error())
	}

	bytes, err := pkgWhatsApp.WhatsAppClient[jid].Download(context.Background(), downloadable)
	if err != nil {
		return router.ResponseBadGateway(c, fmt.Sprintf("failed to download media from WhatsApp: %v", err))
	}

	contentType := strings.TrimSpace(meta.MimeType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if trimmedFilename := strings.TrimSpace(meta.Filename); trimmedFilename != "" {
		c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf(`inline; filename*=UTF-8''%s`, url.PathEscape(trimmedFilename)))
	}
	c.Response().Header().Set(echo.HeaderCacheControl, "private, no-store, max-age=0")
	c.Response().Header().Set("Pragma", "no-cache")
	c.Response().Header().Set("Expires", "0")
	c.Response().Header().Set(echo.HeaderContentLength, fmt.Sprintf("%d", len(bytes)))

	return c.Blob(http.StatusOK, contentType, bytes)
}
