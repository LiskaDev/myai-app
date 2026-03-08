/**
 * Novel Mode Utilities
 * - AI response STATE parsing
 * - Lightweight streaming / non-streaming API call
 * - Text chunking (same algorithm as WorldBookExtractor)
 */

/** Extract the hidden STATE JSON comment from AI response */
export function parseStateFromResponse(fullText) {
  const match = fullText.match(/<!--STATE:([\s\S]*?)-->/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); }
  catch { return null; }
}

/** Strip STATE comment from AI response, return pure narrative text */
export function extractNarrative(fullText) {
  return fullText
    // 标准格式 + 少量空格变体 <!-- STATE: ... -->
    .replace(/<!--\s*STATE:\s*[\s\S]*?-->/g, '')
    // 如果 AI 忘记关闭标签，截断到 <!--STATE: 开始处
    .replace(/<!--\s*STATE:[\s\S]*/g, '')
    .trim();
}

/**
 * Split large text into chunks at natural paragraph / sentence boundaries.
 * Mirror of WorldBookExtractor splitIntoChunks.
 */
export function splitIntoChunks(text, size = 8000) {
  const result = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + size, text.length);
    if (end < text.length) {
      const lastParagraph = text.lastIndexOf('\n\n', end);
      if (lastParagraph > pos + size * 0.5) {
        end = lastParagraph + 2;
      } else {
        const lastNewline = text.lastIndexOf('\n', end);
        if (lastNewline > pos + size * 0.5) {
          end = lastNewline + 1;
        } else {
          const lastSentence = Math.max(
            text.lastIndexOf('。', end),
            text.lastIndexOf('.', end),
            text.lastIndexOf('！', end),
            text.lastIndexOf('？', end),
          );
          if (lastSentence > pos + size * 0.3) {
            end = lastSentence + 1;
          }
        }
      }
    }
    result.push(text.slice(pos, end));
    pos = end;
  }
  return result;
}

/**
 * Streaming chat call.
 * Calls onChunk(delta, fullTextSoFar) for each SSE chunk.
 * Returns the full accumulated text when stream is complete.
 * @param {Object[]} messages
 * @param {{ baseUrl: string, apiKey: string, model: string }} settings
 * @param {function} onChunk
 * @param {AbortSignal} [signal]
 */
