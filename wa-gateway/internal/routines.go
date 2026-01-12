package internal

import (
	"github.com/robfig/cron/v3"

	"customerservicecrm/wa-gateway/pkg/log"
	pkgWhatsApp "customerservicecrm/wa-gateway/pkg/whatsapp"
)

func Routines(cron *cron.Cron) {
	log.Print(nil).Info("Running Routine Tasks")

	cron.AddFunc("0 * * * * *", func() {
		// If WhatsAppClient Connection is more than 0
		if len(pkgWhatsApp.WhatsAppClient) > 0 {
			// Check Every Authenticated MSISDN
			for _, client := range pkgWhatsApp.WhatsAppClient {
				// Get Real JID from Datastore
				realJID := client.Store.ID.User

				// Mask JID for Logging Information
				maskJID := realJID[0:len(realJID)-4] + "xxxx"

				// Print Log Show Information of Device Checking
				log.Print(nil).Info("Checking WhatsApp Client for " + maskJID)
			}
		}
	})

	cron.Start()
}
