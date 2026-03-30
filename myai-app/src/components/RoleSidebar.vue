<script setup>
import { ref, computed } from 'vue';
import { extractExpression } from '../utils/textParser';

const props = defineProps({
  roleList: Array,
  currentRoleId: [String, Number],
  showSidebar: Boolean,
});

const EXPR_EMOJI = { joy: '😊', sadness: '😢', anger: '😠', surprise: '😲', fear: '😰', disgust: '😒', neutral: '😐', love: '🥰' };

const sidebarSearch = ref('');
const filteredRoles = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase();
  if (!q) return props.roleList;
  return props.roleList.filter(r => r.name.toLowerCase().includes(q));
});

function getActiveHistory(role) {
  if (role.branches && role.branches.length > 0) {
    const branch = role.branches.find(b => b.id === role.activeBranchId) || role.branches[0];
    return branch.chatHistory || [];
  }
  return role.chatHistory || [];
}

function getRoleMood(role) {
  const hist = getActiveHistory(role);
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].role === 'assistant') {
      const { expression } = extractExpression(hist[i].rawContent || hist[i].content || '');
      return EXPR_EMOJI[expression] || '😊';
    }
  }
  return '💤';
}

function getRoleLastLine(role) {
  const hist = getActiveHistory(role);
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].role === 'assistant') {
      let raw = hist[i].rawContent || hist[i].content || '';
      const thinkStart = raw.indexOf('<think>');
      const thinkEnd = raw.indexOf('</think>');
      if (thinkStart !== -1 && thinkEnd === -1) continue;
      if (thinkStart === -1 && thinkEnd !== -1) raw = raw.substring(thinkEnd + 8);
      const clean = raw
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/<inner>[\s\S]*?<\/inner>/g, '')
        .replace(/<expr:[^>]+>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\*[^*]+\*/g, '')
        .trim();
      const first = clean.split(/[。！？\n]/)[0].trim();
      if (first) return first.slice(0, 30);
    }
  }
  return '';
}

const emit = defineEmits([
  'switch-role', 'create-role', 'ai-create-role', 'delete-role',
  'export-role', 'generate-card', 'open-card-library', 'close',
  'avatar-error', 'import-sillytavern',
]);

const stFileInput = ref(null);

function triggerStImport() {
  stFileInput.value?.click();
}

async function onStFileSelected(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const cardData = await parseSillyTavernPng(file);
    emit('import-sillytavern', cardData);
  } catch (err) {
    alert('角色卡解析失败：' + err.message);
  }
}

/**
 * 解析 SillyTavern PNG 角色卡
 * PNG tEXt chunk: 4字节长度 + 4字节类型 + data(key\0value) + 4字节CRC
 * key="chara"，value 是 base64 编码的 JSON
 */
async function parseSillyTavernPng(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // 验证 PNG 签名
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error('不是有效的 PNG 文件');
  }

  // 遍历 chunks
  let offset = 8;
  while (offset < bytes.length - 12) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
    const dataStart = offset + 8;

    if (type === 'tEXt' || type === 'iTXt') {
      // 找 null byte 分隔符
      let nullIdx = dataStart;
      while (nullIdx < dataStart + length && bytes[nullIdx] !== 0) nullIdx++;
      const key = new TextDecoder().decode(bytes.slice(dataStart, nullIdx));

      if (key === 'chara') {
        // iTXt 需要跳过额外的元数据字节
        const valueStart = type === 'iTXt' ? nullIdx + 3 : nullIdx + 1;
        const rawValue = new TextDecoder().decode(bytes.slice(valueStart, dataStart + length));
        const jsonStr = atob(rawValue.trim());
        const parsed = JSON.parse(jsonStr);

        // 支持 V1 和 V2 格式
        const card = parsed.spec === 'chara_card_v2' ? parsed.data : parsed;
        return card;
      }
    }

    offset = dataStart + length + 4; // +4 跳过 CRC
    if (length === 0 && type === 'IEND') break;
  }

  throw new Error('未找到角色卡数据（chara chunk），请确认是 SillyTavern 导出的角色卡 PNG');
}

const libraryCount = computed(() => {
  try { return JSON.parse(localStorage.getItem('myai_card_library_v1') || '[]').length; }
  catch { return 0; }
});
</script>

