const waGateway = require('../wa-gateway-client');

const DEFAULT_GATEWAY_URL = process.env.WA_GATEWAY_URL || 'http://localhost:3001/api/v1/whatsapp';
const HEALTH_TTL_MS = parseInt(process.env.GATEWAY_HEALTH_TTL_MS || '30000', 10);

const healthCache = new Map();

function normalizeGatewayUrl(url) {
    return waGateway.normalizeGatewayUrl(url || DEFAULT_GATEWAY_URL);
}

function buildGatewaySummary(tenants = []) {
    const defaultUrl = normalizeGatewayUrl(DEFAULT_GATEWAY_URL);
    const map = new Map();

    const ensureEntry = (url) => {
        const normalized = normalizeGatewayUrl(url);
        if (!map.has(normalized)) {
            map.set(normalized, {
                url: normalized,
                is_default: normalized === defaultUrl,
                tenant_count: 0,
                session_count: 0
            });
        }
        return map.get(normalized);
    };

    ensureEntry(defaultUrl);

    tenants.forEach((tenant) => {
        const url = tenant?.gateway_url ? tenant.gateway_url : defaultUrl;
        const entry = ensureEntry(url);
        entry.tenant_count += 1;
        if (tenant?.session_id) {
            entry.session_count += 1;
        }
    });

    return Array.from(map.values()).sort((a, b) => {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
        return a.url.localeCompare(b.url);
    });
}

async function getGatewayHealth(url) {
    const normalized = normalizeGatewayUrl(url);
    const now = Date.now();
    if (HEALTH_TTL_MS > 0) {
        const cached = healthCache.get(normalized);
        if (cached && now - cached.at < HEALTH_TTL_MS) {
            return cached.data;
        }
    }

    const payload = await waGateway.checkHealth(normalized);
    const data = {
        url: normalized,
        status: payload?.status ?? 'error',
        message: payload?.message || null,
        checked_at: new Date().toISOString()
    };

    if (HEALTH_TTL_MS > 0) {
        healthCache.set(normalized, { at: now, data });
    }

    return data;
}

async function getGatewayHealthSummary(tenants = []) {
    const summary = buildGatewaySummary(tenants);
    const results = await Promise.all(summary.map(async (entry) => ({
        ...entry,
        health: await getGatewayHealth(entry.url)
    })));
    return results;
}

module.exports = {
    getGatewayHealthSummary,
    normalizeGatewayUrl
};
