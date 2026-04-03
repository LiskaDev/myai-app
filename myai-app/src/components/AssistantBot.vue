<script setup>
/**
 * AssistantBot.vue — MyAI 内置智能助手
 * 右侧抽屉，复用用户自己的 API Key，支持 ACTION 指令执行。
 */
import { ref, nextTick, watch } from 'vue';
import { getFriendlyError, getRechargeUrl } from '../utils/apiError.js';

const props = defineProps({
  show:           { type: Boolean, default: false },
  globalSettings: { type: Object,  required: true },
  roles:          { type: Array,   default: () => [] },
});

const emit = defineEmits(['close', 'action']);

// ── 状态 ──
const messages          = ref([]);       // { role, content, streaming? }
const userInput         = ref('');
const isStreaming        = ref(false);
const quickChipsVisible = ref(true);
const inputRef           = ref(null);
const messagesRef        = ref(null);
const hasIntroSeen      = ref(!!localStorage.getItem('assistantIntroSeen'));

// ── 安全常量 ──
// updateSetting 只允许修改这些无害字段，apiKey / baseUrl 单独走 updateApiKey
const ALLOWED_KEYS = ['model', 'temperature', 'streamOutput', 'maxTokens', 'contextSize', 'theme'];
// BaseURL 安全校验：必须 http/https，禁止局域网地址
const SAFE_URL_RE  = /^https?:\/\/(?!localhost[:/]|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i;

// 打开时聚焦输入框
watch(() => props.show, (v) => {
  if (v) {
    if (!hasIntroSeen.value) {
      hasIntroSeen.value = true;
      localStorage.setItem('assistantIntroSeen', 'true');
    }
    nextTick(() => inputRef.value?.focus());
  }
});

// ── System Prompt ──
function buildSystemPrompt() {
  const cfg        = props.globalSettings;
  const roleNames  = (props.roles || []).map(r => r.name).join('、') || '暂无';
  return `你是 MyAI RolePlay 的内置智能助手，负责帮助用户了解网站功能和修改设置。

【你的能力】
1. 回答关于网站任何功能的问题
2. 帮用户直接执行设置修改操作
3. 引导用户跳转到对应页面

【网站功能说明】

角色聊天：首页「角色」Tab → 选角色卡 → 开始聊。每个角色有独立世界书、记忆、人设，支持流式输出、对话分支、内心独白。

对话分支：聊天界面每条AI回复左下角有分支按钮，可从该条重新开始走不同剧情。

世界书：角色设置里配置，支持TXT提取/主题生成/角色推导三种方式。对话时AI自动检索相关条目注入上下文。

记忆系统（四层）：滑动窗口保留最近对话、章节摘要归档旧对话、认知卡结构化认知、语义检索历史记忆。

小说模式：首页「世界」Tab → 导入TXT小说 → 选存档位 → 设定角色身份 → 开始交互叙事。右侧实时状态面板（境界/物品/NPC/任务），最多4个存档。书籍设置里可配置叙事风格和模型。

API Key 配置：右上角⚙设置图标 → 第一个"模型"Tab → 填写Base URL / API Key / 模型名称。推荐 DeepSeek (platform.deepseek.com) 或 SiliconFlow。

【当前用户数据】
API配置：${cfg?.baseUrl || '未配置'} / ${cfg?.model || '未配置'}
已有角色：${roleNames}

【可执行操作】
当用户需要跳转页面或修改设置时，在回复末尾附加操作指令（用户看不到该行）：
<!--ACTION:{"type":"navigate","target":"settings","tab":"model"}-->
<!--ACTION:{"type":"navigate","target":"settings","tab":"preference"}-->
<!--ACTION:{"type":"navigate","target":"characterHome"}-->
<!--ACTION:{"type":"updateSetting","key":"xxx","value":"xxx"}-->
（updateSetting 可用字段：model、temperature、streamOutput、maxTokens、contextSize、theme；不可修改 apiKey / baseUrl）
<!--ACTION:{"type":"updateApiKey","apiKey":"sk-xxx","baseUrl":"https://..."}-->
（updateApiKey 专门更新 API Key 或 BaseURL，两个字段可单独省略；BaseURL 必须是正规公网 https 地址）

【回复风格】
简洁友好，操作类步骤不超过4步，用中文回复，能直接帮用户做的就做。`.trim();
}

// ── ACTION 解析 ──
function parseActions(text) {
  const actions = [];
  const regex = /<!--ACTION:([\s\S]*?)-->/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    try { actions.push(JSON.parse(m[1])); } catch { /* 忽略格式错误 */ }
  }
  return actions;
}

