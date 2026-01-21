<script setup>
import { ref } from 'vue';

const props = defineProps({
  globalSettings: Object,
  currentRole: Object,
  availableVoices: Array,
  roleList: Array,
  importJson: String,
  memoryEditState: Object
});

const emit = defineEmits([
  'close',
  'save-data',
  'load-data',
  'export-data',
  'import-data',
  'show-import-modal',
  'clear-all-data',
  'add-manual-memory',
  'remove-manual-memory',
  'start-edit-memory',
  'save-edit-memory',
  'cancel-edit-memory',
  'toggle-memory-expand',
  'refine-memory'
]);

// Reset custom style to defaults
function resetCustomStyle() {
  if (props.globalSettings && props.globalSettings.customStyle) {
    props.globalSettings.customStyle = {
      actionColor: '#a1a1aa',
      actionSymbol: '*',
      thoughtColor: '#78716c',
      thoughtSymbol: '♡',
      statusColor: '#6b7280',
      statusBracket: '[]',
      fontSize: 1.0,
      dialogueColor: '#e5e7eb',
      dialogueSymbol: '"'
    };
  }
}
</script>

<template>
  <!-- 设置面板 - 全屏覆盖式 -->
  <div class="settings-panel fixed inset-0 glass-strong bg-glass-dark z-50 overflow-y-auto">
    <div class="min-h-full">
      <!-- 设置头部 -->
      <header class="glass-strong bg-glass-dark px-4 py-3 flex items-center justify-between border-b border-white/10 sticky top-0 z-10">
        <h2 class="font-bold text-lg text-shadow">⚙️ 设置</h2>
        <button @click="$emit('close')" class="p-2 rounded-full hover:bg-white/10 transition">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </header>

      <div class="p-4 space-y-6">
        <!-- 全局设置 -->
        <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
          <h3 class="font-semibold text-primary flex items-center text-shadow">
            <span class="mr-2">🌐</span> 全局设置
          </h3>

          <div class="space-y-3">
            <div>
              <label class="block text-sm text-gray-300 mb-1">Base URL</label>
              <input v-model="globalSettings.baseUrl" type="text" placeholder="https://api.deepseek.com"
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
            </div>

            <div>
              <label class="block text-sm text-gray-300 mb-1">API Key</label>
              <input v-model="globalSettings.apiKey" type="password" placeholder="sk-..."
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
            </div>

            <div>
              <label class="block text-sm text-gray-300 mb-1">Model Name</label>
              <input v-model="globalSettings.model" type="text" placeholder="deepseek-reasoner"
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
            </div>

            <div>
              <label class="block text-sm text-gray-300 mb-1">User Avatar URL (用户头像)</label>
              <input v-model="globalSettings.userAvatar" type="text" placeholder="/static/wo.jpg"
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
              <p class="text-xs text-gray-400 mt-1">⚠️ 请输入图片 URL，不要上传图片文件</p>
            </div>

            <!-- 自动朗读 -->
            <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
              <div>
                <label class="block text-sm text-gray-300">🔊 自动朗读 (Auto-Play TTS)</label>
                <p class="text-xs text-gray-400">AI 回复完成后自动语音朗读</p>
              </div>
              <div class="toggle-switch" :class="{ 'active': globalSettings.autoPlayTTS }"
                   @click="globalSettings.autoPlayTTS = !globalSettings.autoPlayTTS"></div>
            </div>

            <!-- 输出长度偏好 -->
            <div class="pt-3 mt-3 border-t border-white/10">
              <label class="block text-sm text-gray-300 mb-2">📝 输出长度偏好 (Response Length)</label>
              <select v-model="globalSettings.responseLength"
                      class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
                <option value="auto">Auto (AI 自己决定)</option>
                <option value="short">Concise (日常/短回复 50-150字)</option>
                <option value="normal">Standard (标准模式 200-400字)</option>
                <option value="long">Novel Mode (沉浸小说 400+字)</option>
              </select>
              <p class="text-xs text-gray-400 mt-1">控制 AI 回复的详细程度和篇幅</p>
            </div>

            <!-- 显示推理过程 -->
            <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
              <div>
                <label class="block text-sm text-gray-300">🔧 Show AI Reasoning (显示推理过程)</label>
                <p class="text-xs text-gray-400">显示 DeepSeek R1 的底层思维链 (&lt;think&gt;)</p>
              </div>
              <div class="toggle-switch" :class="{ 'active': globalSettings.showLogic }"
                   @click="globalSettings.showLogic = !globalSettings.showLogic"></div>
            </div>

            <!-- 显示内心戏 -->
            <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
              <div>
                <label class="block text-sm text-gray-300">💭 Show Inner Thoughts (显示内心戏)</label>
                <p class="text-xs text-gray-400">显示角色的潜台词和心理活动 (&lt;inner&gt;)</p>
              </div>
              <div class="toggle-switch" :class="{ 'active': globalSettings.showInner }"
                   @click="globalSettings.showInner = !globalSettings.showInner"></div>
            </div>

            <!-- 沉浸模式 -->
            <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
              <div>
                <label class="block text-sm text-gray-300">🌙 Immersive Mode (沉浸模式)</label>
                <p class="text-xs text-gray-400">隐藏思维标记和状态提示，提供纯粹的阅读体验</p>
              </div>
              <div class="toggle-switch" :class="{ 'active': globalSettings.immersiveMode }"
                   @click="globalSettings.immersiveMode = !globalSettings.immersiveMode"></div>
            </div>

            <!-- 文字风格选择 -->
            <div class="pt-3 mt-3 border-t border-white/10">
              <label class="block text-sm text-gray-300 mb-2">🎨 Roleplay Text Style (角色扮演文字风格)</label>
              <select v-model="globalSettings.rpTextStyle"
                      class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
                <option value="simple">Simple (简约符号)</option>
                <option value="moonlight">Moonlight (月光夜曲)</option>
                <option value="dreamy">Dreamy (梦幻浪漫)</option>
                <option value="crystal">Crystal (清透水晶)</option>
                <option value="custom">Custom (自定义)</option>
              </select>
              <p class="text-xs text-gray-400 mt-1">*动作* (思绪) [状态] "对话" 的显示样式</p>
            </div>

            <!-- 自定义风格面板 -->
            <div v-if="globalSettings.rpTextStyle === 'custom'" class="mt-4 p-3 rounded-lg bg-white/5 border border-white/10 space-y-4">
              <p class="text-xs text-gray-400 mb-2">🌨️ 自定义设置</p>

              <!-- 动作颜色 + 符号 -->
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-400 w-20">*动作*</label>
                <input type="color" v-model="globalSettings.customStyle.actionColor"
                       class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
                <input type="text" v-model="globalSettings.customStyle.actionSymbol" maxlength="2" placeholder="*"
                       class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
              </div>

              <!-- 思绪颜色 + 符号 -->
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-400 w-20">(思绪)</label>
                <input type="color" v-model="globalSettings.customStyle.thoughtColor"
                       class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
                <input type="text" v-model="globalSettings.customStyle.thoughtSymbol" maxlength="2" placeholder="♡"
                       class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
              </div>

              <!-- 状态颜色 + 括号 -->
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-400 w-20">[状态]</label>
                <input type="color" v-model="globalSettings.customStyle.statusColor"
                       class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
                <input type="text" v-model="globalSettings.customStyle.statusBracket" maxlength="2" placeholder="[]"
                       class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
              </div>

              <!-- 对话颜色 + 符号 -->
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-400 w-20">"对话"</label>
                <input type="color" v-model="globalSettings.customStyle.dialogueColor"
                       class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
                <input type="text" v-model="globalSettings.customStyle.dialogueSymbol" maxlength="2" placeholder='"'
                       class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
              </div>

              <!-- 字体大小 -->
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-400 w-20">字体大小</label>
                <input type="range" v-model.number="globalSettings.customStyle.fontSize"
                       min="0.8" max="1.4" step="0.05"
                       class="flex-1 h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
                <span class="text-xs text-gray-400 w-10 text-right">{{ (globalSettings.customStyle.fontSize || 1).toFixed(2) }}</span>
              </div>

              <!-- 重置按钮 -->
              <button @click="resetCustomStyle"
                      class="w-full mt-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 text-xs hover:bg-white/10 transition">
                🔄 重置为默认
              </button>
            </div>
          </div>
        </section>

        <!-- ═══════════════════════════════════════════════════════════════ -->
        <!-- 📌 基础设置 (Basic Settings - Always Visible) -->
        <!-- ═══════════════════════════════════════════════════════════════ -->
        <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
          <h3 class="font-semibold text-secondary flex items-center text-shadow">
            <span class="mr-2">🎭</span> {{ currentRole.name || '新角色' }}
            <span class="ml-auto text-xs font-normal text-gray-500 bg-secondary/20 px-2 py-0.5 rounded-full">基础设置</span>
          </h3>

          <div class="space-y-4">
            <!-- 角色名称 -->
            <div class="basic-field">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-base">📛</span>
                <label class="text-sm text-gray-200 font-medium">角色名称</label>
              </div>
              <input v-model="currentRole.name" type="text" placeholder="例如：温柔姐姐、赛博黑客..."
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition text-shadow-light">
            </div>

            <!-- 角色性格 (原 System Prompt，改名更直观) -->
            <div class="basic-field">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-base">💫</span>
                <label class="text-sm text-gray-200 font-medium">角色性格与背景</label>
                <div class="tooltip-trigger relative group ml-auto">
                  <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
                  <div class="tooltip-content">
                    定义角色的核心人格：TA 是谁？性格如何？有什么特点？
                  </div>
                </div>
              </div>
              <textarea v-model="currentRole.systemPrompt" rows="4" 
                        placeholder="例如：你是一个来自2077年的赛博黑客，性格酷炫，说话简短有力..."
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition resize-none text-shadow-light"></textarea>
            </div>

            <!-- 开场白 -->
            <div class="basic-field">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-base">💬</span>
                <label class="text-sm text-gray-200 font-medium">开场白</label>
                <div class="tooltip-trigger relative group ml-auto">
                  <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
                  <div class="tooltip-content">
                    角色说的第一句话，用于开启对话
                  </div>
                </div>
              </div>
              <textarea v-model="currentRole.firstMessage" rows="2" 
                        placeholder="例如：你好，旅行者。在这个数字世界里，没有什么是我无法破解的..."
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition resize-none text-shadow-light"></textarea>
            </div>
          </div>
        </section>

        <!-- ═══════════════════════════════════════════════════════════════ -->
        <!-- 🔧 高级设置 (Advanced Settings - Collapsible) -->
        <!-- ═══════════════════════════════════════════════════════════════ -->
        <section class="glass bg-glass-message rounded-xl overflow-hidden">
          <details class="advanced-panel">
            <summary class="p-4 cursor-pointer select-none flex items-center justify-between hover:bg-white/5 transition">
              <div class="flex items-center gap-2">
                <span class="text-base">🔧</span>
                <h3 class="font-semibold text-gray-400 text-shadow">高级设置</h3>
                <span class="text-xs text-gray-500">头像、背景、对话规则...</span>
              </div>
              <svg class="w-5 h-5 text-gray-500 transform transition-transform duration-200 details-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </summary>
            
            <div class="p-4 pt-0 space-y-4 border-t border-white/5">
              <!-- 头像 URL -->
              <div>
                <label class="block text-sm text-gray-400 mb-1">🖼️ AI 头像 URL</label>
                <input v-model="currentRole.avatar" type="text" placeholder="https://example.com/avatar.jpg"
                       class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
              </div>

              <!-- 背景 URL -->
              <div>
                <label class="block text-sm text-gray-400 mb-1">🌆 背景图片 URL</label>
                <input v-model="currentRole.background" type="text" placeholder="https://example.com/background.jpg"
                       class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
              </div>

              <!-- 对话规则 (原 Style Guide) -->
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <label class="text-sm text-gray-400">🚫 对话规则 / 禁区</label>
                  <div class="tooltip-trigger relative group ml-auto">
                    <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
                    <div class="tooltip-content">
                      设置角色不能聊的话题或必须遵守的规则
                    </div>
                  </div>
                </div>
                <textarea v-model="currentRole.styleGuide" rows="2" 
                          placeholder="例如：不能打破第四面墙，不能谈论现实世界的AI技术..."
                          class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
              </div>

              <!-- 剧情摘要 -->
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <label class="text-sm text-gray-400">📜 剧情摘要</label>
                  <div class="tooltip-trigger relative group ml-auto">
                    <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
                    <div class="tooltip-content">
                      记录重要剧情发展，AI 会始终记住这些内容
                    </div>
                  </div>
                </div>
                <textarea v-model="currentRole.storySummary" rows="2" 
                          placeholder="例如：昨天你们一起去了咖啡厅，TA 不小心说漏了自己的秘密..."
                          class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
              </div>

              <!-- TTS 声音选择 -->
              <div>
                <label class="block text-sm text-gray-400 mb-1">🔊 语音声线</label>
                <select v-model="currentRole.ttsVoice"
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-sm">
                  <option value="">使用系统默认声音</option>
                  <option v-for="voice in availableVoices" :key="voice.name" :value="voice.name">
                    {{ voice.name }} ({{ voice.lang }})
                  </option>
                </select>
              </div>
            </div>
          </details>
        </section>

        <!-- v5.5: 角色深度设置 (3D Character Enhancement) -->
        <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
          <h3 class="font-semibold text-rose-400 flex items-center text-shadow">
            <span class="mr-2">✨</span> 角色深度设置
            <span class="ml-auto text-xs font-normal text-gray-500">让角色更有血有肉</span>
          </h3>

          <div class="grid gap-4">
            <!-- 说话风格 Speaking Style -->
            <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-rose-500/30 transition">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">🗣️</span>
                <label class="text-sm text-gray-200 font-medium">Speaking Style (说话风格)</label>
                <div class="tooltip-trigger relative group ml-auto">
                  <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
                  <div class="tooltip-content">
                    决定 TA 的口癖、语气。例如：'喜欢用反问句' 或 '每句话都很简短'
                  </div>
                </div>
              </div>
              <textarea v-model="currentRole.speakingStyle" rows="2" 
                        placeholder="例如：语气略带嘲讽，喜欢用「哦？」开头，偶尔冒出一两句英文..."
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-rose-500/50 transition resize-none text-shadow-light text-sm"></textarea>
            </div>

            <!-- 内心秘密 Secret -->
            <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-purple-500/30 transition">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">🔐</span>
                <label class="text-sm text-gray-200 font-medium">Secret / Motivation (内心秘密)</label>
                <div class="tooltip-trigger relative group ml-auto">
                  <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
                  <div class="tooltip-content">
                    TA 深藏心底的秘密或动机。这会让剧情更有张力，AI 不会主动透露
                  </div>
                </div>
              </div>
              <textarea v-model="currentRole.secret" rows="2" 
                        placeholder="例如：其实暗恋着你已经很久了，但因为害怕被拒绝一直不敢表白..."
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-purple-500/50 transition resize-none text-shadow-light text-sm"></textarea>
            </div>

            <!-- 当前关系 Relationship -->
            <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-pink-500/30 transition">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">💕</span>
                <label class="text-sm text-gray-200 font-medium">Current Relationship (当前关系)</label>
                <div class="tooltip-trigger relative group ml-auto">
                  <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
                  <div class="tooltip-content">
                    开局时 TA 怎么看待你？是陌生人、恋人、青梅竹马还是仇人？
                  </div>
                </div>
              </div>
              <textarea v-model="currentRole.relationship" rows="2" 
                        placeholder="例如：你们是高中同班同学，TA 是班长，你总是迟到被 TA 记过名..."
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-pink-500/50 transition resize-none text-shadow-light text-sm"></textarea>
            </div>

            <!-- 外貌特征 Appearance -->
            <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-amber-500/30 transition">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">👤</span>
                <label class="text-sm text-gray-200 font-medium">Appearance (外貌特征)</label>
                <div class="tooltip-trigger relative group ml-auto">
                  <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
                  <div class="tooltip-content">
                    TA 长什么样？这会影响 TA 做动作时的描写细节
                  </div>
                </div>
              </div>
              <textarea v-model="currentRole.appearance" rows="2" 
                        placeholder="例如：银白长发及腰，紫色竖瞳，穿着黑色长裙，左手无名指上戴着神秘戒指..."
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-amber-500/50 transition resize-none text-shadow-light text-sm"></textarea>
            </div>

            <!-- 世界观 World Logic -->
            <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/30 transition">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">🌍</span>
                <label class="text-sm text-gray-200 font-medium">World Logic (世界观)</label>
                <div class="tooltip-trigger relative group ml-auto">
                  <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
                  <div class="tooltip-content">
                    故事发生在哪里？古代、现代、末世还是魔法世界？
                  </div>
                </div>
              </div>
              <textarea v-model="currentRole.worldLogic" rows="2" 
                        placeholder="例如：2077年的霓虹都市，巨型企业统治一切，人们通过神经接口连接网络..."
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-cyan-500/50 transition resize-none text-shadow-light text-sm"></textarea>
            </div>
          </div>
        </section>

        <!-- 参数调整 -->
        <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
          <h3 class="font-semibold text-green-400 flex items-center text-shadow">
            <span class="mr-2">🎛️</span> 参数调整
          </h3>

          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <label class="text-gray-300">Temperature (创造力)</label>
                <span class="text-primary font-mono">{{ (currentRole.temperature || 1.0).toFixed(1) }}</span>
              </div>
              <input v-model.number="currentRole.temperature" type="range" min="0" max="2" step="0.1"
                     class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
              <div class="flex justify-between text-xs text-gray-400 mt-1">
                <span>精确 0.0</span>
                <span>平衡 1.0</span>
                <span>创意 2.0</span>
              </div>
            </div>

            <div>
              <label class="block text-sm text-gray-300 mb-1">Max Tokens (最大长度)</label>
              <input v-model.number="currentRole.maxTokens" type="number" min="100" max="8192" placeholder="2000"
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
            </div>
          </div>
        </section>

        <!-- 记忆管理 -->
        <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
          <h3 class="font-semibold text-amber-400 flex items-center text-shadow">
            <span class="mr-2">📌</span> 记忆管理
            <span class="ml-auto text-xs font-normal text-gray-500">🪄 消耗少量 Token</span>
          </h3>

          <div class="space-y-4">
            <!-- Memory Window Slider -->
            <div>
              <div class="flex justify-between text-sm mb-1">
                <label class="text-gray-300">记忆窗口大小</label>
                <span class="text-primary font-mono">{{ currentRole.memoryWindow || 15 }} 轮</span>
              </div>
              <input v-model.number="currentRole.memoryWindow" type="range" min="5" max="30" step="1"
                     class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
              <div class="flex justify-between text-xs text-gray-400 mt-1">
                <span>5轮</span>
                <span>15轮</span>
                <span>30轮</span>
              </div>
            </div>

            <!-- Manual Memories Display -->
            <div class="pt-3 border-t border-white/10">
              <div class="flex justify-between items-center mb-3">
                <label class="text-sm text-gray-300">永久记忆</label>
                <span class="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full">
                  {{ (currentRole.manualMemories || []).length }} 条
                </span>
              </div>

              <!-- Add New Memory Button -->
              <button @click="$emit('add-manual-memory')" class="memory-add-btn mb-3">
                ➕ 新增自定义记忆
              </button>

              <!-- Memory List -->
              <div v-if="(currentRole.manualMemories || []).length > 0" class="space-y-3 max-h-64 overflow-y-auto pr-1">
                <div v-for="(memory, mIndex) in currentRole.manualMemories" :key="mIndex" class="memory-item rounded-lg bg-white/5 p-3">
                  <!-- View Mode -->
                  <template v-if="memoryEditState.editingIndex !== mIndex">
                    <div class="flex items-start gap-2">
                      <!-- Role Icon -->
                      <span class="flex-shrink-0 text-base mt-0.5">
                        {{ memory.role === 'user' ? '👤' : (memory.isCustom ? '📝' : '🎭') }}
                      </span>

                      <!-- Content -->
                      <div class="flex-1 min-w-0" @click="$emit('toggle-memory-expand', mIndex)">
                        <p class="text-gray-300 text-xs leading-relaxed memory-content-preview"
                           :class="{
                             'line-clamp-2': memoryEditState.expandedIndex !== mIndex,
                             'memory-content-expanded': memoryEditState.expandedIndex === mIndex
                           }">
                          {{ memory.content || '(空记忆)' }}
                        </p>
                      </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                      <!-- AI Refine Button -->
                      <button @click="$emit('refine-memory', mIndex)" class="memory-action-btn refine"
                              :disabled="memoryEditState.refiningIndex === mIndex || !memory.content"
                              :title="memory.content && memory.content.length >= 20 ? 'AI 精简 (~消耗少量Token)' : '内容太短'">
                        <span :class="{ 'spinning': memoryEditState.refiningIndex === mIndex }">🪄</span>
                        {{ memoryEditState.refiningIndex === mIndex ? '精简中...' : '精简' }}
                      </button>

                      <!-- Edit Button -->
                      <button @click="$emit('start-edit-memory', mIndex)" class="memory-action-btn edit">
                        ✏️ 编辑
                      </button>

                      <!-- Delete Button -->
                      <button @click="$emit('remove-manual-memory', mIndex)" class="memory-action-btn delete ml-auto">
                        🗑️
                      </button>
                    </div>
                  </template>

                  <!-- Edit Mode -->
                  <template v-else>
                    <div class="space-y-2">
                      <textarea v-model="memoryEditState.editContent" class="memory-edit-input"
                                placeholder="输入记忆内容，如：[设定] 用户是公司的幕后老板" rows="3"></textarea>

                      <div class="flex items-center gap-2">
                        <button @click="$emit('save-edit-memory', mIndex)" class="memory-action-btn save">
                          ✅ 保存
                        </button>
                        <button @click="$emit('cancel-edit-memory')" class="memory-action-btn cancel">
                          ❌ 取消
                        </button>
                        <span class="text-xs text-gray-500 ml-auto">
                          {{ memoryEditState.editContent.length }} 字
                        </span>
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Empty State -->
              <div v-else class="text-center py-6 bg-white/5 rounded-lg">
                <p class="text-gray-500 text-sm mb-1">📭 暂无永久记忆</p>
                <p class="text-gray-600 text-xs">点击消息的 📌 按钮添加，或使用上方按钮手动创建</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 数据管理 -->
        <section class="space-y-3">
          <h3 class="font-semibold text-gray-300 flex items-center text-shadow px-1">
            <span class="mr-2">💾</span> 数据备份与恢复
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <button @click="$emit('export-data')"
                    class="glass bg-glass-message text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition flex flex-col items-center justify-center space-y-1">
              <span class="text-xl">📥</span>
              <span class="text-sm">导出备份</span>
            </button>
            <button @click="$emit('show-import-modal')"
                    class="glass bg-glass-message text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition flex flex-col items-center justify-center space-y-1">
              <span class="text-xl">📤</span>
              <span class="text-sm">恢复数据</span>
            </button>
          </div>

          <div class="pt-4 border-t border-white/10 mt-4">
            <button @click="$emit('clear-all-data')"
                    class="w-full glass bg-red-900/30 text-red-400 rounded-xl px-4 py-3 text-center hover:bg-red-900/50 transition">
              🗑️ 清除所有数据
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 记忆管理样式 */
.memory-edit-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 8px;
  padding: 8px 12px;
  width: 100%;
  color: #e0e0e0;
  font-size: 0.8rem;
  resize: vertical;
  min-height: 60px;
  transition: border-color 0.2s ease;
}

