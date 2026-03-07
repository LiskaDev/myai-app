<script setup>
/**
 * BookImport.vue — TXT 文件上传 + AI 分块提取世界书条目
 * 逻辑复用自 WorldBookExtractor.vue 的 TXT 提取模式
 * 完成后 emit('done', book) 返回新书对象
 */
import { ref, computed } from 'vue';
import { splitIntoChunks } from '../../utils/novelUtils.js';
import ModelConfigPanel from './ModelConfigPanel.vue';

const props = defineProps({
  globalSettings: { type: Object, required: true },
});

const emit = defineEmits(['done', 'cancel']);

// ── 阶段 ──
const PHASE = { UPLOAD: 'upload', CONFIG: 'config', EXTRACTING: 'extracting', PREVIEW: 'preview' };
const phase = ref(PHASE.UPLOAD);

// ── 文件 ──
const fileText = ref('');
const fileName = ref('');
const isDragging = ref(false);
const fileInputRef = ref(null);
const CHUNK_SIZE = 8000;
const chunks = ref([]);

// ── 书籍配置 ──
const bookTitle = ref('');
const coverEmoji = ref('📖');
const EMOJI_PRESETS = ['📖', '⚔️', '🏔️', '🌊', '🔮', '🌌', '🏯', '🎴', '🌸', '🐉'];

// ── 提取进度 ──
const extractedEntries = ref([]);
const currentChunkIndex = ref(0);
const isPaused = ref(false);
const isStopped = ref(false);
const failedChunks = ref([]);
const extractionAbort = ref(null);
const error = ref('');

// ── 费用估算（价格单位：¥/百万 token，按需更新此表）──
const MODEL_PRICING = {
  'deepseek-chat':      { input: 2,    inputCached: 0.2,  output: 3   },
  'deepseek-reasoner':  { input: 2,    inputCached: 0.2,  output: 3   },
  'deepseek-r1':        { input: 2,    inputCached: 0.2,  output: 3   },
  'deepseek-v3':        { input: 2,    inputCached: 0.2,  output: 8   },
  'gpt-4o-mini':        { input: 1.1,  inputCached: 0.28, output: 4.3 },
  'gpt-4o':             { input: 18,   inputCached: 9,    output: 72  },
  'gpt-4':              { input: 216,  inputCached: 108,  output: 432 },
  'gpt-3.5':            { input: 11,   inputCached: 5.5,  output: 15  },
  'claude-3-5-sonnet':  { input: 22,   inputCached: 2.7,  output: 108 },
  'claude-3-5-haiku':   { input: 2.9,  inputCached: 0.72, output: 14  },
  'claude-3-haiku':     { input: 1.8,  inputCached: 0.45, output: 8.6 },
  'claude-3-opus':      { input: 108,  inputCached: 27,   output: 540 },
  'gemini-2.0-flash':   { input: 0.54, inputCached: 0.09, output: 2.3 },
  'gemini-1.5-flash':   { input: 0.54, inputCached: 0.09, output: 2.2 },
  'gemini-1.5-pro':     { input: 8.6,  inputCached: 2.2,  output: 34  },
  'qwen-max':           { input: 8,    inputCached: 2,    output: 24  },
  'qwen-plus':          { input: 0.8,  inputCached: 0.2,  output: 2.4 },
  'qwen-turbo':         { input: 0.3,  inputCached: 0.075,output: 0.6 },
};

// 本次提取专用配置（不修改全局设置）
const localConfig    = ref({ baseUrl: '', apiKey: '', model: '' });
const showConfigPanel = ref(false);

// 游玩模型（独立于提取模型）
const gameModel          = ref({ baseUrl: '', apiKey: '', model: '' });
const showGameModelPanel = ref(false);

function saveGameModel(config) {
  gameModel.value = { ...config };
  showGameModelPanel.value = false;
}

function findPricing(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (MODEL_PRICING[n]) return MODEL_PRICING[n];
  for (const [key, p] of Object.entries(MODEL_PRICING)) {
    if (n.includes(key) || key.includes(n)) return p;
  }
  return null;
}

const totalChars = computed(() => fileText.value.length);
const progress = computed(() => {
  if (!chunks.value.length) return 0;
  return Math.round(((currentChunkIndex.value + 1) / chunks.value.length) * 100);
});

