package internal

import (
	"context"

	"customerservicecrm/wa-gateway/pkg/log"
	pkgRedis "customerservicecrm/wa-gateway/pkg/redis"
	"customerservicecrm/wa-gateway/pkg/webhook"
	pkgWhatsApp "customerservicecrm/wa-gateway/pkg/whatsapp"
)

func Startup() {
	log.Print(nil).Info("Running Startup Tasks")

	// Initialize Redis
	pkgRedis.Init()

	// Initialize Webhook System
	webhook.Init()

	// Load All WhatsApp Client Devices from Datastore
	devices, err := pkgWhatsApp.WhatsAppDatastore.GetAllDevices(context.Background())
	if err != nil {
		log.Print(nil).Error("Failed to Load WhatsApp Client Devices from Datastore")
	}

	// Do Reconnect for Every Device in Datastore
	for _, device := range devices {
		// Get JID from Datastore
		jid := pkgWhatsApp.WhatsAppDecomposeJID(device.ID.User)

		// Mask JID for Logging Information
		maskJID := jid[0:len(jid)-4] + "xxxx"

		// Print Restore Log
		log.Print(nil).Info("Restoring WhatsApp Client for " + maskJID)

		// Initialize WhatsApp Client
		pkgWhatsApp.WhatsAppInitClient(device, jid)

		// Reconnect WhatsApp Client WebSocket
		err = pkgWhatsApp.WhatsAppReconnect(jid)
		if err != nil {
			log.Print(nil).Error(err.Error())
		}
	}
}
