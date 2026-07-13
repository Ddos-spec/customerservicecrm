/**
 * PostgreSQL Database Connection - V2 (Simplified Schema)
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('connect', () => { console.log('✅ PostgreSQL connected'); });
pool.on('error', (err) => { console.error('❌ PostgreSQL pool error:', err.message); });

async function query(text, params) {
    const result = await pool.query(text, params);
    return result;
}

async function getClient() { return pool.connect(); }

// =============================================
// 1. USER & TENANT QUERIES (Tetap Sama)
// =============================================

async function findUserByEmail(email) {
    const result = await query(
        `SELECT u.*, t.company_name as tenant_name, t.session_id as tenant_session_id
         FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.email = $1`,
        [email]
    );
    return result.rows[0] || null;
}

async function findUserById(id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function getUserBySessionId(sessionId) {
    const normalized = String(sessionId || '').trim();
    if (!normalized) return null;

    const hasUserSessionColumn = await query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'session_id'
        LIMIT 1
    `);
    if (hasUserSessionColumn.rowCount === 0) return null;

    const result = await query('SELECT * FROM users WHERE session_id = $1 LIMIT 1', [normalized]);
    return result.rows[0] || null;
}

async function getTenantById(id) {
    const result = await query('SELECT * FROM tenants WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function getTenantBySessionId(sessionId) {
    const result = await query('SELECT * FROM tenants WHERE session_id = $1', [sessionId]);
    return result.rows[0] || null;
}

async function clearSessionReferences(sessionId) {
    const normalized = String(sessionId || '').trim();
    if (!normalized) {
        return { tenants: [], users: [], systemSettings: [] };
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const tenants = await client.query(
            `UPDATE tenants
             SET session_id = NULL,
                 gateway_url = CASE WHEN session_id = $1 THEN NULL ELSE gateway_url END
             WHERE session_id = $1
             RETURNING id, company_name`,
            [normalized]
        );

        const systemSettings = await client.query(
            `DELETE FROM system_settings
             WHERE key = 'notifier_session_id'
               AND value = $1
             RETURNING key`,
            [normalized]
        );

        const hasUserSessionColumn = await client.query(`
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'users'
              AND column_name = 'session_id'
            LIMIT 1
        `);

        let users = { rows: [] };
        if (hasUserSessionColumn.rowCount > 0) {
            users = await client.query(
                `UPDATE users
                 SET session_id = NULL
                 WHERE session_id = $1
                 RETURNING id, email`,
                [normalized]
            );
        }

        await client.query('COMMIT');
        return {
            tenants: tenants.rows,
            users: users.rows,
            systemSettings: systemSettings.rows
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


async function messageExistsByWaId(waMessageId) {
    if (!waMessageId) return false;
    const result = await query('SELECT 1 FROM messages WHERE wa_message_id = $1 LIMIT 1', [waMessageId]);
    return result.rows.length > 0;
}

function normalizeDeliveryStatus(status, isFromMe = false) {
    const normalized = (status || '').toString().trim().toLowerCase();
    const allowed = new Set(['queued', 'processing', 'sending', 'maybe_sent', 'sent', 'delivered', 'read', 'failed', 'received']);
    if (allowed.has(normalized)) return normalized;
    return isFromMe ? 'sent' : 'received';
}

function normalizeTimestamp(value) {
    if (!value) return null;
    if (value instanceof Date) return value;

    if (typeof value === 'number' && Number.isFinite(value)) {
        // WhatsMeow receipts come as unix seconds, JS timestamps as millis.
        return new Date(value < 1000000000000 ? value * 1000 : value);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeReceiptStatus(receiptType) {
    const value = (receiptType || '').toString().trim().toLowerCase();
    if (value.includes('read')) return 'read';
    if (value.includes('delivered') || value.includes('delivery') || value.includes('server')) return 'delivered';
    if (value.includes('error') || value.includes('failed')) return 'failed';
    return 'sent';
}

async function ensureMessageDeliveryColumns() {
    await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20)');
    await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE');
    await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE');
    await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE');
    await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE');
    await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_error TEXT');
    await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS outbound_job_id UUID');
    await query(`
        UPDATE messages
        SET delivery_status = COALESCE(NULLIF(delivery_status, ''), NULLIF(status, ''), CASE WHEN is_from_me THEN 'sent' ELSE 'received' END)
        WHERE delivery_status IS NULL OR trim(delivery_status) = ''
    `);
    await query("ALTER TABLE messages ALTER COLUMN delivery_status SET DEFAULT 'sent'");
    await query(`
        DO $$
        BEGIN
            IF to_regclass('public.messages_wa_message_id_key') IS NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM (
                        SELECT wa_message_id
                        FROM messages
                        WHERE wa_message_id IS NOT NULL
                        GROUP BY wa_message_id
                        HAVING COUNT(*) > 1
                    ) duplicates
               ) THEN
                CREATE UNIQUE INDEX messages_wa_message_id_key ON messages (wa_message_id);
            END IF;
        END
        $$;
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_messages_delivery_status ON messages (delivery_status)');
    await query('CREATE INDEX IF NOT EXISTS idx_messages_outbound_job ON messages (outbound_job_id)');
}

async function ensureOutboundMessageJobsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS outbound_message_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            session_id TEXT NOT NULL,
            chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
            message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
            provider TEXT DEFAULT 'whatsmeow',
            message_type VARCHAR(20) DEFAULT 'text',
            destination TEXT NOT NULL,
            chat_jid TEXT,
            body TEXT,
            media_url TEXT,
            filename TEXT,
            view_once BOOLEAN DEFAULT false,
            status VARCHAR(20) NOT NULL DEFAULT 'queued',
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            locked_at TIMESTAMP WITH TIME ZONE,
            locked_by TEXT,
            last_error TEXT,
            result_message_id TEXT,
            result_payload JSONB,
            sent_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_outbound_jobs_due ON outbound_message_jobs (status, next_attempt_at, created_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_outbound_jobs_session ON outbound_message_jobs (session_id, status)');
    await query('CREATE INDEX IF NOT EXISTS idx_outbound_jobs_message ON outbound_message_jobs (message_id)');
}

async function enqueueOutboundMessageJob(job) {
    const result = await query(`
        INSERT INTO outbound_message_jobs (
            tenant_id, session_id, chat_id, message_id, provider, message_type,
            destination, chat_jid, body, media_url, filename, view_once,
            max_attempts, status, next_attempt_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'queued', now())
        RETURNING *
    `, [
        job.tenantId || job.tenant_id || null,
        job.sessionId || job.session_id,
        job.chatId || job.chat_id || null,
        job.messageId || job.message_id || null,
        job.provider || 'whatsmeow',
        job.messageType || job.message_type || 'text',
        job.destination,
        job.chatJid || job.chat_jid || null,
        job.body || null,
        job.mediaUrl || job.media_url || null,
        job.filename || null,
        Boolean(job.viewOnce || job.view_once),
        Number.isFinite(Number(job.maxAttempts || job.max_attempts)) ? Number(job.maxAttempts || job.max_attempts) : 3,
    ]);
    return result.rows[0];
}

async function markOutboundMessageJobProcessing(id, workerId) {
    const result = await query(`
        UPDATE outbound_message_jobs
        SET status = 'processing',
            locked_at = now(),
            locked_by = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [id, workerId || null]);
    return result.rows[0] || null;
}

async function claimOutboundMessageJobs(workerId, limit = 5) {
    const result = await query(`
        WITH picked AS (
            SELECT id
            FROM outbound_message_jobs
            WHERE status = 'queued'
              AND next_attempt_at <= now()
              AND attempts < max_attempts
            ORDER BY next_attempt_at ASC, created_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE outbound_message_jobs j
        SET status = 'processing',
            attempts = attempts + 1,
            locked_at = now(),
            locked_by = $1,
            updated_at = now()
        FROM picked
        WHERE j.id = picked.id
        RETURNING j.*
    `, [workerId, limit]);
    return result.rows;
}

async function quarantineStaleProcessingOutboundJobs(staleSeconds = 180) {
    const result = await query(`
        UPDATE outbound_message_jobs
        SET status = 'maybe_sent',
            locked_at = NULL,
            locked_by = NULL,
            last_error = 'Worker stopped while job was processing; manual verification required before retry to avoid duplicate WhatsApp send.',
            updated_at = now()
        WHERE status = 'processing'
          AND locked_at IS NOT NULL
          AND locked_at < now() - ($1::int * interval '1 second')
        RETURNING *
    `, [staleSeconds]);
    return result.rows;
}

async function markOutboundMessageJobSent(id, resultMessageId, resultPayload = null) {
    const result = await query(`
        UPDATE outbound_message_jobs
        SET status = 'sent',
            result_message_id = COALESCE($2, result_message_id),
            result_payload = COALESCE($3::jsonb, result_payload),
            sent_at = now(),
            locked_at = NULL,
            locked_by = NULL,
            last_error = NULL,
            updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [id, resultMessageId || null, resultPayload ? JSON.stringify(resultPayload) : null]);
    return result.rows[0] || null;
}

async function rescheduleOutboundMessageJob(id, errorMessage, delaySeconds = 30) {
    const result = await query(`
        UPDATE outbound_message_jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
            next_attempt_at = CASE WHEN attempts >= max_attempts THEN next_attempt_at ELSE now() + ($3::int * interval '1 second') END,
            locked_at = NULL,
            locked_by = NULL,
            last_error = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [id, (errorMessage || '').toString().slice(0, 2000), delaySeconds]);
    return result.rows[0] || null;
}

async function failOutboundMessageJob(id, errorMessage) {
    const result = await query(`
        UPDATE outbound_message_jobs
        SET status = 'failed',
            locked_at = NULL,
            locked_by = NULL,
            last_error = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [id, (errorMessage || '').toString().slice(0, 2000)]);
    return result.rows[0] || null;
}

async function updateMessageDelivery({ messageId, waMessageId, status, deliveredAt, readAt, failedAt, deliveryError, outboundJobId }) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (waMessageId !== undefined) {
        fields.push(`wa_message_id = $${idx++}`);
        values.push(waMessageId || null);
    }
    if (status !== undefined) {
        fields.push(`delivery_status = $${idx}`);
        fields.push(`status = $${idx++}`);
        values.push(normalizeDeliveryStatus(status, true));
    }
    if (deliveredAt !== undefined) {
        fields.push(`delivered_at = COALESCE($${idx++}, delivered_at)`);
        values.push(normalizeTimestamp(deliveredAt));
    }
    if (readAt !== undefined) {
        fields.push(`read_at = COALESCE($${idx++}, read_at)`);
        values.push(normalizeTimestamp(readAt));
    }
    if (failedAt !== undefined) {
        fields.push(`failed_at = COALESCE($${idx++}, failed_at)`);
        values.push(normalizeTimestamp(failedAt));
    }
    if (deliveryError !== undefined) {
        fields.push(`delivery_error = $${idx++}`);
        values.push(deliveryError ? deliveryError.toString().slice(0, 2000) : null);
    }
    if (outboundJobId !== undefined) {
        fields.push(`outbound_job_id = $${idx++}`);
        values.push(outboundJobId || null);
    }

    if (!fields.length || !messageId) return null;
    values.push(messageId);
    const result = await query(`
        UPDATE messages
        SET ${fields.join(', ')}
        WHERE id = $${idx}
        RETURNING *
    `, values);
    return result.rows[0] || null;
}

async function markMessageOutboundSent(messageId, waMessageId) {
    const result = await query(`
        UPDATE messages
        SET wa_message_id = COALESCE($2, wa_message_id),
            delivery_status = 'sent',
            status = 'sent',
            sent_at = COALESCE(sent_at, now()),
            delivery_error = NULL
        WHERE id = $1
        RETURNING *
    `, [messageId, waMessageId || null]);
    return result.rows[0] || null;
}

async function updateMessageReceiptByWaId(waMessageIds, receiptType, timestamp) {
    const ids = Array.isArray(waMessageIds) ? waMessageIds : [waMessageIds];
    const cleanedIds = ids
        .map((id) => (id || '').toString().trim())
        .filter(Boolean);
    if (!cleanedIds.length) return [];

    const status = normalizeReceiptStatus(receiptType);
    const receiptAt = normalizeTimestamp(timestamp) || new Date();
    const params = [cleanedIds, status, receiptAt];
    let timestampSql = ', sent_at = COALESCE(sent_at, $3)';
    if (status === 'read') {
        timestampSql = ', read_at = COALESCE(read_at, $3), delivered_at = COALESCE(delivered_at, $3)';
    } else if (status === 'delivered') {
        timestampSql = ', delivered_at = COALESCE(delivered_at, $3)';
    } else if (status === 'failed') {
        timestampSql = ', failed_at = COALESCE(failed_at, $3)';
    }

    const result = await query(`
        UPDATE messages
        SET delivery_status = CASE
                WHEN delivery_status = 'read' THEN 'read'
                WHEN $2 = 'read' THEN 'read'
                WHEN delivery_status = 'delivered' AND $2 = 'sent' THEN 'delivered'
                ELSE $2
            END,
            status = CASE
                WHEN status = 'read' THEN 'read'
                WHEN $2 = 'read' THEN 'read'
                WHEN status = 'delivered' AND $2 = 'sent' THEN 'delivered'
                ELSE $2
            END
            ${timestampSql}
        WHERE wa_message_id = ANY($1::text[])
        RETURNING *
    `, params);
    return result.rows;
}

// AI Agent (RAG) — config
async function getTenantAiConfig(tenantId) {
    await query(`
        INSERT INTO tenant_ai_config (tenant_id)
        VALUES ($1)
        ON CONFLICT (tenant_id) DO NOTHING
    `, [tenantId]);

    const result = await query('SELECT * FROM tenant_ai_config WHERE tenant_id = $1', [tenantId]);
    return result.rows[0];
}

// A tenant can reuse an approved AI profile without copying its provider key.
// Its chats and knowledge base remain tied to the receiving tenant.
async function getResolvedTenantAiConfig(tenant) {
    const tenantId = typeof tenant === 'object' ? tenant?.id : tenant;
    const profileTenantId = typeof tenant === 'object' ? tenant?.ai_profile_tenant_id : null;
    if (!tenantId) return null;

    const ownConfig = await getTenantAiConfig(tenantId);
    if (!profileTenantId || profileTenantId === tenantId) return ownConfig;

    const profileConfig = await getTenantAiConfig(profileTenantId);
    return profileConfig?.openrouter_api_key ? profileConfig : ownConfig;
}

async function upsertTenantAiConfig(tenantId, config) {
    const result = await query(`
        INSERT INTO tenant_ai_config (tenant_id, system_prompt, openrouter_api_key, chat_model, embedding_model, temperature, max_tokens, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        ON CONFLICT (tenant_id) DO UPDATE SET
            system_prompt = EXCLUDED.system_prompt,
            openrouter_api_key = EXCLUDED.openrouter_api_key,
            chat_model = EXCLUDED.chat_model,
            embedding_model = EXCLUDED.embedding_model,
            temperature = EXCLUDED.temperature,
            max_tokens = EXCLUDED.max_tokens,
            updated_at = now()
        RETURNING *
    `, [
        tenantId,
        config.system_prompt || '',
        config.openrouter_api_key || null,
        config.chat_model || 'openai/gpt-4o-mini',
        config.embedding_model || 'openai/text-embedding-3-small',
        config.temperature ?? 0.3,
        config.max_tokens ?? 500,
    ]);
    return result.rows[0];
}

// AI Agent (RAG) — FAQ (stored as knowledge_documents source_type='faq')
function buildFaqRawText(question, answer) {
    return `Q: ${question}\nA: ${answer}`;
}

function withFaqAnswer(row) {
    if (!row) return row;
    const marker = '\nA: ';
    const markerIndex = row.raw_text ? row.raw_text.indexOf(marker) : -1;
    const answer = markerIndex >= 0 ? row.raw_text.slice(markerIndex + marker.length) : '';
    return { ...row, question: row.title, answer };
}

async function getTenantFaqs(tenantId) {
    const result = await query(`
        SELECT id, tenant_id, title, raw_text, status, chunk_count, created_at, updated_at
        FROM knowledge_documents
        WHERE tenant_id = $1 AND source_type = 'faq'
        ORDER BY created_at ASC
    `, [tenantId]);
    return result.rows.map(withFaqAnswer);
}

async function createTenantFaq(tenantId, question, answer, createdBy) {
    const result = await query(`
        INSERT INTO knowledge_documents (tenant_id, source_type, title, raw_text, status, created_by)
        VALUES ($1, 'faq', $2, $3, 'pending', $4)
        RETURNING id, tenant_id, title, raw_text, status, chunk_count, created_at, updated_at
    `, [tenantId, question, buildFaqRawText(question, answer), createdBy || null]);
    return withFaqAnswer(result.rows[0]);
}

async function updateTenantFaq(tenantId, id, question, answer) {
    const result = await query(`
        UPDATE knowledge_documents
        SET title = $3, raw_text = $4, status = 'pending', chunk_count = 0, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND source_type = 'faq'
        RETURNING id, tenant_id, title, raw_text, status, chunk_count, created_at, updated_at
    `, [id, tenantId, question, buildFaqRawText(question, answer)]);
    return withFaqAnswer(result.rows[0]) || null;
}

async function deleteTenantFaq(tenantId, id) {
    const result = await query(`
        DELETE FROM knowledge_documents
        WHERE id = $1 AND tenant_id = $2 AND source_type = 'faq'
        RETURNING id
    `, [id, tenantId]);
    return result.rows[0] || null;
}

// AI Agent (RAG) — knowledge documents (file / url)
async function createKnowledgeDocument(tenantId, doc) {
    const result = await query(`
        INSERT INTO knowledge_documents (tenant_id, source_type, title, original_filename, file_path, source_url, raw_text, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
        RETURNING *
    `, [
        tenantId,
        doc.sourceType,
        doc.title,
        doc.originalFilename || null,
        doc.filePath || null,
        doc.sourceUrl || null,
        doc.rawText || null,
        doc.createdBy || null,
    ]);
    return result.rows[0];
}

async function getKnowledgeDocumentById(id) {
    const result = await query('SELECT * FROM knowledge_documents WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function getTenantKnowledgeDocuments(tenantId, sourceTypes) {
    const params = [tenantId];
    let filter = '';
    if (Array.isArray(sourceTypes) && sourceTypes.length > 0) {
        params.push(sourceTypes);
        filter = ' AND source_type = ANY($2::text[])';
    }
    const result = await query(`
        SELECT id, tenant_id, source_type, title, original_filename, source_url, status, error_message, chunk_count, created_at, updated_at
        FROM knowledge_documents
        WHERE tenant_id = $1${filter}
        ORDER BY created_at DESC
    `, params);
    return result.rows;
}

async function updateKnowledgeDocumentStatus(id, status, extra = {}) {
    const fields = ['status = $2', 'updated_at = now()'];
    const values = [id, status];
    let idx = 3;
    if (extra.chunkCount !== undefined) { fields.push(`chunk_count = $${idx++}`); values.push(extra.chunkCount); }
    fields.push(`error_message = $${idx++}`);
    values.push(extra.errorMessage !== undefined ? extra.errorMessage : null);
    const result = await query(`UPDATE knowledge_documents SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, values);
    return result.rows[0];
}

async function updateKnowledgeDocumentTitleAndText(id, title, rawText) {
    const result = await query(`
        UPDATE knowledge_documents SET title = $2, raw_text = $3, updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [id, title, rawText]);
    return result.rows[0];
}

async function deleteKnowledgeDocument(tenantId, id) {
    const result = await query(`
        DELETE FROM knowledge_documents
        WHERE id = $1 AND tenant_id = $2 AND source_type != 'faq'
        RETURNING id, file_path
    `, [id, tenantId]);
    return result.rows[0] || null;
}

async function replaceKnowledgeChunks(tenantId, documentId, chunks) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [documentId]);
        for (const chunk of chunks) {
            await client.query(`
                INSERT INTO knowledge_chunks (tenant_id, document_id, chunk_index, content, embedding, embedding_dim)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [tenantId, documentId, chunk.chunkIndex, chunk.content, chunk.embedding, chunk.embedding.length]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function getKnowledgeChunksByTenant(tenantId) {
    const result = await query('SELECT id, document_id, content, embedding FROM knowledge_chunks WHERE tenant_id = $1', [tenantId]);
    return result.rows;
}

// =============================================
// 2. CONTACTS (V2)
// =============================================

async function syncContacts(tenantId, contacts) {
    if (!contacts || contacts.length === 0) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const c of contacts) {
            const rawJid = c.jid || c.JID;
            if (!rawJid) continue;

            let normalizedJid = rawJid;
            if (rawJid.endsWith('@lid') || rawJid.endsWith('@lid.whatsapp.net')) {
                const lid = rawJid.split('@')[0];
                const lidRes = await client.query('SELECT pn FROM whatsmeow_lid_map WHERE lid = $1', [lid]);
                const pn = lidRes.rows[0]?.pn;
                if (pn) {
                    normalizedJid = `${pn}@s.whatsapp.net`;
                }
            }

            const phone = c.phone || normalizedJid.split('@')[0];

            // Priority for full_name: fullName > firstName > pushName > phone
            const fullName = c.fullName || c.firstName || c.pushName || c.displayName || phone;

            await client.query(`
                INSERT INTO contacts (tenant_id, jid, phone_number, full_name, is_business)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (tenant_id, jid) DO UPDATE SET
                    phone_number = COALESCE(EXCLUDED.phone_number, contacts.phone_number),
                    full_name = COALESCE(EXCLUDED.full_name, contacts.full_name),
                    is_business = EXCLUDED.is_business,
                    updated_at = now()
            `, [tenantId, normalizedJid, phone, fullName, c.isBusiness || false]);
        }
        await client.query('COMMIT');
        console.log(`[DB] Synced ${contacts.length} contacts for tenant ${tenantId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] Sync Contacts Error:', error.message);
        throw error;
    } finally { client.release(); }
}

async function getContactsByTenant(tenantId) {
    // Select full_name as display_name for frontend compatibility
    const result = await query('SELECT *, full_name as display_name FROM contacts WHERE tenant_id = $1 ORDER BY updated_at DESC', [tenantId]);
    return result.rows;
}

async function getContactCountByTenant(tenantId) {
    const result = await query(`
        SELECT COUNT(*) as total
        FROM contacts
        WHERE tenant_id = $1
          AND jid NOT LIKE '%@broadcast'
          AND jid NOT LIKE '%@newsletter'
    `, [tenantId]);
    const total = Number.parseInt(result.rows[0]?.total, 10);
    return Number.isFinite(total) ? total : 0;
}

async function getContactByJid(tenantId, jid) {
    const result = await query('SELECT * FROM contacts WHERE tenant_id = $1 AND jid = $2', [tenantId, jid]);
    return result.rows[0] || null;
}

async function getPnByLid(lid) {
    if (!lid) return null;
    const result = await query('SELECT pn FROM whatsmeow_lid_map WHERE lid = $1', [lid]);
    const pn = result.rows[0]?.pn;
    if (!pn) return null;
    return String(pn).trim() || null;
}

// =============================================
// 3. CHATS & MESSAGES (V2 - Pengganti Tiket)
// =============================================

async function getOrCreateChat(tenantId, jid, pushName = null, isGroup = false) {
    // 1. Pastikan kontak ada
    let contactRes = await query('SELECT id, full_name, phone_number FROM contacts WHERE tenant_id = $1 AND jid = $2', [tenantId, jid]);
    let contactId;

    if (contactRes.rows.length === 0) {
        const phone = isGroup ? null : jid.split('@')[0];
        // Use pushName or phone as initial full_name (for groups, this is group name)
        const initialName = pushName || (isGroup ? 'Group Chat' : phone);
        const res = await query(
            'INSERT INTO contacts (tenant_id, jid, phone_number, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
            [tenantId, jid, phone, initialName]
        );
        contactId = res.rows[0].id;
    } else {
        const existing = contactRes.rows[0];
        contactId = existing.id;
        const newName = typeof pushName === 'string' ? pushName.trim() : '';
        if (newName) {
            const existingName = (existing.full_name || '').trim();
            const jidUser = jid.split('@')[0];
            const fallbackNames = new Set(['Group Chat', 'Unknown Group', jidUser]);
            if (existing.phone_number) {
                fallbackNames.add(existing.phone_number);
            }

            let shouldUpdate = false;
            if (isGroup) {
                shouldUpdate = !fallbackNames.has(newName) && newName !== existingName;
            } else if (!existingName || fallbackNames.has(existingName)) {
                shouldUpdate = newName !== existingName;
            }

            if (shouldUpdate) {
                await query(
                    'UPDATE contacts SET full_name = $1, updated_at = now() WHERE id = $2',
                    [newName, contactId]
                );
            }
        }
    }

    // 2. Dapatkan atau buat chat room
    let chatRes = await query('SELECT * FROM chats WHERE tenant_id = $1 AND contact_id = $2', [tenantId, contactId]);
    if (chatRes.rows.length > 0) {
        const chat = chatRes.rows[0];
        if (isGroup && !chat.is_group) {
            const updated = await query(
                'UPDATE chats SET is_group = true, updated_at = now() WHERE id = $1 RETURNING *',
                [chat.id]
            );
            return updated.rows[0] || chat;
        }
        return chat;
    }

    const newChat = await query(
        'INSERT INTO chats (tenant_id, contact_id, is_group) VALUES ($1, $2, $3) RETURNING *',
        [tenantId, contactId, isGroup]
    );
    return newChat.rows[0];
}

async function logMessage({ chatId, senderType, senderId, senderName, messageType, body, mediaUrl, waMessageId, isFromMe, status, outboundJobId }) {
    // Upsert / Idempotency handling
    // If waMessageId exists, skip insert (return existing)
    // Note: Requires UNIQUE constraint on wa_message_id
    
    let message;
    const deliveryStatus = normalizeDeliveryStatus(status, Boolean(isFromMe));
    const sentAtSql = Boolean(isFromMe) && ['sent', 'delivered', 'read'].includes(deliveryStatus) ? 'now()' : 'NULL';
    
    if (waMessageId) {
        const insertRes = await query(`
            INSERT INTO messages (
                chat_id, sender_type, sender_id, sender_name, message_type, body,
                media_url, wa_message_id, is_from_me, status, delivery_status,
                sent_at, outbound_job_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, ${sentAtSql}, $11)
            ON CONFLICT (wa_message_id) DO NOTHING
            RETURNING *
        `, [chatId, senderType, senderId, senderName, messageType || 'text', body, mediaUrl, waMessageId, isFromMe || false, deliveryStatus, outboundJobId || null]);
        
        message = insertRes.rows[0];
        
        if (!message) {
            // Already exists, fetch it
            console.warn(`[DB Mitigation] Duplicate message detected (Collision or Retry): ${waMessageId}`);
            const existRes = await query('SELECT * FROM messages WHERE wa_message_id = $1', [waMessageId]);
            message = existRes.rows[0];
            // Don't update chat preview if it's an old message
            return message; 
        }
    } else {
        // Fallback for messages without ID (internal system messages)
        const res = await query(`
            INSERT INTO messages (
                chat_id, sender_type, sender_id, sender_name, message_type, body,
                media_url, wa_message_id, is_from_me, status, delivery_status,
                sent_at, outbound_job_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, ${sentAtSql}, $11) RETURNING *
        `, [chatId, senderType, senderId, senderName, messageType || 'text', body, mediaUrl, waMessageId, isFromMe || false, deliveryStatus, outboundJobId || null]);
        message = res.rows[0];
    }

    // Update Chat Preview (Only if new message)
    if (message) {
        await query(`
            UPDATE chats SET 
                last_message_preview = $1, 
                last_message_time = now(), 
                last_message_type = $2,
                unread_count = CASE WHEN $3 = false THEN unread_count + 1 ELSE unread_count END,
                updated_at = now()
            WHERE id = $4
        `, [body?.substring(0, 100), messageType || 'text', isFromMe || false, chatId]);
    }

    return message;
}

async function getChatsByTenant(tenantId, limit = 50, offset = 0, status = null) {
    const params = [tenantId, limit, offset];
    const normalizedStatus = typeof status === 'string' && status.trim() !== '' ? status.trim() : null;
    const statusFilter = normalizedStatus
        ? `AND COALESCE(c.status, 'open') = $${params.push(normalizedStatus)}`
        : '';

    const result = await query(`
        SELECT
            COALESCE(c.id, gen_random_uuid()) as id,
            con.id as contact_id,
            $1::uuid as tenant_id,
            c.assigned_to,
            COALESCE(c.status, 'open') as status,
            COALESCE(c.is_group, con.jid LIKE '%@g.us') as is_group,
            COALESCE(c.unread_count, 0) as unread_count,
            c.last_message_preview,
            c.last_message_time,
            COALESCE(c.last_message_type, 'text') as last_message_type,
            COALESCE(c.created_at, con.created_at) as created_at,
            COALESCE(c.updated_at, con.updated_at) as updated_at,
            con.full_name as display_name,
            con.full_name as push_name,
            con.phone_number,
            con.jid,
            con.profile_pic_url,
            u.name as agent_name,
            (c.id IS NULL) as is_contact_only
        FROM contacts con
        LEFT JOIN chats c ON c.contact_id = con.id AND c.tenant_id = $1
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE con.tenant_id = $1
          AND con.jid NOT LIKE '%@broadcast'
          AND con.jid NOT LIKE '%@newsletter'
          ${statusFilter}
        ORDER BY
            c.updated_at DESC NULLS LAST,
            con.updated_at DESC
        LIMIT $2 OFFSET $3
    `, params);
    return result.rows;
}

async function getMessagesByChat(chatId, limit = 50, beforeId = null) {
    let queryText = 'SELECT * FROM messages WHERE chat_id = $1';
    let params = [chatId, limit];
    
    if (beforeId) {
        queryText += ' AND created_at < (SELECT created_at FROM messages WHERE id = $3)';
        params.push(beforeId);
    }
    
    // Ambil data secara DESC (Mundur ke masa lalu) untuk mendapatkan "X pesan sebelum ini"
    queryText += ' ORDER BY created_at DESC LIMIT $2';

    const result = await query(queryText, params);
    
    // Kembalikan urutannya menjadi ASC (Kronologis) agar Frontend mudah merender
    return result.rows.reverse();
}

// =============================================
// 4. STATS (V2)
// =============================================

async function markChatAsRead(chatId) {
    const result = await query(`
        UPDATE chats SET unread_count = 0, updated_at = now() WHERE id = $1 RETURNING *
    `, [chatId]);
    return result.rows[0];
}

async function reopenChatToAi(chatId, tenantId) {
    const result = await query(`
        UPDATE chats SET status = 'open', updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status = 'escalated'
        RETURNING *
    `, [chatId, tenantId]);
    return result.rows[0] || null;
}

function buildChatRangeCondition(range) {
    switch (range) {
        case 'today':
            return 'created_at::date = CURRENT_DATE';
        case '7days':
            return 'created_at >= now() - interval \'7 days\'';
        case '30days':
            return 'created_at >= now() - interval \'30 days\'';
        case '90days':
            return 'created_at >= now() - interval \'90 days\'';
        default:
            return null;
    }
}

async function getDashboardStats(tenantId, range = null) {
    const chatWhereClauses = ['tenant_id = $1'];
    const rangeCondition = buildChatRangeCondition(range);
    if (rangeCondition) {
        chatWhereClauses.push(rangeCondition);
    }

    const [chatStats, userStats] = await Promise.all([
        query(`
            SELECT
                COUNT(*) as total_chats,
                COALESCE(SUM(unread_count), 0) as total_unread,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'open') as open_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'pending') as pending_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'closed') as closed_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'escalated') as escalated_chats,
                COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today_chats
            FROM chats
            WHERE ${chatWhereClauses.join(' AND ')}
        `, [tenantId]),
        query(`
            SELECT
                COUNT(*) as total_users,
                COUNT(*) FILTER (WHERE role = 'admin_agent') as admin_count,
                COUNT(*) FILTER (WHERE role = 'agent') as agent_count
            FROM users
            WHERE tenant_id = $1
        `, [tenantId])
    ]);
    return {
        chats: chatStats.rows[0],
        users: userStats.rows[0]
    };
}

async function getSuperAdminStats(range = null) {
    const rangeCondition = buildChatRangeCondition(range);
    const chatWhere = rangeCondition ? `WHERE ${rangeCondition}` : '';

    const [tenantStats, userStats, chatStats] = await Promise.all([
        query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM tenants"),
        query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE role = 'admin_agent') as admin_count,
                COUNT(*) FILTER (WHERE role = 'agent') as agent_count
            FROM users
        `),
        query(`
            SELECT
                COUNT(*) as total,
                COALESCE(SUM(unread_count), 0) as total_unread,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'open') as open_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'pending') as pending_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'closed') as closed_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'escalated') as escalated_chats,
                COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today_chats
            FROM chats
            ${chatWhere}
        `)
    ]);
    return {
        tenants: tenantStats.rows[0],
        users: userStats.rows[0],
        chats: chatStats.rows[0]
    };
}

module.exports = {
    query, getClient, pool,
    // Users & Tenants
    findUserByEmail, findUserById, getUserBySessionId, getTenantById, getTenantBySessionId, clearSessionReferences, getAllTenants: async () => (await query('SELECT * FROM tenants ORDER BY created_at DESC')).rows,
    messageExistsByWaId,
    getTenantAiConfig,
    getResolvedTenantAiConfig,
    upsertTenantAiConfig,
    getTenantFaqs,
    createTenantFaq,
    updateTenantFaq,
    deleteTenantFaq,
    createKnowledgeDocument,
    getKnowledgeDocumentById,
    getTenantKnowledgeDocuments,
    updateKnowledgeDocumentStatus,
    updateKnowledgeDocumentTitleAndText,
    deleteKnowledgeDocument,
    replaceKnowledgeChunks,
    getKnowledgeChunksByTenant,
    createUser: async (u) => (await query('INSERT INTO users (tenant_id, name, email, password_hash, role, phone_number) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [u.tenant_id, u.name, u.email, u.password_hash, u.role, u.phone_number])).rows[0],
    updateUser: async (id, u) => {
        const fields = Object.keys(u).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const vals = Object.values(u);
        return (await query(`UPDATE users SET ${fields} WHERE id = $1 RETURNING *`, [id, ...vals])).rows[0];
    },
    deleteUser: async (id) => (await query('DELETE FROM users WHERE id = $1 RETURNING id', [id])).rows[0],
    getUsersByTenant: async (tid) => (await query('SELECT * FROM users WHERE tenant_id = $1', [tid])).rows,
    getUsersByTenantWithPhone: async (tid, roles) => (await query('SELECT * FROM users WHERE tenant_id = $1 AND role = ANY($2::text[]) AND phone_number IS NOT NULL', [tid, roles])).rows,
    getSuperAdminsWithPhone: async () => (await query("SELECT * FROM users WHERE role = 'super_admin' AND phone_number IS NOT NULL")).rows,
    getTenantSeatLimit: async () => 100, // Hardcoded for now
    countPendingInvites: async (tid) => (await query("SELECT COUNT(*) FROM user_invites WHERE tenant_id = $1 AND status = 'pending'", [tid])).rows[0].count,
    createTenantWebhook: async (tid, url) => (await query('INSERT INTO tenant_webhooks (tenant_id, url) VALUES ($1, $2) RETURNING *', [tid, url])).rows[0],
    getTenantWebhooks: async (tid) => (await query('SELECT * FROM tenant_webhooks WHERE tenant_id = $1', [tid])).rows,
    deleteTenantWebhook: async (tid, wid) => (await query('DELETE FROM tenant_webhooks WHERE tenant_id = $1 AND id = $2 RETURNING id', [tid, wid])).rows[0],
    
    // Tenant API Key
    getTenantByApiKey: async (key) => (await query('SELECT * FROM tenants WHERE api_key = $1', [key])).rows[0],
    regenerateTenantApiKey: async (id) => {
        const newKey = 'sk_' + require('crypto').randomBytes(24).toString('hex');
        return (await query('UPDATE tenants SET api_key = $1 WHERE id = $2 RETURNING *', [newKey, id])).rows[0];
    },
    ensureTenantApiKeyColumn: async () => query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE'),
    ensureTenantAiModeColumn: async () => {
        await query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_mode VARCHAR(20) DEFAULT \'agent\'');
        await query("UPDATE tenants SET ai_mode = 'agent' WHERE ai_mode IS NULL OR trim(ai_mode) = ''");
    },
    ensureTenantAiProfileColumn: async () => {
        await query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_profile_tenant_id UUID NULL REFERENCES tenants(id) ON DELETE SET NULL');
    },
    // AI Agent (RAG)
    ensureTenantAiConfigTable: async () => {
        await query(`
            CREATE TABLE IF NOT EXISTS tenant_ai_config (
                tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
                system_prompt TEXT NOT NULL DEFAULT '',
                openrouter_api_key TEXT NULL,
                chat_model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
                embedding_model TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
                temperature NUMERIC(3,2) NOT NULL DEFAULT 0.3,
                max_tokens INTEGER NOT NULL DEFAULT 500,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
    },
    ensureKnowledgeDocumentsTable: async () => {
        await query(`
            CREATE TABLE IF NOT EXISTS knowledge_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                source_type VARCHAR(20) NOT NULL,
                title TEXT NOT NULL,
                original_filename TEXT NULL,
                file_path TEXT NULL,
                source_url TEXT NULL,
                raw_text TEXT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                error_message TEXT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        await query('CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant ON knowledge_documents (tenant_id, status)');
    },
    ensureKnowledgeChunksTable: async () => {
        await query(`
            CREATE TABLE IF NOT EXISTS knowledge_chunks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                embedding DOUBLE PRECISION[] NOT NULL,
                embedding_dim INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        await query('CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant ON knowledge_chunks (tenant_id)');
        await query('CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks (document_id)');
    },
    ensureEscalationLogTable: async () => {
        await query(`
            CREATE TABLE IF NOT EXISTS escalation_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                trigger_type VARCHAR(30) NOT NULL,
                trigger_detail TEXT NULL,
                message_id UUID NULL REFERENCES messages(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        await query('CREATE INDEX IF NOT EXISTS idx_escalation_log_tenant ON escalation_log (tenant_id, created_at)');
    },

    // Invites
    updateInviteError: async (id, error) => (await query('UPDATE user_invites SET last_error = $1 WHERE id = $2 RETURNING *', [error, id])).rows[0],
    getInviteById: async (id) => (await query('SELECT i.*, t.company_name as tenant_name FROM user_invites i LEFT JOIN tenants t ON i.tenant_id = t.id WHERE i.id = $1', [id])).rows[0],

    updateTenantStatus: async (id, status) => (await query('UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *', [status, id])).rows[0],
    setTenantSessionId: async (id, sid) => (await query('UPDATE tenants SET session_id = $1 WHERE id = $2 RETURNING *', [sid, id])).rows[0],
    setTenantGatewayUrl: async (id, url) => (await query('UPDATE tenants SET gateway_url = $1 WHERE id = $2 RETURNING *', [url, id])).rows[0],
    updateTenantConfig: async (id, config) => {
        const fields = [];
        const values = [];
        let idx = 1;

        if (config.session_id !== undefined) { fields.push(`session_id = $${idx++}`); values.push(config.session_id); }
        if (config.gateway_url !== undefined) { fields.push(`gateway_url = $${idx++}`); values.push(config.gateway_url); }
        if (config.wa_provider !== undefined) { fields.push(`wa_provider = $${idx++}`); values.push(config.wa_provider); }
        if (config.meta_phone_id !== undefined) { fields.push(`meta_phone_id = $${idx++}`); values.push(config.meta_phone_id); }
        if (config.meta_waba_id !== undefined) { fields.push(`meta_waba_id = $${idx++}`); values.push(config.meta_waba_id); }
        if (config.meta_token !== undefined) { fields.push(`meta_token = $${idx++}`); values.push(config.meta_token); }
        if (config.webhook_events !== undefined) { fields.push(`webhook_events = $${idx++}`); values.push(config.webhook_events); }
        if (config.business_category !== undefined) { fields.push(`business_category = $${idx++}`); values.push(config.business_category); }
        if (config.api_key !== undefined) { fields.push(`api_key = $${idx++}`); values.push(config.api_key); }
        if (config.ai_mode !== undefined) { fields.push(`ai_mode = $${idx++}`); values.push(config.ai_mode); }

        if (fields.length === 0) return null;
        values.push(id);
        
        return (await query(`UPDATE tenants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values)).rows[0];
    },
    updateTenantSessionGateway: async (id, sid, url) => (await query('UPDATE tenants SET session_id = $1, gateway_url = $2 WHERE id = $3 RETURNING *', [sid, url, id])).rows[0],
    deleteTenant: async (id) => (await query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id])).rows[0],
    getTenantAdmin: async (tid) => (await query("SELECT * FROM users WHERE tenant_id = $1 AND role = 'admin_agent' LIMIT 1", [tid])).rows[0],
    ensureTenantWebhooksTable: async () => query('CREATE TABLE IF NOT EXISTS tenant_webhooks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, url TEXT NOT NULL, created_at TIMESTAMP DEFAULT now(), UNIQUE(tenant_id, url))'),
    ensureTenantSessionColumn: async () => query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS session_id TEXT UNIQUE'),
    ensureTenantGatewayColumn: async () => query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gateway_url TEXT'),
    ensureTenantWebhookEventsColumn: async () => {
        await query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS webhook_events JSONB');
        await query('ALTER TABLE tenants ALTER COLUMN webhook_events SET DEFAULT \'{\"groups\": true, \"private\": true, \"self\": false, \"image\": true, \"video\": true, \"audio\": true, \"document\": true}\'::jsonb');
        await query(`
            UPDATE tenants
            SET webhook_events = '{"groups": true, "private": true, "self": false, "image": true, "video": true, "audio": true, "document": true}'::jsonb
                || COALESCE(webhook_events, '{}'::jsonb)
            WHERE webhook_events IS NULL
               OR webhook_events = '{}'::jsonb
               OR NOT (webhook_events ? 'groups')
               OR NOT (webhook_events ? 'private')
               OR NOT (webhook_events ? 'self')
               OR NOT (webhook_events ? 'image')
               OR NOT (webhook_events ? 'video')
               OR NOT (webhook_events ? 'audio')
               OR NOT (webhook_events ? 'document')
        `);
    },
    ensureTenantAnalyticsColumns: async () => {
        await query('ALTER TABLE tenants DROP COLUMN IF EXISTS analysis_webhook_url');
        await query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_category VARCHAR(50) DEFAULT \'general\'');
    },
    ensureMessageDeliveryColumns,
    ensureOutboundMessageJobsTable,
    ensureUserInvitesTable: async () => query('CREATE TABLE IF NOT EXISTS user_invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, role VARCHAR(50), status VARCHAR(20) DEFAULT \'pending\', created_by UUID, expires_at TIMESTAMP, phone_number TEXT, created_at TIMESTAMP DEFAULT now())'),
    ensureInviteErrorColumn: async () => query('ALTER TABLE user_invites ADD COLUMN IF NOT EXISTS last_error TEXT'),
    ensureSystemSettingsTable: async () => query('CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    ensureUserPhoneColumn: async () => query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT'),
    ensureInvitePhoneColumn: async () => query('ALTER TABLE user_invites ADD COLUMN IF NOT EXISTS phone_number TEXT'),
    ensureContactSyncTrigger: async () => {
        const funcSQL = `
            CREATE OR REPLACE FUNCTION "public"."sync_whatsmeow_to_crm_contact"() RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
            DECLARE
              v_tenant_id UUID;
              v_our_phone TEXT;
              v_phone TEXT;
              v_full_name TEXT;
              v_their_jid TEXT;
              v_lid TEXT;
              v_pn TEXT;
            BEGIN
              -- Extract phone number from our_jid.
              -- Whatsmeow stores device JIDs like 6289xxx:74@s.whatsapp.net,
              -- while tenants.session_id stores only 6289xxx.
              v_our_phone := split_part(split_part(NEW.our_jid, '@', 1), ':', 1);

              -- Match our_jid with tenant's session_id for proper tenant isolation
              SELECT id INTO v_tenant_id FROM tenants
              WHERE session_id = v_our_phone AND status = 'active'
              LIMIT 1;

              IF v_tenant_id IS NOT NULL THEN
                v_their_jid := NEW.their_jid;

                IF v_their_jid LIKE '%@lid' OR v_their_jid LIKE '%@lid.whatsapp.net' THEN
                  v_lid := split_part(v_their_jid, '@', 1);
                  SELECT pn INTO v_pn FROM whatsmeow_lid_map WHERE lid = v_lid LIMIT 1;
                  IF v_pn IS NOT NULL AND v_pn <> '' THEN
                    v_their_jid := v_pn || '@s.whatsapp.net';
                  END IF;
                END IF;

                v_phone := split_part(v_their_jid, '@', 1);
                -- Priority: FullName > FirstName > PushName > Phone
                v_full_name := COALESCE(NEW.full_name, NEW.first_name, NEW.push_name);

                IF v_full_name IS NULL OR v_full_name = '' THEN
                    v_full_name := v_phone;
                END IF;

                INSERT INTO contacts (tenant_id, jid, phone_number, full_name, updated_at)
                VALUES (v_tenant_id, v_their_jid, v_phone, v_full_name, now())
                ON CONFLICT (tenant_id, jid)
                DO UPDATE SET
                  phone_number = EXCLUDED.phone_number,
                  full_name = EXCLUDED.full_name,
                  updated_at = now();
              END IF;

              RETURN NEW;
            END;
            $$;
        `;
        await query(funcSQL);
        
        // Ensure Trigger Exists
        await query(`
            DO $$
            BEGIN
              IF to_regclass('public.whatsmeow_contacts') IS NOT NULL THEN
                IF NOT EXISTS (
                  SELECT 1
                  FROM pg_trigger
                  WHERE tgname = 'trg_sync_wm_contacts'
                    AND tgrelid = 'public.whatsmeow_contacts'::regclass
                ) THEN
                  CREATE TRIGGER trg_sync_wm_contacts
                  AFTER INSERT OR UPDATE ON "public"."whatsmeow_contacts"
                  FOR EACH ROW EXECUTE FUNCTION sync_whatsmeow_to_crm_contact();
                END IF;
              END IF;
            END
            $$;
        `);
    },
    createUserInvite: async (i) => (await query('INSERT INTO user_invites (tenant_id, email, token, role, created_by, expires_at, phone_number, name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [i.tenant_id, i.email, i.token, i.role, i.created_by, i.expires_at, i.phone_number, i.name])).rows[0],
    getInviteByToken: async (t) => (await query('SELECT i.*, t.company_name as tenant_name FROM user_invites i JOIN tenants t ON i.tenant_id = t.id WHERE i.token = $1', [t])).rows[0],
    acceptInvite: async (t) => await query("UPDATE user_invites SET status = 'accepted' WHERE token = $1", [t]),
    // Contacts
    syncContacts, getContactsByTenant, getContactCountByTenant, getContactByJid, getPnByLid,
    // Chats & Messages
    getOrCreateChat, logMessage, getChatsByTenant, getMessagesByChat, markChatAsRead, reopenChatToAi,
    updateMessageDelivery,
    markMessageOutboundSent,
    updateMessageReceiptByWaId,
    enqueueOutboundMessageJob,
    markOutboundMessageJobProcessing,
    claimOutboundMessageJobs,
    quarantineStaleProcessingOutboundJobs,
    markOutboundMessageJobSent,
    rescheduleOutboundMessageJob,
    failOutboundMessageJob,
    // System
    getSystemSetting: async (key) => {
        const res = await query('SELECT value FROM system_settings WHERE key = $1', [key]);
        return res.rows[0]?.value || null;
    },
    setSystemSetting: async (key, val) => {
        await query('INSERT INTO system_settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, val]);
    },
    getDashboardStats, getSuperAdminStats
};
