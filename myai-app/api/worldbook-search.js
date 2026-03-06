/**
 * 📖 Vercel Serverless Function — 世界书语义搜索
 * POST /api/worldbook-search
 * Body: { query, characterId, topK?: 3 }
 * Returns: { results: [{ name, content, similarity }] }
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
        const { query, characterId, topK = 3 } = req.body;

        if (!query || !characterId) {
            return res.status(400).json({ error: 'Missing query or characterId' });
        }

        // 1. 把 query 转为 embedding 向量
        const embeddingRes = await fetch('https://api.siliconflow.cn/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'BAAI/bge-large-zh-v1.5',
                input: query,
                encoding_format: 'float',
            }),
        });

        if (!embeddingRes.ok) {
            const err = await embeddingRes.text();
            return res.status(502).json({ error: `Embedding API failed: ${err}` });
        }

        const embeddingData = await embeddingRes.json();
        const queryEmbedding = embeddingData.data?.[0]?.embedding;
        if (!queryEmbedding) {
            return res.status(502).json({ error: 'No embedding returned from API' });
        }

        // 2. 调用 Supabase RPC 做向量相似度搜索
        //    使用 REST API 直接调用 PostgreSQL 函数
        const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_world_entries`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({
                query_embedding: JSON.stringify(queryEmbedding),
                match_character_id: characterId,
                match_count: topK,
                match_threshold: 0.3,  // 相似度阈值（cosine distance < 0.7 → similarity > 0.3）
            }),
        });

        if (!rpcRes.ok) {
            const err = await rpcRes.text();
            return res.status(500).json({ error: `Supabase search failed: ${err}` });
        }

        const results = await rpcRes.json();
        return res.status(200).json({
            results: results.map(r => ({
                name: r.name,
                content: r.content,
                similarity: r.similarity,
            })),
        });
    } catch (err) {
        console.error('[worldbook-search] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