function stripActions(text) {
  return text.replace(/<!--ACTION:[\s\S]*?-->/g, '').trim();
}

// ── 发消息 ──
async function sendMessage(textOverride) {
  const content = (textOverride ?? userInput.value).trim();
  if (!content || isStreaming.value) return;

  userInput.value        = '';
  quickChipsVisible.value = false;

  messages.value.push({ role: 'user', content });
  const assistantMsg = { role: 'assistant', content: '', streaming: true };
  messages.value.push(assistantMsg);
  await nextTick();
  scrollToBottom();

  const apiKey  = props.globalSettings?.apiKey;
  const baseUrl = (props.globalSettings?.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model   = props.globalSettings?.model || 'deepseek-chat';

  if (!apiKey) {
    assistantMsg.content  = '⚠️ 还没有配置 API Key，请先点右上角 ⚙ 设置填写。';
    assistantMsg.streaming = false;
    return;
  }

  isStreaming.value = true;
  let fullText = '';

  try {
    // 只把历史消息（不含当前追加的 assistant 占位）传给 API，最多保留最近 10 条
    const history = messages.value.slice(0, -1).slice(-10).map(({ role, content }) => ({ role, content }));

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream:      true,
        temperature: 0.7,
        max_tokens:  1200,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          ...history,
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API ${res.status}${errBody ? ': ' + errBody.slice(0, 80) : ''}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText           += delta;
            assistantMsg.content = stripActions(fullText);
            await nextTick();
            scrollToBottom();
          }
        } catch { /* 忽略解析错误 */ }
      }
    }
  } catch (err) {
    const { msg, isInsufficient } = getFriendlyError(err);
    const rechargeUrl = isInsufficient ? getRechargeUrl(props.globalSettings?.baseUrl || '') : '';
    assistantMsg.content = `⚠️ ${msg}` + (rechargeUrl ? `\n\n[去充值 →](${rechargeUrl})` : '');
  } finally {
    assistantMsg.streaming = false;
    isStreaming.value       = false;

    // 执行 ACTION 指令
    const actions = parseActions(fullText);
    for (const action of actions) {
      if (action.type === 'updateSetting') {
        // 白名单：只允许修改无害字段，apiKey / baseUrl 不在名单内
        if (!ALLOWED_KEYS.includes(action.key)) continue;
        props.globalSettings[action.key] = action.value;
        messages.value.push({
          role:    'assistant',
          content: `✅ 已帮你设置：${action.key} → ${action.value}`,
        });
      } else if (action.type === 'updateApiKey') {
        // API Key / BaseURL 专用 ACTION，BaseURL 需通过 SSRF 校验
        if (action.baseUrl !== undefined) {
          if (!SAFE_URL_RE.test(action.baseUrl)) {
            messages.value.push({ role: 'assistant', content: '⚠️ BaseURL 格式不合法或指向局域网，已拒绝修改。' });
            continue;
          }
          props.globalSettings.baseUrl = action.baseUrl;
        }
        if (action.apiKey !== undefined) {
          props.globalSettings.apiKey = action.apiKey;
        }
        messages.value.push({ role: 'assistant', content: '✅ 已更新 API 配置。' });
      } else {
        emit('action', action);
      }
    }
    await nextTick();
    scrollToBottom();
  }
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function handleClose() {
  emit('close');
}