// 输入 token 估算：中文约 1.5 字/token
const estInputTokens  = computed(() => Math.round(totalChars.value / 1.5));
// 输出 token 估算：每块平均提取 200 token 的 JSON
const estOutputTokens = computed(() => chunks.value.length * 200);
const currentPricing  = computed(() => findPricing(localConfig.value.model));
// 最低费用：输入全命中缓存
const costMin = computed(() => {
  const p = currentPricing.value;
  if (!p) return null;
  return (estInputTokens.value * p.inputCached + estOutputTokens.value * p.output) / 1_000_000;
});
// 最高费用：输入全未命中缓存
const costMax = computed(() => {
  const p = currentPricing.value;
  if (!p) return null;
  return (estInputTokens.value * p.input + estOutputTokens.value * p.output) / 1_000_000;
});
const costRangeClass = computed(() => {
  const c = costMax.value;
  if (c === null) return 'cost-unknown';
  if (c < 1) return 'cost-low';
  if (c < 5) return 'cost-mid';
  return 'cost-high';
});
function fmtCost(v) {
  return v < 0.01 ? v.toFixed(4) : v.toFixed(2);
}

// ── EXTRACT_SYSTEM_PROMPT (same as WorldBookExtractor) ──
const EXTRACT_SYSTEM_PROMPT = `你是一个专业的小说设定提取助手。请从以下文本中提取所有出现的世界观设定，包括：地点、种族、势力、功法/魔法体系、重要物品、历史事件等。

重要规则：
- 忽略所有非正文内容：广告、水印、版权声明、译者注、章节标题、作者声明、平台推广、求票求收藏等
- 只提取故事内首次出现或有详细描写的设定，不要重复提取同一设定
- 人物角色不算世界设定（不要提取主角、配角等人物信息）

严格只返回 JSON 数组，不要任何解释文字，不要 markdown 代码块。
格式：
[{"name":"条目名","keywords":["词1","词2"],"content":"详细描述100-200字","category":"地理|种族|势力|功法|物品|历史|其他"}]
如果该段文本没有可提取的设定，返回空数组 []`;

// ── 文件处理 ──
function handleFile(file) {
  if (!file || !file.name.endsWith('.txt')) {
    error.value = '请上传 .txt 文件';
    return;
  }
  error.value = '';
  fileName.value = file.name;
  // Try auto-detect title from filename
  bookTitle.value = file.name.replace(/\.txt$/i, '').replace(/[-_]/g, ' ').trim();

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const garbledRatio = (text.match(/\uFFFD/g) || []).length / Math.max(text.length, 1);
    if (garbledRatio > 0.05) {
      const gbkReader = new FileReader();
      gbkReader.onload = (e2) => {
        fileText.value = e2.target.result;
        chunks.value = splitIntoChunks(fileText.value, CHUNK_SIZE);
        localConfig.value = initLocalConfig();
        phase.value = PHASE.CONFIG;
      };
      gbkReader.readAsText(file, 'GBK');
    } else {
      fileText.value = text;
      chunks.value = splitIntoChunks(text, CHUNK_SIZE);
      localConfig.value = initLocalConfig();
      phase.value = PHASE.CONFIG;
    }
  };
  reader.readAsText(file, 'utf-8');
}

function handleFileDrop(e) {
  e.preventDefault();
  isDragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
}

function handleFileInput(e) {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
  e.target.value = '';
}

// ── 提取 JSON ──
function extractJsonArray(raw) {
  if (!raw?.trim()) return [];
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try {
    const p = JSON.parse(text);
    if (Array.isArray(p)) return p;
  } catch { /* continue */ }
  const start = text.indexOf('[');
  if (start === -1) return [];
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    if (text[i] === ']') depth--;
    if (depth === 0) { end = i; break; }
  }
  if (end === -1) return [];
  try {
    const p = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(p)) return p;
  } catch { /* ignore */ }
  return [];
}

function initLocalConfig() {
  const s = props.globalSettings;
  return {
    baseUrl: s.bgBaseUrl || s.baseUrl || 'https://api.deepseek.com',
    apiKey:  s.bgApiKey  || s.apiKey  || '',
    model:   s.bgModel   || s.model   || 'deepseek-chat',
  };
}

function getApiConfig() {
  return {
    baseUrl: (localConfig.value.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, ''),
    apiKey:  localConfig.value.apiKey  || '',
    model:   localConfig.value.model   || 'deepseek-chat',
  };
}

// ── 开始提取 ──
async function startExtraction() {
  const { apiKey } = getApiConfig();
  if (!apiKey) { error.value = '请先在设置中配置 API Key'; return; }
  if (!bookTitle.value.trim()) { error.value = '请填写书名'; return; }

  phase.value = PHASE.EXTRACTING;
  extractedEntries.value = [];
  failedChunks.value = [];
  error.value = '';
  isPaused.value = false;
  isStopped.value = false;
  currentChunkIndex.value = 0;
  await processChunks(0);
}