.memory-edit-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.8);
}

.memory-action-btn {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.7rem;
  transition: all 0.2s ease;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.memory-action-btn.refine {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

.memory-action-btn.refine:hover {
  background: rgba(139, 92, 246, 0.4);
}

.memory-action-btn.edit {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.memory-action-btn.edit:hover {
  background: rgba(59, 130, 246, 0.4);
}

.memory-action-btn.save {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.memory-action-btn.save:hover {
  background: rgba(34, 197, 94, 0.4);
}

.memory-action-btn.cancel {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}

.memory-action-btn.cancel:hover {
  background: rgba(107, 114, 128, 0.4);
}

.memory-action-btn.delete {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.memory-action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.4);
}

.memory-add-btn {
  width: 100%;
  padding: 10px;
  border: 2px dashed rgba(139, 92, 246, 0.4);
  border-radius: 10px;
  background: transparent;
  color: #a78bfa;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.memory-add-btn:hover {
  border-color: rgba(139, 92, 246, 0.8);
  background: rgba(139, 92, 246, 0.1);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
  display: inline-block;
}

.memory-content-preview {
  cursor: pointer;
  transition: all 0.2s ease;
}

.memory-content-preview:hover {
  color: #fff;
}

.memory-content-expanded {
  white-space: pre-wrap;
  word-break: break-word;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.memory-item {
  transition: all 0.2s ease;
}

.memory-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* v5.5: Tooltip Styles */
.tooltip-trigger {
  position: relative;
}

.tooltip-content {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 6px;
  padding: 8px 12px;
  min-width: 220px;
  max-width: 280px;
  background: rgba(15, 15, 25, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  font-size: 0.75rem;
  color: rgba(220, 220, 240, 0.9);
  line-height: 1.5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  pointer-events: none;
}

.tooltip-trigger:hover .tooltip-content {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

/* Depth Card Hover Effect */
.depth-card {
  transition: all 0.25s ease;
}

.depth-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* v5.5: Collapsible Panel Styles */
.advanced-panel summary {
  list-style: none;
}

.advanced-panel summary::-webkit-details-marker {
  display: none;
}

.advanced-panel[open] .details-arrow {
  transform: rotate(180deg);
}

.advanced-panel[open] summary {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

/* Basic Field Styling */
.basic-field {
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s ease;
}

.basic-field:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(139, 92, 246, 0.2);
}

.basic-field:focus-within {
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}
</style>
