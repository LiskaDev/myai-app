/**
 * 🧠 Vercel Serverless Function — 向量记忆存储
 * POST /api/memory-save
 * Body: { characterId, sessionId, memories: [{content, importance, memory_type}] }
 * Returns: { saved: number }
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
    const { characterId, sessionId, memories } = req.body;
    if (!characterId || !Array.isArray(memories) || memories.length === 0)
      return res.status(400).json({ error: 'Missing characterId or memories' });

    let saved = 0;

    for (const mem of memories) {
      const content = mem.content?.trim();
      if (!content) continue;

      // 1. 生成 embedding
      const embeddingRes = await fetch('https://api.siliconflow.cn/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'BAAI/bge-large-zh-v1.5',
          input: content,
          encoding_format: 'float',
        }),
      });
      if (!embeddingRes.ok) {
        const err = await embeddingRes.text();
        console.error('[memory-save] Embedding failed:', err);
        continue;
      }
      const embedding = (await embeddingRes.json()).data?.[0]?.embedding;
      if (!embedding) continue;

      // 2. 插入 Supabase
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          character_id: characterId,
          session_id: sessionId || null,
          content,
          importance: mem.importance ?? 3,
          memory_type: mem.memory_type || mem.type || 'event',
          embedding: JSON.stringify(embedding),
        }),
      });

      if (insertRes.ok) {
        saved++;
      } else {
        const err = await insertRes.text();
        console.error('[memory-save] Insert failed:', err);
      }
    }

    return res.status(200).json({ saved });
  } catch (err) {
    console.error('[memory-save] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
