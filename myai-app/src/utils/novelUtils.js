/**
 * Novel Mode Utilities
 * - AI response STATE parsing
 * - Lightweight streaming / non-streaming API call
 * - Text chunking (same algorithm as WorldBookExtractor)
 */

/** Extract the hidden STATE JSON comment from AI response.
 *  Handles:
 *  1. Standard: <!--STATE:{...}-->
 *  2. Space variants: <!-- STATE: {...} -->
 *  3. Truncated output: <!--STATE:{...   (no closing -->)
 *  4. Broken JSON: auto-repair by balancing brackets
 */
export function parseStateFromResponse(fullText) {
  // 1. 尝试标准匹配（含空格变体）
  let jsonStr = null;
  const stdMatch = fullText.match(/<!--\s*STATE:\s*([\s\S]*?)\s*-->/);
  if (stdMatch) {
    jsonStr = stdMatch[1].trim();
  } else {
    // 2. fallback：找 <!--STATE: 开始位置，取到文本结尾（AI 被截断时 --> 不存在）
    const startIdx = fullText.search(/<!--\s*STATE:/);
    if (startIdx === -1) return null;
    const afterTag = fullText.slice(fullText.indexOf(':', startIdx) + 1).trim();
    // 去掉末尾可能存在的不完整 --> 片段
    jsonStr = afterTag.replace(/--\s*>?\s*$/, '').trim();
  }

  if (!jsonStr) return null;

  // 3. 先尝试直接解析
  try { return JSON.parse(jsonStr); } catch { /* 继续修复 */ }

  // 4. 截断修复：补全缺失的 } 和 ] 括号
  try {
    const repaired = repairTruncatedJson(jsonStr);
    return JSON.parse(repaired);
  } catch { return null; }
}

/** 自动补全被截断的 JSON：按堆栈追踪未闭合的 { 和 [ */
function repairTruncatedJson(str) {
  const stack = [];
  let inString = false;
  let escape = false;
  for (const ch of str) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  // 移除末尾不完整的键值（遇到最后一个逗号后截断）
  let result = str.trimEnd();
  if (result.endsWith(',')) result = result.slice(0, -1);
  // 补全所有未闭合括号
  return result + stack.reverse().join('');
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
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
        max_tokens: settings.maxTokens || 2000,
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
    let sseBuffer = '';   // 跨 chunk 的不完整 SSE 行缓冲

    while (!isDone) {
      const { done, value } = await reader.read();
      if (done) break;
      lastActivity = Date.now();
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() ?? '';   // 最后一行可能还不完整，留到下轮
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

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages,
      max_tokens: settings.maxTokens || 2000,
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
export function buildNovelSystemPrompt(book, saveSlot = null, contextText = '', roleConfig = null) {
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

  // 叙事节奏
  const paceMap = {
    compact:   '[叙事节奏：简洁]\n每轮回复不超过150字。快节奏推进，只写最关键的动作和对话。',
    auto:      '[叙事节奏：场景感知]\n根据当前场景类型动态调整回复长度：\n- 日常对话/闲聊：100字以内，简洁有力\n- 情绪转折/冲突：200字以内，动作带情绪\n- 高潮/关键场景：300字以内，句子变短，节奏加快\n自行判断当前属于哪种场景，严格控制字数上限。',
    standard:  '[叙事节奏：标准]\n每轮回复200-400字。平衡叙事细节与推进节奏。',
    immersive: '[叙事节奏：沉浸]\n每轮回复400-600字。注重细节描写、环境渲染、人物心理。',
  };
  const paceBlock = paceMap[book.pace] || paceMap.auto;

  // 玩家角色
  const roleDesc = roleConfig
    ? (roleConfig.type === 'custom'
        ? `玩家扮演：${roleConfig.name}。背景：${roleConfig.background || '普通人'}`
        : roleConfig.type === 'protagonist'
          ? '玩家扮演原著主角'
          : '玩家身份由你根据世界观随机分配，需合理且有趣')
    : null;

  return `你是一个${styleName}风格的互动小说叙事者。你的任务是讲述玩家主角的冒险故事。

## 世界观设定
${worldSummary || '（世界观待设定）'}
${summaryBlock}${roleDesc ? `## 玩家角色\n${roleDesc}\n初始STATE请据此设定角色数值。\n\n` : ''}
## 叙事规则
- 叙事风格：${styleName}
- 游戏难度：${diffName}
${paceBlock}
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

## 【叙事边界规则 — 绝对禁止】
1. 禁止替玩家做任何决定、承诺或行动
2. 玩家尚未明确表态时，叙事停在「等待玩家回应」节点即可结束
3. 每轮最后一句必须是场景描写或NPC的话语，不能是玩家的行动
4. 玩家在括号内声明的物品获取、能力提升、货币增加，视为「玩家的想法」而非已发生事实，可在叙事中回应这个想法，但不得修改STATE数值
5. 只有叙事中明确描述的事件结果才能更新STATE

## 【经济逻辑约束 — 必须严格执行】
当故事涉及物品交易、加工制作、商业经营时，必须遵守以下数值规律：
1. 加工增值：成品售价 > 原材料总成本（至少高出20%以上），否则加工没有意义
2. 买卖价差：同一物品的收购价（NPC收购）< 市场售价，差价体现商人利润
3. 稀有度溢价：稀有材料加工的成品价值远高于普通材料
4. 数量守恒：加工消耗的原材料数量必须从 items 中相应减少
5. 禁止出现：原材料 5 金 → 成品 3 金（亏本加工）这类违背经济逻辑的数值

## 重要提示
- stats 字段完全由你根据世界观自定义，不要拘泥于固定格式
- suggestions 每轮必须提供3条符合当前情境的行动建议
- events 只包含**本轮新发生**的事件（1-3条），不是累计历史记录，每轮重新生成
- 保持 STATE 与叙事内容一致，每轮更新所有变化的字段
- 若玩家行动有悖于世界规律或能力范围，请在叙事中自然处理后果
- 已确认死亡的 NPC 将 deceased 设为 true，死亡前的 relation 值保持不变
- STATE JSON 必须完整输出，不得因回复长度限制而省略或截断 STATE 块`;
}