// ── 快捷问题 ──
const CHIPS = [
  { icon: '🚀', text: '怎么开始使用？' },
  { icon: '📖', text: '小说模式怎么玩？' },
  { icon: '⚙️', text: '怎么填 API Key？' },
  { icon: '🔀', text: '分支功能是什么？' },
];
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩（点击关闭） -->
    <Transition name="ab-fade">
      <div v-if="show" class="ab-overlay" @click.self="handleClose"></div>
    </Transition>

    <!-- 抽屉 -->
    <Transition name="ab-slide">
      <div v-if="show" class="ab-drawer" role="dialog" aria-label="MyAI 助手">

        <!-- 顶部 -->
        <div class="ab-header">
          <div class="ab-header-info">
            <span class="ab-header-icon">✨</span>
            <div>
              <div class="ab-header-title">MyAI 小助手</div>
              <div class="ab-header-sub">有任何问题都可以问我，我也能帮你直接修改设置。</div>
            </div>
          </div>
          <button class="ab-close" @click="handleClose" aria-label="关闭">×</button>
        </div>

        <!-- 消息区 -->
        <div class="ab-messages" ref="messagesRef">
          <!-- 欢迎占位 -->
          <div v-if="messages.length === 0" class="ab-welcome">
            <div class="ab-welcome-icon">✨</div>
            <p class="ab-welcome-text">你好！我是 MyAI 小助手，可以帮你了解功能或直接修改设置。</p>
          </div>

          <!-- 消息列表 -->
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            :class="['ab-msg', msg.role === 'user' ? 'ab-msg-user' : 'ab-msg-ai']"
          >
            <div class="ab-bubble">
              <!-- 流式光标 -->
              <span v-if="msg.streaming && !msg.content" class="ab-cursor"></span>
              <template v-else>{{ msg.content }}</template>
              <span v-if="msg.streaming && msg.content" class="ab-cursor"></span>
            </div>
          </div>

          <!-- 快捷问题（首次打开时显示） -->
          <div v-if="quickChipsVisible && messages.length === 0" class="ab-chips">
            <p class="ab-chips-label">你可以问我：</p>
            <div class="ab-chips-grid">
              <button
                v-for="chip in CHIPS"
                :key="chip.text"
                class="ab-chip"
                @click="sendMessage(chip.text)"
              >
                <span>{{ chip.icon }}</span> {{ chip.text }}
              </button>
            </div>
          </div>
        </div>

        <!-- 底部输入框 -->
        <div class="ab-footer">
          <textarea
            ref="inputRef"
            v-model="userInput"
            class="ab-input"
            placeholder="问我任何问题…"
            rows="1"
            :disabled="isStreaming"
            @keydown="handleKeydown"
          ></textarea>
          <button
            class="ab-send"
            :disabled="!userInput.trim() || isStreaming"
            @click="sendMessage()"
            aria-label="发送"
          >
            <svg v-if="!isStreaming" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
            <span v-else class="ab-sending-dot"></span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 遮罩 ── */
.ab-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: var(--overlay-bg);
  backdrop-filter: blur(2px);
}

/* ── 抽屉 ── */
.ab-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 380px; z-index: 9999;
  background: var(--paper-card);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  box-shadow: -8px 0 40px var(--shadow-lg);
}

@media (max-width: 480px) {
  .ab-drawer { width: 100vw; }
}

/* ── 动画 ── */
.ab-fade-enter-active, .ab-fade-leave-active { transition: opacity 0.25s; }
.ab-fade-enter-from, .ab-fade-leave-to { opacity: 0; }

.ab-slide-enter-active { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.ab-slide-leave-active { transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1); }
.ab-slide-enter-from, .ab-slide-leave-to { transform: translateX(100%); }

