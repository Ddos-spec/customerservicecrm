const db = require('./db');

// Compatibility facade for legacy callers. Unlike the former no-op stub, every
// method persists a privacy-safe event in activity_events.
class ActivityLogger {
    async record(action, payload = {}) {
        return db.logActivity({
            tenantId: payload.tenantId || payload.tenant_id || null,
            actorId: payload.actorId || payload.actor_id || null,
            action,
            entityType: payload.entityType || payload.entity_type || null,
            entityId: payload.entityId || payload.entity_id || null,
            summary: payload.summary || action,
            metadata: payload.metadata || {},
        });
    }

    logLogin(payload) { return this.record('auth.login', payload); }
    logUserCreate(payload) { return this.record('user.created', payload); }
    logUserUpdate(payload) { return this.record('user.updated', payload); }
    logUserDelete(payload) { return this.record('user.deleted', payload); }
    logSessionCreate(payload) { return this.record('session.created', payload); }
    logSessionDelete(payload) { return this.record('session.deleted', payload); }
    logMessageSend(payload) { return this.record('message.queued', payload); }
    logCampaignCreate(payload) { return this.record('campaign.created', payload); }
    logCampaignStart(payload) { return this.record('campaign.started', payload); }
    logCampaignPause(payload) { return this.record('campaign.paused', payload); }
    logCampaignResume(payload) { return this.record('campaign.resumed', payload); }
    logCampaignComplete(payload) { return this.record('campaign.completed', payload); }
    logCampaignDelete(payload) { return this.record('campaign.deleted', payload); }
    logCampaignMessage(payload) { return this.record('campaign.message_sent', payload); }
    logCampaignRetry(payload) { return this.record('campaign.retry', payload); }

    getActivities({ tenantId, limit } = {}) { return db.getActivityFeed({ tenantId, limit }); }
}

module.exports = ActivityLogger;
