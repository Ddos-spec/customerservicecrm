package internal

import (
	"sync"

	"github.com/robfig/cron/v3"

	"customerservicecrm/wa-gateway/pkg/log"
	"customerservicecrm/wa-gateway/pkg/webhook"
	pkgWhatsApp "customerservicecrm/wa-gateway/pkg/whatsapp"
)

// State cache to track last known status per session
var (
	lastKnownStatus = make(map[string]string)
	statusMutex     sync.RWMutex
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
			webhookStatus := ""
			if isConnected && isLoggedIn {
				status = "CONNECTED"
				webhookStatus = "connected"
			} else if isConnected && !isLoggedIn {
				status = "CONNECTING"
				webhookStatus = "connecting"
			} else {
				status = "DISCONNECTED"
				webhookStatus = "disconnected"
			}

			log.Print(nil).Infof("[HEARTBEAT] %s | %s | session: %s", maskJID, status, jid)

			// Check if status changed from last known state
			statusMutex.RLock()
			prevStatus, exists := lastKnownStatus[jid]
			statusMutex.RUnlock()

			if !exists || prevStatus != status {
				// Status changed! Send webhook to backend
				log.Print(nil).Infof("[HEARTBEAT] Status changed for %s: %s -> %s, sending webhook", maskJID, prevStatus, status)

				data := map[string]interface{}{
					"status": webhookStatus,
					"source": "heartbeat",
				}

				if err := webhook.QueueEvent(jid, "connection", data); err != nil {
					log.Print(nil).Errorf("[HEARTBEAT] Failed to queue connection webhook: %v", err)
				}

				// Update cache
				statusMutex.Lock()
				lastKnownStatus[jid] = status
				statusMutex.Unlock()
			}
		}
	})

	cron.Start()
}
