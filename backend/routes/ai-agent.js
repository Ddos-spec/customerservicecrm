const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { parseFileBuffer, SUPPORTED_MIME_TYPES } = require('../services/ai/ingest/parseFile');
const { ingestDocument, ingestUrlDocument } = require('../services/ai/ingest/ingestPipeline');
const { chatCompletion, listModels, getOpenRouterErrorMessage } = require('../services/ai/openrouter');

const OPENROUTER_KEY_MASK = '••••••••';
const MAX_KB_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const knowledgeUploadDir = path.join(__dirname, '..', 'knowledge_uploads');
if (!fs.existsSync(knowledgeUploadDir)) {
    fs.mkdirSync(knowledgeUploadDir, { recursive: true });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, knowledgeUploadDir),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '');
            cb(null, `${randomUUID()}${ext}`);
        },
    }),
    limits: { fileSize: MAX_KB_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        if (SUPPORTED_MIME_TYPES[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error('Tipe file tidak didukung. Hanya PDF, DOCX, atau XLSX.'));
        }
    },
});

function triggerIngest(runner, documentId) {
    setImmediate(() => {
        runner(documentId).catch((error) => {
            console.warn(`[AI Agent] Ingest gagal untuk dokumen ${documentId}:`, error.message);
        });
    });
}

function maskApiKey(key) {
    if (!key) return null;
    const trimmed = key.toString();
    if (trimmed.length <= 4) return OPENROUTER_KEY_MASK;
    return `${OPENROUTER_KEY_MASK}${trimmed.slice(-4)}`;
}

function serializeConfig(config, tenant) {
    return {
        tenant_id: config.tenant_id,
        enabled: (tenant?.ai_mode || 'agent') === 'chatbot',
        system_prompt: config.system_prompt || '',
        openrouter_api_key_masked: maskApiKey(config.openrouter_api_key),
        has_api_key: Boolean(config.openrouter_api_key),
        chat_model: config.chat_model,
        embedding_model: config.embedding_model,
        temperature: Number(config.temperature),
        max_tokens: config.max_tokens,
    };
}

