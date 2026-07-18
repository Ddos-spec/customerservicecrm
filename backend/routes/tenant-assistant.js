const express = require('express');
const { answerTenantAssistant } = require('../services/ai/tenant-assistant');
const { getOpenRouterErrorMessage } = require('../services/ai/openrouter');

function buildTenantAssistantRouter({ db, resolveAuthenticatedUser }) {
    const router = express.Router();

    const requireOwner = (req, res) => {
        const user = resolveAuthenticatedUser?.(req) || req.session?.user;
        if (!user) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return null;
        }
        if (!['admin_agent', 'super_admin'].includes(user.role)) {
            res.status(403).json({ success: false, error: 'AI Assistant hanya tersedia untuk owner tenant.' });
            return null;
        }
        const tenantId = user.role === 'super_admin'
            ? String(req.query?.tenant_id || req.body?.tenant_id || user.tenant_id || '').trim()
            : String(user.tenant_id || '').trim();
        if (!tenantId) {
            res.status(400).json({ success: false, error: 'Tenant ID is required' });
            return null;
        }
        return { user, tenantId };
    };

    router.get('/status', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const [tenant, config] = await Promise.all([
                db.getTenantById(ctx.tenantId),
                db.getTenantAiConfig(ctx.tenantId),
            ]);
            if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
            return res.json({
                success: true,
                tenant: { id: tenant.id, company_name: tenant.company_name },
                ready: Boolean(config?.openrouter_api_key),
                model: config?.chat_model || null,
            });
        } catch (error) {
            console.error('[Tenant Assistant] Status error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to load AI Assistant status' });
        }
    });

    router.post('/chat', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const [tenant, config] = await Promise.all([
                db.getTenantById(ctx.tenantId),
                db.getTenantAiConfig(ctx.tenantId),
            ]);
            if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
            if (!config?.openrouter_api_key) {
                return res.status(400).json({ success: false, error: 'Isi API key OpenRouter di AI Agent terlebih dahulu. Menyimpan key tidak mengaktifkan balasan otomatis customer.' });
            }

            const completion = await answerTenantAssistant({
                tenant,
                config,
                message: req.body?.message,
                history: req.body?.history,
            });
            return res.json({
                success: true,
                reply: completion.text,
                model: completion.model,
                usage: completion.usage,
            });
        } catch (error) {
            console.warn('[Tenant Assistant] Chat failed:', error.message);
            return res.status(502).json({ success: false, error: getOpenRouterErrorMessage(error) });
        }
    });

    return router;
}

module.exports = { buildTenantAssistantRouter };
