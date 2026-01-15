package internal

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	eSwagger "github.com/swaggo/echo-swagger"

	"customerservicecrm/wa-gateway/docs"
	"customerservicecrm/wa-gateway/pkg/auth"
	"customerservicecrm/wa-gateway/pkg/router"

	ctlAuth "customerservicecrm/wa-gateway/internal/auth"
	typAuth "customerservicecrm/wa-gateway/internal/auth/types"

	ctlIndex "customerservicecrm/wa-gateway/internal/index"
	ctlWhatsApp "customerservicecrm/wa-gateway/internal/whatsapp"
)

func Routes(e *echo.Echo) {
	// Configure OpenAPI / Swagger
	docs.SwaggerInfo.BasePath = router.BaseURL

	// Route for Index
	// ---------------------------------------------
	e.GET(router.BaseURL, ctlIndex.Index)
	e.GET(router.BaseURL+"/", ctlIndex.Index)

	// Route for OpenAPI / Swagger
	// ---------------------------------------------
	e.GET(router.BaseURL+"/docs/*", eSwagger.WrapHandler)

	// Route for Auth
	// ---------------------------------------------
	e.GET(router.BaseURL+"/auth", ctlAuth.Auth, auth.BasicAuth())

	// Route for WhatsApp
	// ---------------------------------------------
	authJWTConfig := middleware.JWTConfig{
		Claims:     &typAuth.AuthJWTClaims{},
		SigningKey: []byte(auth.AuthJWTSecret),
	}

	e.POST(router.BaseURL+"/login", ctlWhatsApp.Login, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/login/pair", ctlWhatsApp.LoginPair, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/logout", ctlWhatsApp.Logout, middleware.JWTWithConfig(authJWTConfig))

	e.GET(router.BaseURL+"/registered", ctlWhatsApp.Registered, middleware.JWTWithConfig(authJWTConfig))

	e.GET(router.BaseURL+"/group", ctlWhatsApp.GetGroup, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/group/join", ctlWhatsApp.JoinGroup, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/group/leave", ctlWhatsApp.LeaveGroup, middleware.JWTWithConfig(authJWTConfig))

	e.GET(router.BaseURL+"/contact", ctlWhatsApp.GetContacts, middleware.JWTWithConfig(authJWTConfig))
	e.GET(router.BaseURL+"/contact/db", ctlWhatsApp.GetContactsFromDB, middleware.JWTWithConfig(authJWTConfig))

	e.POST(router.BaseURL+"/send/text", ctlWhatsApp.SendText, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/location", ctlWhatsApp.SendLocation, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/contact", ctlWhatsApp.SendContact, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/link", ctlWhatsApp.SendLink, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/document", ctlWhatsApp.SendDocument, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/image", ctlWhatsApp.SendImage, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/audio", ctlWhatsApp.SendAudio, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/video", ctlWhatsApp.SendVideo, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/sticker", ctlWhatsApp.SendSticker, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/send/poll", ctlWhatsApp.SendPoll, middleware.JWTWithConfig(authJWTConfig))

	e.POST(router.BaseURL+"/message/edit", ctlWhatsApp.MessageEdit, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/message/react", ctlWhatsApp.MessageEdit, middleware.JWTWithConfig(authJWTConfig))
	e.POST(router.BaseURL+"/message/delete", ctlWhatsApp.MessageDelete, middleware.JWTWithConfig(authJWTConfig))
}