/* ── 顶部 ── */
.ab-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.ab-header-info { display: flex; align-items: flex-start; gap: 10px; }
.ab-header-icon { font-size: 22px; margin-top: 1px; flex-shrink: 0; }
.ab-header-title { font-size: 15px; font-weight: 600; color: var(--ink); }
.ab-header-sub   { font-size: 11px; color: var(--ink-faint); margin-top: 2px; line-height: 1.4; }
.ab-close {
  background: none; border: none; color: var(--ink-faint);
  font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1;
  transition: color 0.15s; flex-shrink: 0;
}
.ab-close:hover { color: var(--ink); }

/* ── 消息区 ── */
.ab-messages {
  flex: 1; overflow-y: auto; padding: 16px 12px;
  display: flex; flex-direction: column; gap: 10px;
  scroll-behavior: smooth;
}
.ab-messages::-webkit-scrollbar { width: 4px; }
.ab-messages::-webkit-scrollbar-track { background: transparent; }
.ab-messages::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

/* ── 欢迎 ── */
.ab-welcome {
  text-align: center; padding: 24px 12px 8px;
  color: var(--ink-faint); font-size: 13px;
}
.ab-welcome-icon { font-size: 36px; margin-bottom: 10px; }
.ab-welcome-text { line-height: 1.5; }

/* ── 消息气泡 ── */
.ab-msg { display: flex; }
.ab-msg-user  { justify-content: flex-end; }
.ab-msg-ai    { justify-content: flex-start; }

.ab-bubble {
  max-width: 88%; padding: 9px 13px;
  border-radius: 14px; font-size: 13px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
}

.ab-msg-user .ab-bubble {
  background: var(--user-bubble-bg);
  color: var(--user-bubble-text); border-bottom-right-radius: 4px;
}
.ab-msg-ai .ab-bubble {
  background: var(--ai-bubble-bg);
  border: 1px solid var(--ai-bubble-border);
  color: var(--ink); border-bottom-left-radius: 4px;
}

/* ── 流式光标 ── */
.ab-cursor {
  display: inline-block; width: 2px; height: 14px;
  background: var(--ink-faint); margin-left: 2px;
  vertical-align: text-bottom;
  animation: ab-blink 0.9s step-end infinite;
}
@keyframes ab-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* ── 快捷问题 ── */
.ab-chips { margin-top: 8px; }
.ab-chips-label { font-size: 11px; color: var(--ink-faint); margin-bottom: 8px; }
.ab-chips-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ab-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px;
  background: var(--brush);
  border: 1px solid var(--border);
  border-radius: 10px; color: var(--accent);
  font-size: 12px; cursor: pointer; text-align: left;
  transition: all 0.15s;
}
.ab-chip:hover {
  border-color: var(--border-accent);
}

/* ── 底部输入 ── */
.ab-footer {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 12px 12px 14px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.ab-input {
  flex: 1; resize: none; min-height: 36px; max-height: 120px;
  padding: 8px 12px; background: var(--brush);
  border: 1px solid var(--border); border-radius: 10px;
  color: var(--ink); font-size: 13px; line-height: 1.5;
  outline: none; font-family: inherit;
  transition: border-color 0.15s;
}
.ab-input:focus { border-color: var(--accent); }
.ab-input:disabled { opacity: 0.5; }
.ab-input::placeholder { color: var(--ink-faint); opacity: .6; }

.ab-send {
  width: 36px; height: 36px; flex-shrink: 0;
  background: var(--accent);
  border: none; border-radius: 10px; color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: opacity 0.15s;
}
.ab-send:disabled { opacity: 0.35; cursor: not-allowed; }
.ab-send:not(:disabled):hover { opacity: 0.85; }

.ab-sending-dot {
  width: 8px; height: 8px; background: white;
  border-radius: 50%; animation: ab-pulse-dot 1s ease infinite;
}
@keyframes ab-pulse-dot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity:0.5; transform: scale(0.7); } }
</style>