async function processChunks(startFrom) {
  const { baseUrl, apiKey, model } = getApiConfig();

  for (let i = startFrom; i < chunks.value.length; i++) {
    if (isStopped.value) break;
    while (isPaused.value && !isStopped.value) {
      await new Promise(r => setTimeout(r, 200));
    }
    if (isStopped.value) break;

    currentChunkIndex.value = i;

    try {
      const controller = new AbortController();
      extractionAbort.value = controller;

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
            { role: 'user', content: `请提取以下文本中的世界观设定：\n\n${chunks.value[i]}` },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const entries = extractJsonArray(data.choices?.[0]?.message?.content || '');
      for (const e of entries) {
        e._chunkIndex = i;
        extractedEntries.value.push(e);
      }
    } catch (err) {
      if (err.name === 'AbortError') break;
      console.warn(`[BookImport] 块 ${i} 失败:`, err.message);
      failedChunks.value.push(i);
    }

    if (i < chunks.value.length - 1 && !isStopped.value) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // dedup
  const map = new Map();
  for (const e of extractedEntries.value) {
    const key = e.name?.trim();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || (e.content || '').length > (existing.content || '').length) {
      map.set(key, e);
    }
  }
  extractedEntries.value = Array.from(map.values());
  phase.value = PHASE.PREVIEW;
}

function pauseExtraction() { isPaused.value = true; }
function resumeExtraction() { isPaused.value = false; }
function stopExtraction() {
  isStopped.value = true;
  extractionAbort.value?.abort();
}

// ── 完成 ──
function finish() {
  const book = {
    id: crypto.randomUUID(),
    title: bookTitle.value.trim() || fileName.value,
    coverEmoji: coverEmoji.value,
    createdAt: Date.now(),
    style: 'xianxia',
    difficulty: 1,
    worldEntries: extractedEntries.value,
    saves: [null, null, null, null],
    novelModel: { ...gameModel.value },
  };
  emit('done', book);
}
</script>

