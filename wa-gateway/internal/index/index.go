package index

import (
	"github.com/labstack/echo/v4"

	"customerservicecrm/wa-gateway/pkg/router"
)

// Index
// @Summary     Show The Status of The Server
// @Description Get The Server Status
// @Tags        Root
// @Produce     json
// @Success     200
// @Router      / [get]
func Index(c echo.Context) error {
	return router.ResponseSuccess(c, "Go WhatsApp Multi-Device REST is running")
}
