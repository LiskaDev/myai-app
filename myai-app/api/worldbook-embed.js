/**
 * 📖 Vercel Serverless Function — 世界书 Embedding 存储/删除
 * POST /api/worldbook-embed
 * Body: { action: "upsert" | "delete", characterId, entry: { id, name, content } }
 */

export default async function handler(req, res) {
    // CORS 支持
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SILICONFLOW_API_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SILICONFLOW_API_KEY) {
        return res.status(500).json({ error: 'Server environment not configured' });
    }

    try {
        const { action, characterId, entry } = req.body;

        if (!characterId) {
            return res.status(400).json({ error: 'Missing characterId' });
        }

        // ── 删除 ──
        if (action === 'delete') {
            if (!entry?.id) return res.status(400).json({ error: 'Missing entry.id for delete' });

            const deleteRes = await fetch(
                `${SUPABASE_URL}/rest/v1/world_entries?character_id=eq.${encodeURIComponent(characterId)}&name=eq.${encodeURIComponent(entry.id)}`,
                {
                    method: 'DELETE',
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    },
                }
            );
            if (!deleteRes.ok) {
                const err = await deleteRes.text();
                return res.status(500).json({ error: `Supabase delete failed: ${err}` });
            }
            return res.status(200).json({ success: true, action: 'deleted' });
        }

        // ── Upsert（插入或更新）──
        if (action === 'upsert') {
            if (!entry?.content) return res.status(400).json({ error: 'Missing entry.content' });

            // 1. 调用 SiliconFlow embedding API
            const embeddingRes = await fetch('https://api.siliconflow.cn/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'BAAI/bge-large-zh-v1.5',
                    input: entry.content,
                    encoding_format: 'float',
                }),
            });

            if (!embeddingRes.ok) {
                const err = await embeddingRes.text();
                return res.status(502).json({ error: `Embedding API failed: ${err}` });
            }

            const embeddingData = await embeddingRes.json();
            const embedding = embeddingData.data?.[0]?.embedding;
            if (!embedding) {
                return res.status(502).json({ error: 'No embedding returned from API' });
            }

            // 2. 先删除旧记录（用 character_id + entry.id 标识唯一性）
            await fetch(
                `${SUPABASE_URL}/rest/v1/world_entries?character_id=eq.${encodeURIComponent(characterId)}&name=eq.${encodeURIComponent(entry.id)}`,
                {
                    method: 'DELETE',
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    },
                }
            );

            // 3. 插入新记录
            const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/world_entries`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify({
                    character_id: characterId,
                    name: entry.id, // 用 entry.id 作为唯一标识
                    content: entry.content,
                    embedding: JSON.stringify(embedding),
                }),
            });

            if (!insertRes.ok) {
                const err = await insertRes.text();
                return res.status(500).json({ error: `Supabase insert failed: ${err}` });
            }

            return res.status(200).json({ success: true, action: 'upserted', dimensions: embedding.length });
        }

        return res.status(400).json({ error: 'Invalid action. Use "upsert" or "delete"' });
    } catch (err) {
        console.error('[worldbook-embed] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