<template>
  <div class="book-import">

    <!-- Upload Phase -->
    <div v-if="phase === 'upload'" class="phase-upload">
      <div class="phase-title">📄 导入小说</div>
      <div
        class="drop-zone"
        :class="{ dragging: isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop="handleFileDrop"
        @click="fileInputRef?.click()"
      >
        <div class="drop-icon">📄</div>
        <div class="drop-text">拖入 .txt 文件，或点击选择</div>
        <div class="drop-sub">支持大型小说文件，将分段提取世界观设定</div>
      </div>
      <input ref="fileInputRef" type="file" accept=".txt" style="display:none" @change="handleFileInput" />
      <div v-if="error" class="error-msg">⚠️ {{ error }}</div>
      <button class="cancel-btn" @click="$emit('cancel')">取消</button>
    </div>

    <!-- Config Phase -->
    <div v-else-if="phase === 'config'" class="phase-config">
      <div class="phase-title">⚙️ 书籍设置</div>
      <div class="file-info">已读入：{{ fileName }}（{{ (totalChars / 10000).toFixed(1) }} 万字，共 {{ chunks.length }} 块）</div>

      <div class="form-group">
        <label class="form-label">书名</label>
        <input v-model="bookTitle" class="form-input" placeholder="请输入书名" maxlength="40" />
      </div>

      <div class="form-group">
        <label class="form-label">封面图标</label>
        <div class="emoji-picker">
          <button
            v-for="e in EMOJI_PRESETS"
            :key="e"
            :class="['emoji-btn', coverEmoji === e && 'active']"
            @click="coverEmoji = e"
          >{{ e }}</button>
        </div>
      </div>

      <!-- 费用估算 -->
      <div class="cost-estimate">
        <div class="cost-header-row">
          <div>
            <div class="cost-range-label">预计费用</div>
            <div v-if="costMin !== null" :class="['cost-range', costRangeClass]">
              <span v-if="costRangeClass === 'cost-high'">⚠️ </span>
              ¥{{ fmtCost(costMin) }} ~ ¥{{ fmtCost(costMax) }}
            </div>
            <div v-else class="cost-range cost-unknown">费用未知，请确认模型定价后再开始</div>
          </div>
          <button class="change-model-btn" @click="showConfigPanel = !showConfigPanel">
            {{ showConfigPanel ? '收起' : '更换模型' }}
          </button>
        </div>

        <div class="cost-meta-row">
          <span class="cost-meta-item">模型：<span class="cost-model-name">{{ localConfig.model }}</span></span>
          <span class="cost-meta-item">Token：约 {{ estInputTokens.toLocaleString() }} 输入 · {{ estOutputTokens.toLocaleString() }} 输出</span>
        </div>

        <div v-if="currentPricing" class="cost-hint">
          ℹ️ 左侧为全部命中缓存的最低费用，右侧为全部未命中时的最高费用，首次导入通常接近上限
        </div>
        <div v-else-if="localConfig.model" class="cost-hint cost-hint-warn">
          ⚠️ 该模型无定价数据，请确认费用后再开始
        </div>

        <!-- 模型配置面板（点击「更换模型」展开）-->
        <ModelConfigPanel
          v-if="showConfigPanel"
          v-model="localConfig"
          @close="showConfigPanel = false"
        />
      </div>

      <div class="config-note">
        <span>✨</span>
        <span>AI 将依次分析每个段落，自动提取地点、势力、功法等世界观条目。提取完成后你可以预览并确认导入。</span>
      </div>

      <div v-if="error" class="error-msg">⚠️ {{ error }}</div>

      <div class="config-btns">
        <button class="cancel-btn" @click="phase = 'upload'">← 返回</button>
        <button class="start-btn" @click="startExtraction">开始提取 →</button>
      </div>
    </div>

    <!-- Extracting Phase -->
    <div v-else-if="phase === 'extracting'" class="phase-extracting">
      <div class="phase-title">🔍 正在提取世界观…</div>

      <div class="extract-progress">
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="progress-text">
          块 {{ currentChunkIndex + 1 }} / {{ chunks.length }} &nbsp;·&nbsp; {{ progress }}%
        </div>
      </div>

      <div class="entry-count">已提取 {{ extractedEntries.length }} 条设定</div>

      <div v-if="failedChunks.length" class="failed-note">⚠️ {{ failedChunks.length }} 块处理失败（将跳过）</div>

      <div class="extract-btns">
        <button v-if="!isPaused" class="pause-btn" @click="pauseExtraction">⏸ 暂停</button>
        <button v-else class="resume-btn" @click="resumeExtraction">▶ 继续</button>
        <button class="stop-btn" @click="stopExtraction">⏹ 停止并预览</button>
      </div>
    </div>

    <!-- Preview Phase -->
    <div v-else-if="phase === 'preview'" class="phase-preview">
      <div class="phase-title">✅ 提取完成</div>
      <div class="preview-summary">
        共提取 <strong>{{ extractedEntries.length }}</strong> 条世界观条目
        <span v-if="failedChunks.length">（{{ failedChunks.length }} 块失败）</span>
      </div>

      <div class="entry-list">
        <div v-for="entry in extractedEntries" :key="entry.name" class="entry-item">
          <span class="entry-cat">{{ entry.category || '其他' }}</span>
          <span class="entry-name">{{ entry.name }}</span>
        </div>
      </div>

      <!-- 游玩模型（可选） -->
      <div class="game-model-section">
        <div class="game-model-bar">
          <span class="game-model-label">游玩模型</span>
          <span class="game-model-name">{{ gameModel.model || localConfig.model || '跟随全局设置' }}</span>
          <button class="game-model-btn" @click="showGameModelPanel = !showGameModelPanel">
            {{ showGameModelPanel ? '收起' : '⚙ 配置' }}
          </button>
        </div>
        <div v-if="!gameModel.apiKey" class="game-model-hint">可选：单独为此书配置游玩模型（与提取模型无关）</div>
        <ModelConfigPanel
          v-if="showGameModelPanel"
          :model-value="gameModel"
          @update:model-value="saveGameModel"
          @close="showGameModelPanel = false"
        />
      </div>

      <div class="preview-btns">
        <button class="cancel-btn" @click="$emit('cancel')">取消导入</button>
        <button class="finish-btn" @click="finish">导入书库 →</button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.book-import {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 0 0 40px;
}

.phase-title {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  margin-bottom: 24px;
  letter-spacing: 1px;
}

/* ── Drop Zone ── */
.drop-zone {
  border: 2px dashed rgba(139,92,246,0.3);
  border-radius: 16px;
  padding: 40px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s;
  background: rgba(139,92,246,0.04);
  margin-bottom: 16px;
}
.drop-zone:hover, .drop-zone.dragging {
  border-color: rgba(139,92,246,0.6);
  background: rgba(139,92,246,0.08);
}
.drop-icon { font-size: 40px; margin-bottom: 12px; }
.drop-text { font-size: 15px; color: rgba(255,255,255,0.7); margin-bottom: 6px; }
.drop-sub { font-size: 12px; color: rgba(255,255,255,0.35); }

/* ── File Info ── */
.file-info {
  font-size: 12px;
  color: rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.04);
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 20px;
}

