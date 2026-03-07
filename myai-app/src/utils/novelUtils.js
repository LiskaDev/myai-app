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
  return fullText.replace(/<!--STATE:[\s\S]*?-->/g, '').trim();
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
    signal,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errBody.slice(0, 120)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
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

/** Build the novel mode system prompt */
export function buildNovelSystemPrompt(book, saveSlot = null) {
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

  const worldSummary = (book.worldEntries || [])
    .slice(0, 30)
    .map(e => `【${e.name}】${e.content}`)
    .join('\n');

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
    "字段名": {"value": "值"},
    "有进度的字段": {"value": "当前", "progress": 68},
    "有上限的字段": {"value": 80, "max": 100}
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

## 重要提示
- stats 字段完全由你根据世界观自定义，不要拘泥于固定格式
- suggestions 每轮必须提供3条符合当前情境的行动建议
- 保持 STATE 与叙事内容一致，每轮更新所有变化的字段
- 若玩家行动有悖于世界规律或能力范围，请在叙事中自然处理后果
- 已确认死亡的 NPC 将 deceased 设为 true，死亡前的 relation 值保持不变`;
}