<template>
  <!-- 侧边栏 -->
  <div class="sidebar" :class="{ hidden: !showSidebar }">
    <div class="sidebar-inner">

      <!-- 头部 -->
      <div class="sidebar-head">
        <span class="sidebar-title">🎭 角色列表</span>
        <button class="sidebar-close" @click="$emit('close')">
          <svg class="svg-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- 搜索 -->
      <div class="sidebar-search-wrap">
        <input v-model="sidebarSearch" type="text" placeholder="搜索角色…"
               class="sidebar-search" />
      </div>

      <div class="sidebar-scroll-area">
        <!-- 角色列表 -->
        <div class="role-list">
          <div v-for="role in filteredRoles" :key="role.id"
               class="role-item"
               :class="{ active: role.id === currentRoleId }"
               @click="$emit('switch-role', role.id)">
            <div class="role-ava-wrap">
              <div v-if="role.avatar" class="role-ava">
                <img :src="role.avatar" alt="" class="ava-img"
                     @error="$emit('avatar-error', 'ai', role.id)">
              </div>
              <div v-else class="role-ava role-ava-placeholder">🎭</div>
              <span class="mood-dot">{{ getRoleMood(role) }}</span>
            </div>
            <div class="role-meta">
              <div class="role-name">{{ role.name }}</div>
              <div class="role-preview">
                {{ getActiveHistory(role).length
                  ? getRoleLastLine(role)
                  : (role.firstMessage || '点击开始对话').replace(/<[^>]+>/g, '').slice(0, 28) }}
              </div>
            </div>
            <div class="role-actions">
              <button class="role-action-btn" @click.stop="$emit('export-role', role.id)" title="导出">
                <svg class="svg-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
              </button>
              <button class="role-action-btn" @click.stop="$emit('generate-card', role.id)" title="角色卡">
                <span>🃏</span>
              </button>
              <button class="role-action-btn danger" @click.stop="$emit('delete-role', role.id)" title="删除">
                <svg class="svg-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 创建角色 -->
        <div class="sidebar-btns">
          <button class="create-btn" @click="$emit('create-role')">➕ 创建新角色</button>
          <button class="create-btn ai-btn" @click="$emit('ai-create-role')">✨ AI 生成角色</button>
          <button class="create-btn st-btn" @click="triggerStImport" title="导入 SillyTavern 角色卡 PNG">🃏 导入酒馆角色卡</button>
          <input ref="stFileInput" type="file" accept="image/png" class="hidden" @change="onStFileSelected" />
        </div>
      </div>

      <!-- 卡片库入口 -->
      <div class="card-lib-entry" @click="$emit('open-card-library')">
        <span>🃏</span>
        <span class="card-lib-label">我的卡片库</span>
        <span v-if="libraryCount > 0" class="card-lib-count">{{ libraryCount }}</span>
      </div>

    </div>
  </div>

  <!-- 遮罩 -->
  <div v-if="showSidebar" class="sidebar-overlay" @click="$emit('close')"></div>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0; bottom: 0; left: 0;
  width: 300px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  z-index: 30;
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform .3s ease, background .3s, border-color .3s;
  box-shadow: 2px 0 16px var(--shadow);
}
.sidebar.hidden { transform: translateX(-100%); }

.sidebar-inner { 
  display: flex; 
  flex-direction: column; 
  height: 100%;
  padding: 16px; 
}
.sidebar-scroll-area { 
  flex: 1; 
  overflow-y: auto;
  padding-right: 4px; /* 防止滚动条贴脸 */
}
.sidebar-scroll-area::-webkit-scrollbar { width: 3px; }
.sidebar-scroll-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.sidebar-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.sidebar-title {
  font-family: 'Noto Serif SC', serif;
  font-size: 16px; font-weight: 500; color: var(--ink);
  transition: color .3s;
}
.sidebar-close {
  width: 32px; height: 32px; border-radius: 8px; border: none;
  background: transparent; color: var(--ink-faint);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.sidebar-close:active { background: var(--brush); }

.sidebar-search-wrap { 
  margin-bottom: 12px; 
  flex-shrink: 0;
}
.sidebar-search {
  width: 100%; padding: 9px 14px; border-radius: 22px;
  border: 1px solid var(--border); background: var(--paper-card);
  font-family: 'Noto Sans SC', sans-serif; font-size: 13px;
  color: var(--ink); outline: none; transition: border-color .2s, background .3s;
}
.sidebar-search::placeholder { color: var(--ink-faint); opacity: .6; }
.sidebar-search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--brush); }