/* ── Form ── */
.form-group { margin-bottom: 18px; }
.form-label {
  display: block;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}
.form-input {
  width: 100%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 10px 14px;
  color: rgba(255,255,255,0.85);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.form-input:focus { border-color: rgba(139,92,246,0.5); }

.emoji-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.emoji-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}
.emoji-btn.active {
  background: rgba(139,92,246,0.2);
  border-color: rgba(139,92,246,0.5);
}
.emoji-btn:hover { border-color: rgba(255,255,255,0.2); }

.config-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(59,130,246,0.06);
  border: 1px solid rgba(59,130,246,0.15);
  border-radius: 10px;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  line-height: 1.6;
  margin-bottom: 20px;
}

/* ── Progress ── */
.extract-progress { margin: 20px 0; }
.progress-bar-wrap {
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 10px;
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(139,92,246,0.8), rgba(59,130,246,0.8));
  border-radius: 2px;
  transition: width 0.5s ease;
}
.progress-text { font-size: 12px; color: rgba(255,255,255,0.4); }
.entry-count { font-size: 14px; color: rgba(192,132,252,0.8); margin: 8px 0; }
.failed-note { font-size: 12px; color: rgba(239,68,68,0.7); margin: 6px 0; }

/* ── Entry List ── */
.entry-list {
  max-height: 260px;
  overflow-y: auto;
  margin: 16px 0;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 8px;
}
.entry-list::-webkit-scrollbar { width: 3px; }
.entry-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.entry-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
}
.entry-item:hover { background: rgba(255,255,255,0.03); }
.entry-cat {
  padding: 1px 7px;
  background: rgba(139,92,246,0.12);
  border-radius: 8px;
  color: rgba(192,132,252,0.8);
  font-size: 10px;
  flex-shrink: 0;
}
.entry-name { color: rgba(255,255,255,0.7); }

.preview-summary { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.preview-summary strong { color: rgba(192,132,252,0.9); }

/* ── Game Model Section ── */
.game-model-section { margin: 16px 0 4px; }
.game-model-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; }
.game-model-label { font-size: 11px; color: rgba(255,255,255,0.3); flex-shrink: 0; }
.game-model-name { font-size: 12px; color: rgba(200,168,74,0.75); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.game-model-btn { padding: 4px 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: rgba(255,255,255,0.45); font-size: 11px; cursor: pointer; flex-shrink: 0; }
.game-model-hint { font-size: 11px; color: rgba(255,255,255,0.2); padding: 4px 2px; }

/* ── Buttons ── */
.error-msg {
  font-size: 12px;
  color: #f87171;
  margin-bottom: 12px;
}

.config-btns, .preview-btns, .extract-btns {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.cancel-btn {
  padding: 10px 22px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  color: rgba(255,255,255,0.5);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.cancel-btn:hover { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); }

.start-btn, .finish-btn {
  padding: 10px 28px;
  background: linear-gradient(135deg, rgba(139,92,246,0.8), rgba(59,130,246,0.7));
  border: none;
  border-radius: 20px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.5px;
}
.start-btn:hover, .finish-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(139,92,246,0.3);
}

.pause-btn, .resume-btn {
  padding: 9px 20px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 16px;
  color: rgba(255,255,255,0.6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.stop-btn {
  padding: 9px 20px;
  background: rgba(139,92,246,0.1);
  border: 1px solid rgba(139,92,246,0.25);
  border-radius: 16px;
  color: rgba(192,132,252,0.8);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

/* ── Cost Estimate ── */
.cost-estimate {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.cost-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.cost-range-label {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  margin-bottom: 4px;
  letter-spacing: 0.3px;
}
.cost-range {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}
.cost-low    { color: #4ade80; }
.cost-mid    { color: #fbbf24; }
.cost-high   { color: #f87171; }
.cost-unknown { color: rgba(255,255,255,0.35); font-size: 13px; font-weight: 400; }
.change-model-btn {
  padding: 4px 12px;
  background: rgba(139,92,246,0.12);
  border: 1px solid rgba(139,92,246,0.25);
  border-radius: 8px;
  color: rgba(192,132,252,0.8);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  transition: all 0.2s;
}
.change-model-btn:hover {
  background: rgba(139,92,246,0.2);
  border-color: rgba(139,92,246,0.4);
}
.cost-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}
.cost-meta-item {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
}
.cost-model-name {
  color: rgba(192,132,252,0.75);
  font-family: monospace;
}
.cost-hint {
  font-size: 11px;
  color: rgba(255,255,255,0.28);
  line-height: 1.5;
}
.cost-hint-warn { color: rgba(251,191,36,0.65); }
</style>
