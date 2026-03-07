/**
 * 🧠 Vercel Serverless Function — 向量记忆检索
 * POST /api/memory-search
 * Body: { characterId, query, limit?: 5 }
 * Returns: { results: string[] }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SILICONFLOW_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SILICONFLOW_API_KEY)
    return res.status(500).json({ error: 'Server environment not configured' });

  try {
    const { characterId, query, limit = 5 } = req.body;
    if (!characterId || !query)
      return res.status(400).json({ error: 'Missing characterId or query' });

    // 1. 生成 query embedding
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
    const queryEmbedding = (await embeddingRes.json()).data?.[0]?.embedding;
    if (!queryEmbedding) return res.status(502).json({ error: 'No embedding returned from API' });

    // 2. 调用 Supabase RPC
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_chat_memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        query_embedding: JSON.stringify(queryEmbedding),
        target_character_id: characterId,
        match_count: limit,
      }),
    });
    if (!rpcRes.ok) {
      const err = await rpcRes.text();
      return res.status(500).json({ error: `Supabase search failed: ${err}` });
    }

    const rows = await rpcRes.json();
    // 只返回 content 字符串数组，供 prompt 直接注入
    const results = (rows || []).map(r => r.content).filter(Boolean);
    return res.status(200).json({ results });
  } catch (err) {
    console.error('[memory-search] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