/* ── 角色列表 ── */
.role-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }

.role-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer; transition: all .15s;
  background: transparent;
}
.role-item:hover { background: var(--brush); }
.role-item.active {
  background: var(--brush);
  border-color: var(--border);
  box-shadow: 0 1px 4px var(--shadow);
  border-left: 3px solid var(--accent);
}

.role-ava-wrap { position: relative; flex-shrink: 0; }
.role-ava {
  width: 40px; height: 40px; border-radius: 50%;
  overflow: hidden; border: 1.5px solid var(--border);
  background: linear-gradient(135deg, #b8a89a, #8b6f5e);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; transition: all .3s;
}
[data-theme="dark"] .role-ava {
  background: linear-gradient(135deg, #a090e0, #6040c0);
  border-color: rgba(139,120,255,0.3);
}
.role-ava-placeholder { background: linear-gradient(135deg, #c4b8ae, #9e8478); }
.mood-dot {
  position: absolute; bottom: -2px; right: -2px;
  font-size: 11px; line-height: 1;
  background: var(--paper-card);
  border-radius: 50%; padding: 1px;
  border: 1px solid var(--border);
}

.role-meta { flex: 1; min-width: 0; }
.role-name {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 14px; font-weight: 500; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: color .3s;
}
.role-preview {
  font-size: 12px; color: var(--ink-faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-style: italic; margin-top: 2px; transition: color .3s;
}

.role-actions {
  display: flex; align-items: center; gap: 2px;
  opacity: 0; transition: opacity .15s;
}
.role-item:hover .role-actions { opacity: 1; }
/* 触屏设备始终显示 */
@media (hover: none) { .role-actions { opacity: 1; } }

.role-action-btn {
  width: 28px; height: 28px; border-radius: 8px; border: none;
  background: transparent; color: var(--ink-faint);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 14px; transition: all .15s;
}
.role-action-btn:hover { background: var(--brush); color: var(--ink); }
.role-action-btn.danger:hover { background: rgba(192,112,112,0.15); color: #c07070; }
.role-action-btn:active { transform: scale(.88); }

/* ── 按钮 ── */
.sidebar-btns { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.create-btn {
  width: 100%; padding: 10px 16px; border-radius: 12px;
  border: 1.5px dashed var(--border); background: transparent;
  font-family: 'Noto Sans SC', sans-serif; font-size: 13px;
  color: var(--ink-faint); cursor: pointer; text-align: center;
  transition: all .15s;
}
.create-btn:hover { background: var(--brush); color: var(--ink); border-color: var(--accent); }
.create-btn:active { transform: scale(.98); }
.ai-btn { background: rgba(196,150,58,0.06); }
.st-btn { background: rgba(99,102,241,0.07); font-size: 12px; }


/* ── 卡片库 ── */
.card-lib-entry {
  flex-shrink: 0;
  position: relative; z-index: 1;
  display: flex; align-items: center; gap: 8px;
  margin: 0 -16px; padding: 11px 30px;
  cursor: pointer;
  box-shadow: 0 -1px 6px var(--shadow);
  transition: background .15s;
}
.card-lib-entry:hover { background: var(--brush); }
.card-lib-label {
  flex: 1; font-family: 'Noto Sans SC', sans-serif;
  font-size: 13px; color: var(--ink-faint); transition: color .3s;
}
.card-lib-count {
  font-size: 11px; background: var(--brush); color: var(--accent);
  border: 1px solid var(--border); padding: 1px 8px; border-radius: 999px;
}

/* ── 遮罩 ── */
.sidebar-overlay {
  position: fixed; inset: 0;
  background: var(--overlay-bg);
  z-index: 20; backdrop-filter: blur(2px);
}

.svg-md { width: 20px; height: 20px; }
.svg-sm { width: 16px; height: 16px; }
.ava-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
</style>