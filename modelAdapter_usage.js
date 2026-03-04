/**
 * modelAdapter.js 使用示例
 * 展示如何在 useChat.js 和 useDiary.js 中接入适配层
 */

import {
  callWithRetry,
  detectRejection,
  AdapterRejectionError,
  GEMINI_SAFETY_SETTINGS,
  detectModelFamily,
} from './modelAdapter.js';


// ─────────────────────────────────────────────
// 示例1：useChat.js 接入（普通聊天）
// ─────────────────────────────────────────────

async function sendChatMessage({ messages, systemPrompt, modelId, characterName }) {

  // 定义实际 API 调用函数（根据你的项目替换这部分）
  const apiFn = async ({ messages, systemPrompt, modelId }) => {
    const family = detectModelFamily(modelId);

    // Gemini 特殊处理
    if (family === 'gemini') {
      const res = await callGeminiAPI({
        messages,
        systemPrompt,
        modelId,
        safetySettings: GEMINI_SAFETY_SETTINGS, // 关闭安全过滤
      });
      return res.text;
    }

    // 其他模型统一调用
    const res = await callUniversalAPI({ messages, systemPrompt, modelId });
    return res.text;
  };

  try {
    const { text, retried, attempts } = await callWithRetry({
      apiFn,
      modelId,
      characterName,
      messages,
      systemPrompt,
      maxRetries: 2,
      onRetry: (attempt) => {
        console.log(`[Chat] 第 ${attempt} 次重试，强化角色锁定...`);
        // 可以在这里显示一个加载状态给用户，让等待更自然
      },
    });

    if (retried) {
      console.log(`[Chat] 重试成功，共尝试 ${attempts} 次`);
    }

    return text;

  } catch (err) {
    if (err instanceof AdapterRejectionError) {
      // 所有重试耗尽 → 返回角色语气的模糊兜底回应（你原来方案2的逻辑）
      return getFallbackResponse(characterName);
    }
    throw err;
  }
}


// ─────────────────────────────────────────────
// 示例2：useDiary.js 接入（日记生成）
// ─────────────────────────────────────────────

async function generateDiary({ messages, systemPrompt, modelId, characterName }) {

  const apiFn = async ({ messages, systemPrompt, modelId }) => {
    const res = await callUniversalAPI({ messages, systemPrompt, modelId });
    return res.text;
  };

  try {
    const { text } = await callWithRetry({
      apiFn,
      modelId,
      characterName,
      messages,
      systemPrompt,
      maxRetries: 2, // 日记生成可以多给一次机会
      onRetry: (attempt) => {
        console.log(`[Diary] 日记生成重试 ${attempt}...`);
      },
    });

    return text; // 成功，存入数据库

  } catch (err) {
    if (err instanceof AdapterRejectionError) {
      // 重试耗尽 → 生成一条简短占位日记，而非静默失败
      // 让玩家感知到"日记写了，只是今天角色心情不好"
      return generatePlaceholderDiary(characterName);
    }
    throw err;
  }
}


// ─────────────────────────────────────────────
// 示例3：usePromptBuilder.js 接入（构建 system prompt）
// ─────────────────────────────────────────────

import { getRoleLockInjection } from './modelAdapter.js';

function buildSystemPrompt({ character, modelId, scenario }) {
  // 获取模型专属角色锁定指令
  const roleLock = getRoleLockInjection(modelId, character.name);

  return `
${roleLock}

═══════════════════════════════
角色设定
═══════════════════════════════
名字：${character.name}
性格：${character.personality}
背景：${character.background}
说话风格：${character.speakingStyle}

当前场景：${scenario}
═══════════════════════════════
`.trim();
}


// ─────────────────────────────────────────────
// 兜底回应（所有重试失败后的最终降级）
// ─────────────────────────────────────────────

const FALLBACK_TEMPLATES = [
  (name) => `*${name}沉默了片刻，似乎在思考什么*`,
  (name) => `*${name}轻轻叹了口气，没有说话*`,
  (name) => `*${name}的视线飘向远处，陷入了沉思*`,
  (name) => `……`,
];

function getFallbackResponse(characterName) {
  const template = FALLBACK_TEMPLATES[Math.floor(Math.random() * FALLBACK_TEMPLATES.length)];
  return template(characterName);
}

function generatePlaceholderDiary(characterName) {
  return `今天……有些事情让我一时不知道该怎么说。\n也许明天会好一些。\n——${characterName}`;
}


// ─────────────────────────────────────────────
// 占位：你项目里实际的 API 调用函数
// ─────────────────────────────────────────────

async function callUniversalAPI({ messages, systemPrompt, modelId }) {
  // 替换为你实际的 fetch/axios 调用
  throw new Error('请替换为你的实际 API 调用实现');
}

async function callGeminiAPI({ messages, systemPrompt, modelId, safetySettings }) {
  // 替换为你实际的 Gemini API 调用
  throw new Error('请替换为你的实际 Gemini API 调用实现');
}