function buildAiAgentRouter(deps) {
    const router = express.Router();
    const { db } = deps;

    const requireOwner = (req, res) => {
        const user = req.session?.user;
        if (!user) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return null;
        }
        if (user.role !== 'admin_agent' && user.role !== 'super_admin') {
            res.status(403).json({ success: false, error: 'Access denied' });
            return null;
        }
        const tenantId = user.role === 'super_admin'
            ? (req.query?.tenant_id || req.body?.tenant_id || user.tenant_id || '').toString().trim()
            : (user.tenant_id || '').toString().trim();
        if (!tenantId) {
            res.status(400).json({ success: false, error: 'Tenant ID is required' });
            return null;
        }
        return { user, tenantId };
    };

    // GET /api/v1/ai-agent/config
    router.get('/config', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const [config, tenant] = await Promise.all([
                db.getTenantAiConfig(ctx.tenantId),
                db.getTenantById(ctx.tenantId),
            ]);
            res.json({
                success: true,
                config: serializeConfig(config, tenant),
            });
        } catch (error) {
            console.error('[AI Agent] Error fetching config:', error.message);
            res.status(500).json({ success: false, error: 'Failed to fetch AI agent configuration' });
        }
    });

    // PUT /api/v1/ai-agent/config
    router.put('/config', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const body = req.body || {};
            const [existing, tenant] = await Promise.all([
                db.getTenantAiConfig(ctx.tenantId),
                db.getTenantById(ctx.tenantId),
            ]);
            if (!tenant) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }

            const nextConfig = {
                system_prompt: typeof body.system_prompt === 'string' ? body.system_prompt : existing.system_prompt,
                // Only overwrite the stored key when the caller sends a new non-empty value —
                // the frontend never receives the real key back, so empty/undefined means "keep existing".
                openrouter_api_key: (typeof body.openrouter_api_key === 'string' && body.openrouter_api_key.trim())
                    ? body.openrouter_api_key.trim()
                    : existing.openrouter_api_key,
                chat_model: typeof body.chat_model === 'string' && body.chat_model.trim() ? body.chat_model.trim() : existing.chat_model,
                embedding_model: typeof body.embedding_model === 'string' && body.embedding_model.trim() ? body.embedding_model.trim() : existing.embedding_model,
                temperature: body.temperature !== undefined ? Number(body.temperature) : Number(existing.temperature),
                max_tokens: body.max_tokens !== undefined ? parseInt(body.max_tokens, 10) : existing.max_tokens,
            };

            if (!Number.isFinite(nextConfig.temperature) || nextConfig.temperature < 0 || nextConfig.temperature > 1) {
                return res.status(400).json({ success: false, error: 'Temperature harus di antara 0 dan 1' });
            }
            if (!Number.isInteger(nextConfig.max_tokens) || nextConfig.max_tokens < 100 || nextConfig.max_tokens > 2000) {
                return res.status(400).json({ success: false, error: 'Panjang balasan harus di antara 100 dan 2000 token' });
            }

            const shouldEnable = body.enabled !== undefined
                ? Boolean(body.enabled)
                : (tenant.ai_mode || 'agent') === 'chatbot';
            if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
                return res.status(400).json({ success: false, error: 'Status AI Agent harus berupa aktif atau nonaktif' });
            }
            if (shouldEnable && !nextConfig.openrouter_api_key) {
                return res.status(400).json({ success: false, error: 'Isi API key OpenRouter sebelum mengaktifkan AI Agent' });
            }
            if (shouldEnable && nextConfig.system_prompt.trim().length < 20) {
                return res.status(400).json({ success: false, error: 'Lengkapi instruksi AI minimal 20 karakter sebelum mengaktifkannya' });
            }

            const saved = await db.upsertTenantAiConfig(ctx.tenantId, nextConfig);
            let savedTenant = tenant;
            if (body.enabled !== undefined) {
                savedTenant = await db.updateTenantConfig(ctx.tenantId, {
                    ai_mode: shouldEnable ? 'chatbot' : 'agent',
                });
            }
            res.json({
                success: true,
                config: serializeConfig(saved, savedTenant),
            });
        } catch (error) {
            console.error('[AI Agent] Error saving config:', error.message);
            res.status(500).json({ success: false, error: 'Failed to save AI agent configuration' });
        }
    });

    // GET /api/v1/ai-agent/models
    router.get('/models', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const models = await listModels();
            res.json({ success: true, models });
        } catch (error) {
            console.warn('[AI Agent] Failed fetching OpenRouter models:', error.message);
            res.status(502).json({ success: false, error: getOpenRouterErrorMessage(error) });
        }
    });

    // POST /api/v1/ai-agent/test — test a draft config without activating the bot.
    router.post('/test', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const existing = await db.getTenantAiConfig(ctx.tenantId);
            const apiKey = typeof req.body?.openrouter_api_key === 'string' && req.body.openrouter_api_key.trim()
                ? req.body.openrouter_api_key.trim()
                : existing.openrouter_api_key;
            const model = (req.body?.chat_model || existing.chat_model || '').toString().trim();
            const systemPrompt = (req.body?.system_prompt || existing.system_prompt || '').toString().trim();
            const message = (req.body?.message || '').toString().trim();

            if (!apiKey) return res.status(400).json({ success: false, error: 'Isi API key OpenRouter terlebih dahulu' });
            if (!model) return res.status(400).json({ success: false, error: 'Pilih model percakapan terlebih dahulu' });
            if (systemPrompt.length < 20) return res.status(400).json({ success: false, error: 'Lengkapi instruksi AI minimal 20 karakter' });
            if (!message) return res.status(400).json({ success: false, error: 'Isi contoh pertanyaan customer' });

            const startedAt = Date.now();
            const completion = await chatCompletion({
                apiKey,
                model,
                temperature: Number(req.body?.temperature ?? existing.temperature),
                maxTokens: Math.min(parseInt(req.body?.max_tokens ?? existing.max_tokens, 10) || 500, 700),
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message },
                ],
            });

            res.json({
                success: true,
                reply: completion.text,
                model: completion.model,
                latency_ms: Date.now() - startedAt,
                usage: completion.usage,
            });
        } catch (error) {
            console.warn('[AI Agent] Test failed:', error.message);
            res.status(502).json({ success: false, error: getOpenRouterErrorMessage(error) });
        }
    });

    // GET /api/v1/ai-agent/faq
    router.get('/faq', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const faqs = await db.getTenantFaqs(ctx.tenantId);
            res.json({ success: true, faqs });
        } catch (error) {
            console.error('[AI Agent] Error fetching FAQ:', error.message);
            res.status(500).json({ success: false, error: 'Failed to fetch FAQ list' });
        }
    });

    // POST /api/v1/ai-agent/faq
    router.post('/faq', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const question = (req.body?.question || '').toString().trim();
            const answer = (req.body?.answer || '').toString().trim();
            if (!question || !answer) {
                return res.status(400).json({ success: false, error: 'Question and answer are required' });
            }
            const faq = await db.createTenantFaq(ctx.tenantId, question, answer, ctx.user.id);
            triggerIngest(ingestDocument, faq.id);
            res.status(201).json({ success: true, faq });
        } catch (error) {
            console.error('[AI Agent] Error creating FAQ:', error.message);
            res.status(500).json({ success: false, error: 'Failed to create FAQ' });
        }
    });

    // PUT /api/v1/ai-agent/faq/:id
    router.put('/faq/:id', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const question = (req.body?.question || '').toString().trim();
            const answer = (req.body?.answer || '').toString().trim();
            if (!question || !answer) {
                return res.status(400).json({ success: false, error: 'Question and answer are required' });
            }
            const faq = await db.updateTenantFaq(ctx.tenantId, req.params.id, question, answer);
            if (!faq) {
                return res.status(404).json({ success: false, error: 'FAQ not found' });
            }
            triggerIngest(ingestDocument, faq.id);
            res.json({ success: true, faq });
        } catch (error) {
            console.error('[AI Agent] Error updating FAQ:', error.message);
            res.status(500).json({ success: false, error: 'Failed to update FAQ' });
        }
    });

    // DELETE /api/v1/ai-agent/faq/:id
    router.delete('/faq/:id', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const deleted = await db.deleteTenantFaq(ctx.tenantId, req.params.id);
            if (!deleted) {
                return res.status(404).json({ success: false, error: 'FAQ not found' });
            }
            res.json({ success: true, id: deleted.id });
        } catch (error) {
            console.error('[AI Agent] Error deleting FAQ:', error.message);
            res.status(500).json({ success: false, error: 'Failed to delete FAQ' });
        }
    });

    // GET /api/v1/ai-agent/documents (file + url sources, not FAQ)
    router.get('/documents', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const documents = await db.getTenantKnowledgeDocuments(ctx.tenantId, ['file', 'url']);
            res.json({ success: true, documents });
        } catch (error) {
            console.error('[AI Agent] Error fetching documents:', error.message);
            res.status(500).json({ success: false, error: 'Failed to fetch documents' });
        }
    });

    // POST /api/v1/ai-agent/documents/upload
    router.post('/documents/upload', (req, res) => {
        upload.single('file')(req, res, async (uploadError) => {
            const ctx = requireOwner(req, res);
            if (!ctx) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return;
            }
            if (uploadError) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(400).json({ success: false, error: uploadError.message });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'File is required' });
            }

            try {
                const buffer = fs.readFileSync(req.file.path);
                const rawText = await parseFileBuffer({
                    buffer,
                    mimetype: req.file.mimetype,
                    filename: req.file.originalname,
                });

                const document = await db.createKnowledgeDocument(ctx.tenantId, {
                    sourceType: 'file',
                    title: req.file.originalname,
                    originalFilename: req.file.originalname,
                    filePath: req.file.path,
                    rawText,
                    createdBy: ctx.user.id,
                });

                triggerIngest(ingestDocument, document.id);
                res.status(201).json({ success: true, document });
            } catch (error) {
                fs.unlink(req.file.path, () => {});
                console.error('[AI Agent] Error processing uploaded document:', error.message);
                res.status(400).json({ success: false, error: error.message || 'Failed to process uploaded document' });
            }
        });
    });

    // POST /api/v1/ai-agent/documents/url
    router.post('/documents/url', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const url = (req.body?.url || '').toString().trim();
            if (!url) {
                return res.status(400).json({ success: false, error: 'URL is required' });
            }

            const document = await db.createKnowledgeDocument(ctx.tenantId, {
                sourceType: 'url',
                title: url,
                sourceUrl: url,
                createdBy: ctx.user.id,
            });

            triggerIngest(ingestUrlDocument, document.id);
            res.status(201).json({ success: true, document });
        } catch (error) {
            console.error('[AI Agent] Error creating URL document:', error.message);
            res.status(500).json({ success: false, error: 'Failed to add URL' });
        }
    });

    // DELETE /api/v1/ai-agent/documents/:id
    router.delete('/documents/:id', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;
        try {
            const deleted = await db.deleteKnowledgeDocument(ctx.tenantId, req.params.id);
            if (!deleted) {
                return res.status(404).json({ success: false, error: 'Document not found' });
            }
            if (deleted.file_path) {
                fs.unlink(deleted.file_path, () => {});
            }
            res.json({ success: true, id: deleted.id });
        } catch (error) {
            console.error('[AI Agent] Error deleting document:', error.message);
            res.status(500).json({ success: false, error: 'Failed to delete document' });
        }
    });

    return router;
}

module.exports = { buildAiAgentRouter };