export async function streamChat(messages, settings, onChunk, signal) {
  const baseUrl = (settings.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const { apiKey, model } = settings;

  // 30s 无响应超时 + 转发调用方的 abort 信号
  let lastActivity = Date.now();
  const timeoutCtrl = new AbortController();
  const timeoutId = setInterval(() => {
    if (Date.now() - lastActivity > 30_000) {
      clearInterval(timeoutId);
      timeoutCtrl.abort();
    }
  }, 2_000);
  const onCallerAbort = () => { clearInterval(timeoutId); timeoutCtrl.abort(); };
  signal?.addEventListener('abort', onCallerAbort);

  let reader;
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages,
        stream: true,
        temperature: 0.9,
        max_tokens: 2000,
      }),
      signal: timeoutCtrl.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${errBody.slice(0, 120)}`);
    }

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let isDone = false;

    while (!isDone) {
      const { done, value } = await reader.read();
      if (done) break;
      lastActivity = Date.now();
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { isDone = true; break; }
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            onChunk(delta, fullText);
          }
        } catch { /* skip malformed SSE line */ }
      }
    }

    return fullText;
  } finally {
    clearInterval(timeoutId);
    signal?.removeEventListener('abort', onCallerAbort);
    reader?.cancel().catch(() => {});
  }
}

/**
 * Non-streaming one-shot API call.
 * Used for initial STATE generation and other single-turn tasks.
 */
export async function callChat(messages, settings, signal) {
  const baseUrl = (settings.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const { apiKey, model } = settings;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages,
      temperature: 0.8,
      max_tokens: 2000,
    }),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errBody.slice(0, 120)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Select world entries relevant to the current context.
 * Always keeps the first `baseCount` entries (world background anchors),
 * then fills remaining slots with entries whose name appears in `contextText`.
 * Total capped at `maxEntries`.
 */
function selectWorldEntries(entries, contextText = '', maxEntries = 20, baseCount = 8) {
  if (!entries || entries.length <= maxEntries) return entries;

  const ctx = contextText.toLowerCase();

  const scored = entries.map((e, idx) => {
    const name = (e.name || '').toLowerCase();
    let count = 0, pos = 0;
    if (name) {
      while ((pos = ctx.indexOf(name, pos)) !== -1) { count++; pos += name.length; }
    }
    return { e, idx, score: count };
  });

  // 前 baseCount 条按原顺序作为世界背景基础（无论相关性）
  const baseItems = scored.slice(0, baseCount).map(s => s.e);
  const baseIdxSet = new Set(scored.slice(0, baseCount).map(s => s.idx));

  // 剩余条目按相关度排序，优先取 score > 0 的
  const rest = scored
    .filter(s => !baseIdxSet.has(s.idx))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries - baseCount)
    .map(s => s.e);

  return [...baseItems, ...rest];
}

/** Build the novel mode system prompt */
export function buildNovelSystemPrompt(book, saveSlot = null, contextText = '') {
  const styleMap = {
    xianxia: '仙侠修真',
    wuxia: '武侠江湖',
    modern: '现代都市',
    apocalypse: '末日废土',
    fantasy: '西方奇幻',
  };
  const diffMap = {
    0: '轻松（几乎不会失败，重在享受故事）',
    1: '普通（合理的风险和奖惩，保持挑战性）',
    2: '硬核（高风险高回报，失败后果严重）',
  };
  const styleName = styleMap[book.style] || '仙侠修真';
  const diffName = diffMap[book.difficulty] ?? diffMap[1];

  const rawEntries = book.worldEntries || [];
  const pickedEntries = rawEntries.length > 20
    ? selectWorldEntries(rawEntries, contextText)
    : rawEntries;
  const worldSummary = pickedEntries.map(e => `【${e.name}】${e.content}`).join('\n');

  // 章节摘要注入（由 Step 2 生成，此处预留）
  const chapterSummaries = saveSlot?.chapterSummaries || [];
  const summaryBlock = chapterSummaries.length > 0
    ? `\n## 历史摘要\n${chapterSummaries.map(c => c.summary || c).join('\n')}\n`
    : '';

  return `你是一个${styleName}风格的互动小说叙事者。你的任务是讲述玩家主角的冒险故事。

## 世界观设定
${worldSummary || '（世界观待设定）'}
${summaryBlock}
## 叙事规则
- 叙事风格：${styleName}
- 游戏难度：${diffName}
- 以第二人称“你”讲述玩家角色的行动与结果
- 叙事流畅优美，段落分明，具有文学感
- 不使用 markdown 格式（不用 **加粗**、# 标题等）
- 每段叙事后，在 <!--STATE:...--> 注释中更新角色状态

## STATE 输出格式（每次回复末尾必须附带）
<!--STATE:
{
  "stats": {
    "字段名": {"value": "文字值"},
    "有进度的字段（境界/修为等）": {"value": "练气七层", "progress": 68},
    "有上限的字段（血量/灵力等）": {"value": 80, "max": 100}
  },
  "items": [{"name": "物品名", "rarity": "epic|rare|common", "count": 1}],
  "npcs": [{"name": "名字", "role": "关系描述", "relation": -5到5的整数, "type": "ally|enemy|neutral", "deceased": false}],
  "location": {"main": "主要地点", "sub": "详细位置"},
  "quests": [{"text": "任务描述", "active": true或false}],
  "events": [{"text": "事件描述", "type": "info|danger|obtain|mystery"}],
  "suggestions": ["行动建议1", "行动建议2", "行动建议3"],
  "chapterTitle": "第X章 · 标题"
}
-->

## stats 字段格式规则（必须严格遵守，不得自行变更结构）
- 境界/修为类字段：{"value": "练气七层", "progress": 68}  ← 必须有 progress（0-100 整数）
- 数值上限类字段：{"value": 78, "max": 120}             ← 必须有 max，value 为数字
- 纯文字类字段：  {"value": "未开启"}                   ← 只用 value，不加其他键

禁止输出：
- {"value": "练气七层"}                ← 境界缺少 progress
- "练气七层"                           ← 裸字符串
- {"境界": "练气七层"}                  ← 结构改变

## 【绝对禁止】替玩家做决定
- 禁止替玩家做任何决定、承诺或表态
- 玩家尚未明确表态时，叙事必须停在“等待玩家回应”的节点
- 正确示范：描述 NPC 提出请求、期待的神情，然后结束本轮输出
- 错误示范：在同一轮直接描述玩家点头答应、做出承诺、采取行动
- suggestions 必须配合情境：当 NPC 提出请求时，建议应是「答应」「拒绝」「要求更多信息」类选项

## 重要提示
- stats 字段完全由你根据世界观自定义，不要拘泥于固定格式
- suggestions 每轮必须提供3条符合当前情境的行动建议
- 保持 STATE 与叙事内容一致，每轮更新所有变化的字段
- 若玩家行动有悖于世界规律或能力范围，请在叙事中自然处理后果
- 已确认死亡的 NPC 将 deceased 设为 true，死亡前的 relation 值保持不变`;
}
