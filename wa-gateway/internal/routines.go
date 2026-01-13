package internal

import (
	"github.com/robfig/cron/v3"

	"customerservicecrm/wa-gateway/pkg/log"
	pkgWhatsApp "customerservicecrm/wa-gateway/pkg/whatsapp"
)

func Routines(cron *cron.Cron) {
	log.Print(nil).Info("[ROUTINE] Background tasks initialized")

	// Run every minute to check client status
	cron.AddFunc("0 * * * * *", func() {
		clientCount := len(pkgWhatsApp.WhatsAppClient)
		if clientCount == 0 {
			log.Print(nil).Debug("[HEARTBEAT] No active WhatsApp clients")
			return
		}

		log.Print(nil).Infof("[HEARTBEAT] Active clients: %d", clientCount)

		for jid, client := range pkgWhatsApp.WhatsAppClient {
			// Get Real JID from Datastore
			realJID := client.Store.ID.User

			// Mask JID for Logging Information
			maskJID := realJID[0:len(realJID)-4] + "xxxx"

			// Check connection status
			isConnected := client.IsConnected()
			isLoggedIn := client.IsLoggedIn()

			status := "UNKNOWN"
			if isConnected && isLoggedIn {
				status = "CONNECTED"
			} else if isConnected && !isLoggedIn {
				status = "CONNECTING"
			} else {
				status = "DISCONNECTED"
			}

			log.Print(nil).Infof("[HEARTBEAT] %s | %s | session: %s", maskJID, status, jid)
		}
	})

	cron.Start()
}
