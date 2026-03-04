<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { DEFAULT_OVERRIDES, TEMPLATE_LIST, autoSelectTheme } from '../utils/cardTheme.js'
import '../styles/card-templates.css'

const props = defineProps({
  role:           { type: Object,  required: true  },
  messages:       { type: Array,   required: true  },
  globalSettings: { type: Object,  required: true  },
  savedTheme:     { type: Object,  default:  null  },
})
const emit = defineEmits(['close'])

const mode         = ref('ai')
const isGenerating = ref(false)
const isExporting  = ref(false)
const theme        = ref(null)
const feedback     = ref('')
const cardRef      = ref(null)
const editTagline  = ref('')
const editBio      = ref('')

onMounted(() => {
  if (props.savedTheme) {
    theme.value = { ...props.savedTheme }
  } else {
    theme.value = autoSelectTheme(props.role)
  }
  editTagline.value = theme.value?.tagline || ''
  editBio.value     = (props.role?.description || '').slice(0, 80)
  initAnimations()
})

// ── Particle / film-sprocket init ──────────────────
function initAnimations() {
  if (activeTemplate.value === 'love') spawnHearts()
  if (activeTemplate.value === 'film') spawnSprockets()
  if (activeTemplate.value === 'aurora') spawnParticles()
}

function spawnHearts() {
  const bg = document.querySelector('.rcg-card-wrap .love-bg')
  if (!bg) return
  // 先清除旧爱心，防止重复切换叠加
  bg.querySelectorAll('.love-heart').forEach(el => el.remove())
  const hearts = ['♡','♥','💕','🌸','✿']
  for (let i = 0; i < 12; i++) {
    const h = document.createElement('div')
    h.className = 'love-heart'
    h.textContent = hearts[Math.floor(Math.random() * hearts.length)]
    h.style.cssText = `--x:${Math.random()*100}%;--d:${3+Math.random()*4}s;--delay:${-Math.random()*6}s;--s:${12+Math.random()*10}px;color:rgba(255,110,176,${0.3+Math.random()*0.4});`
    bg.appendChild(h)
  }
}

function spawnSprockets() {
  ['rcg-left-spr','rcg-right-spr'].forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    // 先清除旧齿孔
    el.querySelectorAll('.sprocket-hole').forEach(h => h.remove())
    for (let i = 0; i < 10; i++) {
      const h = document.createElement('div')
      h.className = 'sprocket-hole'
      el.appendChild(h)
    }
  })
}

function spawnParticles() {
  const av = document.querySelector('.rcg-card-wrap .aurora-avatar')
  if (!av) return
  // 先清除旧粒子
  av.querySelectorAll('.aurora-particle').forEach(el => el.remove())
  const colors = ['rgba(124,58,237,0.7)','rgba(14,165,233,0.7)','rgba(16,185,129,0.7)','rgba(255,255,255,0.5)']
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div')
    p.className = 'aurora-particle'
    p.style.cssText = `left:${20+Math.random()*60}%;top:${30+Math.random()*50}%;--d:${2+Math.random()*3}s;--delay:${-Math.random()*4}s;--dx:${(Math.random()-0.5)*60}px;background:${colors[Math.floor(Math.random()*4)]};`
    av.appendChild(p)
  }
}

// ── roleData ──────────────────────────────────────
function getOpeningLine(msgs) {
  const first = msgs.find(m => m.role === 'assistant')
  if (!first) return ''
  return (first.rawContent || first.content || '').replace(/<[^>]+>/g, '').slice(0, 60)
}
function extractTagsFromPrompt(prompt) {
  const kw = ['温柔','冷酷','活泼','神秘','傲娇','治愈','强大','可爱','聪明','勇敢']
  return kw.filter(k => (prompt || '').includes(k)).slice(0, 4)
}

const roleData = computed(() => ({
  name:           props.role?.name || '未知角色',
  bio:            editBio.value || (props.role?.description || '').slice(0, 80),
  tags:           props.role?.tags?.length ? props.role.tags : extractTagsFromPrompt(props.role?.systemPrompt),
  avatar:         props.role?.avatar || null,
  messageCount:   props.messages.filter(m => m.role === 'assistant').length,
  openingLine:    getOpeningLine(props.messages),
  tagline:        editTagline.value || theme.value?.tagline || '角色卡',
  decorationEmoji:theme.value?.decorationEmoji || '✨',
}))

const activeTemplate = computed(() => theme.value?.template || 'minimal')
const themeStyle = computed(() => ({
  '--card-primary': theme.value?.overrides?.primary || '#6366f1',
  '--card-bg':      theme.value?.overrides?.bg      || '#0e0e1f',
  '--card-text':    theme.value?.overrides?.text     || '#f0eeff',
  '--card-accent':  theme.value?.overrides?.accent   || '#8b5cf6',
}))

// ── AI Generation ─────────────────────────────────
const CARD_THEME_SYSTEM_PROMPT = `You are a character card theme designer. Given a character description, select the best visual template and return ONLY a JSON object with no markdown formatting.
Available templates: love - romantic cute girl; ink - ancient Chinese martial arts; dark - gothic demon villain; cyber - AI hacker sci-fi; flame - warrior hot blood; cozy - cafe daily life; glitch - experimental digital; film - vintage noir; minimal - cold elite intellectual; aurora - magical elf fantasy; scrap - cute handmade diary
Return ONLY valid JSON: {"template":"ink","overrides":{"primary":"#c8a96e","bg":"#f5efe0","text":"#1a0a00","accent":"#8b2020"},"tagline":"千年修行，一剑入梦","mood":"ancient","decorationEmoji":"⚔️"}
Rules: tagline must be 8-16 Chinese characters; colors must be valid hex; decorationEmoji must be single emoji`

function buildGenerationPrompt(role, prevTheme, fb) {
  let p = `Character name: ${role.name}\nDescription: ${(role.description || '').slice(0, 200)}\nPersona: ${(role.systemPrompt || '').slice(0, 300)}\n`
  if (role.tags?.length) p += `Tags: ${role.tags.join(', ')}\n`
  if (prevTheme && fb) p += `\nPrevious theme: ${JSON.stringify(prevTheme)}\nUser feedback: "${fb}"\nPlease adjust the theme based on feedback.`
  return p
}

async function generateAITheme(prevTheme = null) {
  if (!props.globalSettings?.apiKey) {
    theme.value = autoSelectTheme(props.role)
    editTagline.value = theme.value.tagline
    return
  }
  isGenerating.value = true
  const baseUrl = (props.globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')
  const model = props.globalSettings.model?.includes('reasoner') ? 'deepseek-chat' : (props.globalSettings.model || 'deepseek-chat')
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${props.globalSettings.apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: CARD_THEME_SYSTEM_PROMPT }, { role: 'user', content: buildGenerationPrompt(props.role, prevTheme, feedback.value) }], temperature: 0.9, max_tokens: 200, stream: false }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error('API failed')
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || ''
    const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    theme.value = parsed
    editTagline.value = parsed.tagline || ''
    feedback.value = ''
    showLocalToast('✨ 主题已生成！')
  } catch (e) {
    theme.value = autoSelectTheme(props.role)
    editTagline.value = theme.value.tagline
    console.warn('AI theme generation failed:', e.message)
    showLocalToast('自动匹配主题（AI生成失败）')
  } finally {
    isGenerating.value = false
  }
}

// ── Template & Color Switcher ─────────────────────
function switchTemplate(id) {
  // 始终重置为该模板的默认颜色，避免跨模板颜色残留
  theme.value = {
    ...(theme.value || {}),
    template: id,
    overrides: { ...DEFAULT_OVERRIDES[id] },
  }
  // 切换后重新初始化特效（love爱心 / film齿孔 / aurora粒子）
  nextTick(() => initAnimations())
}
function updateColor(key, val) {
  if (!theme.value) return
  theme.value = { ...theme.value, overrides: { ...theme.value.overrides, [key]: val } }
}

// ── Export PNG + embedded data ────────────────────
async function exportCardWithData() {
  if (!cardRef.value) return
  isExporting.value = true
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(cardRef.value, { scale: 2, useCORS: true, backgroundColor: null, logging: false })
    const pngBase64 = canvas.toDataURL('image/png').split(',')[1]
    const pngBytes  = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0))
    const payload = {
      version: 'rolecard-v1', exportedAt: new Date().toISOString(), theme: theme.value,
      role: { id: props.role.id, name: props.role.name, description: props.role.description, systemPrompt: props.role.systemPrompt, avatar: props.role.avatar, tags: props.role.tags, speakingStyle: props.role.speakingStyle, relationship: props.role.relationship, writingStyle: props.role.writingStyle, styleDirectives: props.role.styleDirectives, firstMessage: props.role.firstMessage },
      messages: props.messages, messageCount: props.messages.length,
    }
    const jsonBytes = new TextEncoder().encode('\n###MYAI_ROLECARD###\n' + JSON.stringify(payload))
    const combined  = new Uint8Array(pngBytes.length + jsonBytes.length)
    combined.set(pngBytes); combined.set(jsonBytes, pngBytes.length)
    const url = URL.createObjectURL(new Blob([combined], { type: 'image/png' }))
    const a = document.createElement('a'); a.download = `${props.role.name || '角色'}_角色卡.png`; a.href = url; a.click()
    URL.revokeObjectURL(url)
    showLocalToast('✅ 导出成功！')
  } catch (e) { console.error('Export failed:', e); showLocalToast('❌ 导出失败，请重试') }
  finally { isExporting.value = false }
}

// ── Save to Library ───────────────────────────────
const LIBRARY_KEY = 'myai_card_library_v1'

// 每个模板的实际底色（供 html2canvas backgroundColor 使用，
// 必须是实色而非 gradient，浅色模板传白/米色，深色传黑）
const TEMPLATE_BG_COLORS = {
  love:    '#ffe4f0',
  ink:     '#f5efe0',
  dark:    '#100008',
  cyber:   '#020815',
  flame:   '#1a0800',
  cozy:    '#fdfaf5',
  glitch:  '#000000',
  film:    '#1a1008',
  minimal: '#fafafa',
  aurora:  '#05050f',
  scrap:   '#f5f0e8',
}

async function saveToLibrary() {
  if (!cardRef.value) return
  try {
    const html2canvas = (await import('html2canvas')).default

    // 取当前模板的底色
    const bgColor = TEMPLATE_BG_COLORS[activeTemplate.value] || '#0e0e1f'

    // ── 克隆卡片到一个干净、离屏的容器中，避免父层深色背景渗透 ──
    const container = document.createElement('div')
    container.style.cssText = `
      position:fixed; left:-9999px; top:0;
      width:260px; height:390px;
      background:${bgColor};
      z-index:-1; overflow:hidden;
    `
    const clone = cardRef.value.cloneNode(true)

    // ── 内联降级：html2canvas 不支持 filter:blur / backdrop-filter ──
    // 对克隆节点直接改 style，不需要全局 CSS
    clone.style.boxShadow = 'none'
    clone.style.transform = 'none'

    // 隐藏/降级有问题的子元素
    const rules = [
      // Aurora：blob 改渐变
      ['.aurora-blob',   el => { el.style.display = 'none' }],
      ['.aurora-bg',     el => { el.style.background = 'linear-gradient(135deg,rgba(124,58,237,0.9),rgba(14,165,233,0.7) 35%,rgba(16,185,129,0.6) 65%,rgba(245,158,11,0.5))' }],
      ['.aurora-overlay', el => { el.style.display = 'none' }],
      ['.aurora-glass',   el => { el.style.backdropFilter = 'none'; el.style.background = 'rgba(255,255,255,0.05)' }],
      ['.aurora-ring',    el => { el.style.backdropFilter = 'none'; el.style.background = 'rgba(255,255,255,0.08)' }],
      // 暗层
      ['.dark-vignette',  el => { el.style.display = 'none' }],
      ['.film-vignette',  el => { el.style.display = 'none' }],
      ['.dark-crack',     el => { el.style.display = 'none' }],
      // Glow / blur 元素 → 隐藏
      ['.love-glow',      el => { el.style.display = 'none' }],
      ['.dark-glow',      el => { el.style.display = 'none' }],
      ['.adv-fire-glow',  el => { el.style.display = 'none' }],
      ['.ink-splash',     el => { el.style.display = 'none' }],
      // 噪点
      ['.film-grain',     el => { el.style.display = 'none' }],
      // Cyber 扫描线
      ['.cyber-glitch',   el => { el.style.display = 'none' }],
      ['.glitch-scanlines', el => { el.style.display = 'none' }],
    ]
    for (const [sel, fn] of rules) {
      clone.querySelectorAll(sel).forEach(fn)
    }

    document.body.appendChild(container)
    container.appendChild(clone)

    const canvas = await html2canvas(clone, {
      scale:           1,
      useCORS:         true,
      allowTaint:      true,
      logging:         false,
      backgroundColor: bgColor,
    })

    document.body.removeChild(container)

    const entry = {
      id:               crypto.randomUUID(),
      savedAt:          new Date().toISOString(),
      roleName:         props.role.name,
      roleId:           props.role.id,
      theme:            theme.value,
      thumbnailDataUrl: canvas.toDataURL('image/jpeg', 0.8),
    }
    const lib      = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]')
    const filtered = lib.filter(e => !(e.roleId === entry.roleId && e.theme?.template === entry.theme?.template))
    filtered.unshift(entry)
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(filtered.slice(0, 50)))
    showLocalToast('✅ 已保存到卡片库')
  } catch (e) { console.error(e); showLocalToast('❌ 保存失败') }
}



// ── Editable fields ───────────────────────────────
function onTaglineInput(e) { editTagline.value = e.target.innerText.trim() }
function onBioInput(e)     { editBio.value     = e.target.innerText.trim() }

// ── Toast ─────────────────────────────────────────
const localToast = ref('')
let toastTimer = null
function showLocalToast(msg) {
  localToast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { localToast.value = '' }, 2500)
}
</script>

<template>
  <div class="rcg-modal">
    <!-- Header -->
    <div class="rcg-header">
      <h2 class="rcg-title">🃏 角色卡生成器</h2>
      <button class="rcg-close" @click="$emit('close')">✕</button>
    </div>

    <!-- Mode tabs -->
    <div class="rcg-mode-tabs">
      <button :class="['rcg-tab',{active:mode==='ai'}]"      @click="mode='ai'">✨ AI 生成</button>
      <button :class="['rcg-tab',{active:mode==='manual'}]"  @click="mode='manual'">🎨 手动选择</button>
      <button :class="['rcg-tab',{active:mode==='iterate'}]" @click="mode='iterate'">💬 反馈修改</button>
    </div>

    <!-- Body -->
    <div class="rcg-body">
      <!-- Controls -->
      <div class="rcg-controls">
        <div v-if="mode==='ai'" class="rcg-section">
          <p class="rcg-hint">根据角色设定自动推荐最匹配的视觉风格</p>
          <button class="rcg-btn-primary" :disabled="isGenerating" @click="generateAITheme()">
            {{ isGenerating ? '⏳ 生成中...' : '🤖 AI 生成主题' }}
          </button>
          <p v-if="!globalSettings?.apiKey" class="rcg-warn">⚠️ 未设置 API Key，将使用自动匹配</p>
        </div>

        <div v-if="mode==='iterate'" class="rcg-section">
          <label class="rcg-label">描述你想要的改变：</label>
          <textarea class="rcg-textarea" v-model="feedback" placeholder="例：颜色再深沉一些，换成更神秘的氛围…" rows="3"></textarea>
          <button class="rcg-btn-primary" :disabled="isGenerating||!feedback.trim()" @click="generateAITheme(theme)">
            {{ isGenerating ? '⏳ 生成中...' : '🔄 重新生成' }}
          </button>
        </div>

        <!-- Template selector -->
        <div class="rcg-section">
          <label class="rcg-label">选择模板</label>
          <div class="rcg-template-list">
            <button v-for="tmpl in TEMPLATE_LIST" :key="tmpl.id"
              :class="['rcg-tmpl-btn',{active:activeTemplate===tmpl.id}]"
              @click="switchTemplate(tmpl.id)">
              <span class="rcg-dot" :style="{background:tmpl.dot}"></span>{{ tmpl.name }}
            </button>
          </div>
        </div>

        <!-- Color pickers -->
        <div class="rcg-section">
          <label class="rcg-label">自定义颜色</label>
          <div class="rcg-color-row">
            <label class="rcg-color-item"><span>主色</span><input type="color" :value="theme?.overrides?.primary||'#6366f1'" @input="updateColor('primary',$event.target.value)"></label>
            <label class="rcg-color-item"><span>背景</span><input type="color" :value="theme?.overrides?.bg||'#0e0e1f'"      @input="updateColor('bg',$event.target.value)"></label>
            <label class="rcg-color-item"><span>文字</span><input type="color" :value="theme?.overrides?.text||'#f0eeff'"    @input="updateColor('text',$event.target.value)"></label>
            <label class="rcg-color-item"><span>强调</span><input type="color" :value="theme?.overrides?.accent||'#8b5cf6'"  @input="updateColor('accent',$event.target.value)"></label>
          </div>
        </div>

        <!-- Export / Save -->
        <div class="rcg-actions">
          <button class="rcg-btn-export" :disabled="isExporting" @click="exportCardWithData">{{ isExporting ? '导出中...' : '📤 导出 PNG' }}</button>
          <button class="rcg-btn-save" @click="saveToLibrary">💾 保存到库</button>
        </div>

        <Transition name="rcg-toast">
          <div v-if="localToast" class="rcg-local-toast">{{ localToast }}</div>
        </Transition>
      </div>

      <!-- Preview area -->
      <div class="rcg-preview-area">
        <div class="rcg-preview-hint">预览 · 点击文字可编辑</div>

        <div class="rcg-card-wrap" v-if="theme">

          <!-- ============================================================
               1. 甜心恋爱
          ============================================================ -->
          <div v-if="activeTemplate==='love'" ref="cardRef" class="card card-love" :style="themeStyle">
            <div class="love-corner tl">🌸</div><div class="love-corner tr">🌸</div>
            <div class="love-corner bl">🌸</div><div class="love-corner br">🌸</div>
            <div class="love-bg"><div class="love-glow love-glow-1"></div><div class="love-glow love-glow-2"></div></div>
            <div class="love-avatar">
              <img v-if="roleData.avatar" :src="roleData.avatar" class="love-img" />
              <div v-else class="love-emoji">{{ roleData.decorationEmoji }}</div>
            </div>
            <div class="love-ribbon"></div>
            <div class="love-content">
              <div class="love-tag">♡ <span contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></span></div>
              <div class="love-name">{{ roleData.name }}</div>
              <div class="love-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="love-footer">
                <div class="love-stats">
                  <div class="love-stat"><div class="love-stat-val">{{ roleData.messageCount }}</div><div class="love-stat-label">对话数</div></div>
                  <div class="love-stat" v-if="roleData.tags[0]"><div class="love-stat-val" style="font-size:12px;">{{ roleData.tags[0] }}</div><div class="love-stat-label">标签</div></div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================
               2. 国风水墨
          ============================================================ -->
          <div v-else-if="activeTemplate==='ink'" ref="cardRef" class="card card-ink" :style="themeStyle">
            <div class="ink-texture"></div><div class="ink-lines"></div><div class="ink-border"></div>
            <div class="ink-seal">卡</div>
            <div class="ink-avatar">
              <div class="ink-splash ink-splash-1"></div><div class="ink-splash ink-splash-2"></div>
              <img v-if="roleData.avatar" :src="roleData.avatar" class="ink-img" />
              <div v-else class="ink-emoji">{{ roleData.decorationEmoji }}</div>
            </div>
            <div class="ink-divider"></div>
            <div class="ink-content">
              <div class="ink-subtitle" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
              <div class="ink-name">{{ roleData.name }}</div>
              <div class="ink-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="ink-footer">
                <div class="ink-id">CHAR · {{ roleData.messageCount }} 对话</div>
              </div>
            </div>
          </div>

          <!-- ============================================================
               3. 暗黑哥特
          ============================================================ -->
          <div v-else-if="activeTemplate==='dark'" ref="cardRef" class="card card-dark" :style="themeStyle">
            <div class="dark-corner tl">✦</div><div class="dark-corner tr">✦</div>
            <div class="dark-corner bl">✦</div><div class="dark-corner br">✦</div>
            <div class="dark-crack"></div><div class="dark-vignette"></div>
            <div class="dark-glow dark-glow-1"></div><div class="dark-glow dark-glow-2"></div>
            <div class="dark-avatar">
              <img v-if="roleData.avatar" :src="roleData.avatar" class="dark-img" />
              <div v-else class="dark-emoji">{{ roleData.decorationEmoji }}</div>
              <div class="drip" style="left:60px;height:18px;"></div>
              <div class="drip" style="left:120px;height:12px;"></div>
              <div class="drip" style="left:170px;height:22px;"></div>
              <div class="drip" style="right:50px;height:15px;"></div>
            </div>
            <div class="dark-content">
              <div class="dark-runes" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;letter-spacing:2px;"></div>
              <div class="dark-name">{{ roleData.name }}</div>
              <div class="dark-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="dark-divider"></div>
              <div class="dark-footer">
                <div class="dark-curse">SOUL · {{ roleData.messageCount }}</div>
              </div>
            </div>
          </div>

          <!-- ============================================================
               4. 赛博朋克
          ============================================================ -->
          <div v-else-if="activeTemplate==='cyber'" ref="cardRef" class="card card-cyber" :style="themeStyle">
            <div class="cyber-scanlines"></div><div class="cyber-grid"></div><div class="cyber-glitch"></div>
            <div class="cyber-corner-cut"></div><div class="cyber-corner-cut-bl"></div>
            <div class="cyber-avatar">
              <div class="cyber-hud">
                <div class="cyber-hud-line"><div class="cyber-hud-dot"></div>ONLINE</div>
                <div class="cyber-hud-line">SYS:OK</div>
              </div>
              <img v-if="roleData.avatar" :src="roleData.avatar" class="cyber-img" />
              <div v-else class="cyber-emoji">{{ roleData.decorationEmoji }}</div>
            </div>
            <div class="cyber-content">
              <div class="cyber-id" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
              <div class="cyber-name">{{ roleData.name }}</div>
              <div class="cyber-bar-label">SYNC RATE</div>
              <div class="cyber-bar"><div class="cyber-bar-fill" :style="{width: Math.min(99, roleData.messageCount * 3 + 30) + '%'}"></div></div>
              <div class="cyber-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="cyber-footer">
                <span style="font-family:Orbitron;font-size:8px;color:rgba(0,255,159,0.3)">v2.0.{{ roleData.messageCount }}</span>
              </div>
            </div>
          </div>

          <!-- ============================================================
               5. 烈焰热血
          ============================================================ -->
          <div v-else-if="activeTemplate==='flame'" ref="cardRef" class="card card-flame" :style="themeStyle">
            <div class="adv-lines"></div>
            <div class="adv-fire-glow adv-fire-glow-1"></div><div class="adv-fire-glow adv-fire-glow-2"></div>
            <div class="adv-badge">S · RANK</div>
            <div class="adv-avatar">
              <div class="adv-slash adv-slash-1"></div><div class="adv-slash adv-slash-2"></div>
              <img v-if="roleData.avatar" :src="roleData.avatar" class="adv-img" />
              <div v-else class="adv-emoji">{{ roleData.decorationEmoji }}</div>
            </div>
            <div class="adv-content">
              <div class="adv-rank" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
              <div class="adv-name">{{ roleData.name }}</div>
              <div class="adv-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="adv-stats">
                <div class="adv-stat"><div class="adv-stat-val">{{ roleData.messageCount }}</div><div class="adv-stat-label">对话</div></div>
                <div class="adv-stat"><div class="adv-stat-val">{{ roleData.tags.length || 0 }}</div><div class="adv-stat-label">标签</div></div>
                <div class="adv-stat"><div class="adv-stat-val">0</div><div class="adv-stat-label">退路</div></div>
              </div>
            </div>
          </div>

          <!-- ============================================================
               6. 治愈日常
          ============================================================ -->
          <div v-else-if="activeTemplate==='cozy'" ref="cardRef" class="card card-cozy" :style="themeStyle">
            <div class="cozy-paper"></div><div class="cozy-border"></div>
            <div class="cozy-avatar">
              <div class="cozy-deco cozy-deco-1">🍃</div>
              <div class="cozy-deco cozy-deco-2">✿</div>
              <div class="cozy-deco cozy-deco-3">🌼</div>
              <img v-if="roleData.avatar" :src="roleData.avatar" class="cozy-img" />
              <div v-else class="cozy-circle">{{ roleData.decorationEmoji }}</div>
            </div>
            <div class="cozy-content">
              <div class="cozy-label" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
              <div class="cozy-name">{{ roleData.name }}</div>
              <div class="cozy-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="cozy-tags">
                <span v-for="tag in roleData.tags" :key="tag" class="cozy-tag-item">{{ tag }}</span>
              </div>
              <div class="cozy-footer">
                <div class="cozy-date">对话 {{ roleData.messageCount }} 次</div>
              </div>
            </div>
          </div>

          <!-- ============================================================
               7. 故障艺术
          ============================================================ -->
          <div v-else-if="activeTemplate==='glitch'" ref="cardRef" class="card card-glitch" :style="themeStyle">
            <div class="glitch-base">
              <div class="glitch-top">
                <div class="glitch-scanlines"></div>
                <div class="glitch-layer glitch-layer-r">{{ roleData.avatar ? '' : roleData.decorationEmoji }}</div>
                <div class="glitch-layer glitch-layer-g">{{ roleData.avatar ? '' : roleData.decorationEmoji }}</div>
                <div class="glitch-layer glitch-layer-b">{{ roleData.avatar ? '' : roleData.decorationEmoji }}</div>
                <img v-if="roleData.avatar" :src="roleData.avatar" class="glitch-img" style="position:relative;z-index:2;" />
                <div v-else class="glitch-emoji">{{ roleData.decorationEmoji }}</div>
                <div class="glitch-tear" style="--h:4px;--t:60px;--delay:0s;"></div>
                <div class="glitch-tear" style="--h:2px;--t:120px;--delay:1.5s;"></div>
                <div class="glitch-tear" style="--h:6px;--t:160px;--delay:3s;"></div>
              </div>
              <div class="glitch-content">
                <div class="glitch-tag" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
                <div class="glitch-name" :data-text="roleData.name">{{ roleData.name }}</div>
                <div class="glitch-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
                <div class="glitch-footer">
                  <span style="font-family:'Share Tech Mono';font-size:8px;color:#333">{{ roleData.messageCount }}x · ACTIVE</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================
               8. 老式胶片
          ============================================================ -->
          <div v-else-if="activeTemplate==='film'" ref="cardRef" class="card card-film" :style="themeStyle">
            <div class="film-sprocket left" id="rcg-left-spr"></div>
            <div class="film-sprocket right" id="rcg-right-spr"></div>
            <div class="film-scratch film-scratch-1"></div>
            <div class="film-scratch film-scratch-2"></div>
            <div class="film-main">
              <div class="film-photo">
                <div class="film-grain"></div><div class="film-vignette"></div>
                <img v-if="roleData.avatar" :src="roleData.avatar" class="film-img" />
                <div v-else class="film-emoji">{{ roleData.decorationEmoji }}</div>
                <div class="film-timestamp">{{ new Date().getFullYear() }}</div>
              </div>
              <div class="film-content">
                <div class="film-reel" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
                <div class="film-name">{{ roleData.name }}</div>
                <div class="film-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
                <div class="film-strip">
                  <div v-for="tag in (roleData.tags.length ? roleData.tags.slice(0,4) : ['🌅','🚂','☕','🌧'])" :key="tag" class="film-frame">{{ tag.length === 1 ? tag : '◈' }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================
               9. 极简主义
          ============================================================ -->
          <div v-else-if="activeTemplate==='minimal'" ref="cardRef" class="card card-minimal" :style="themeStyle">
            <div class="min-top-bar"></div>
            <div class="min-avatar">
              <div class="min-orbit min-orbit-1"><div class="min-orbit-dot"></div></div>
              <div class="min-orbit min-orbit-2"><div class="min-orbit-dot"></div></div>
              <img v-if="roleData.avatar" :src="roleData.avatar" class="min-img" />
              <div v-else class="min-circle">{{ roleData.decorationEmoji }}</div>
            </div>
            <div class="min-content">
              <div class="min-number" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
              <div class="min-name">{{ roleData.name }}</div>
              <div class="min-line"></div>
              <div class="min-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="min-footer">
                <span style="font-size:9px;color:#ccc;letter-spacing:2px;">{{ roleData.messageCount }} msgs</span>
                <span class="min-arrow">→</span>
              </div>
            </div>
          </div>

          <!-- ============================================================
               10. 液态极光
          ============================================================ -->
          <div v-else-if="activeTemplate==='aurora'" ref="cardRef" class="card card-aurora" :style="themeStyle">
            <div class="aurora-bg">
              <div class="aurora-blob aurora-blob-1"></div><div class="aurora-blob aurora-blob-2"></div>
              <div class="aurora-blob aurora-blob-3"></div><div class="aurora-blob aurora-blob-4"></div>
            </div>
            <div class="aurora-overlay"></div><div class="aurora-glass"></div>
            <div class="aurora-avatar">
              <div class="aurora-ring">
                <img v-if="roleData.avatar" :src="roleData.avatar" class="aurora-img" />
                <div v-else class="aurora-emoji">{{ roleData.decorationEmoji }}</div>
              </div>
            </div>
            <div class="aurora-content">
              <div class="aurora-subtitle" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="outline:none;"></div>
              <div class="aurora-name">{{ roleData.name }}</div>
              <div class="aurora-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="aurora-footer">
                <div class="aurora-dots">
                  <div class="aurora-dot" style="background:#7c3aed"></div>
                  <div class="aurora-dot" style="background:#0ea5e9"></div>
                  <div class="aurora-dot" style="background:#10b981"></div>
                </div>
                <span style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:2px;">{{ roleData.messageCount }} msgs</span>
              </div>
            </div>
          </div>

          <!-- ============================================================
               11. 手账剪贴
          ============================================================ -->
          <div v-else-if="activeTemplate==='scrap'" ref="cardRef" class="card card-scrap" :style="themeStyle">
            <div class="scrap-torn"></div>
            <div class="tape tape-1"></div><div class="tape tape-2"></div><div class="tape tape-3"></div>
            <div class="sticky-note sticky-1">最喜欢的角色♡<br>记得回来！</div>
            <div class="scrap-photo">
              <img v-if="roleData.avatar" :src="roleData.avatar" class="scrap-img" />
              <div v-else class="scrap-emoji">{{ roleData.decorationEmoji }}</div>
              <div class="photo-date">{{ new Date().toISOString().slice(0,10) }}</div>
            </div>
            <div class="scrap-content">
              <div class="scrap-sticker">🌟</div>
              <div class="pencil-line" style="top:30px;"></div>
              <div class="scrap-name">{{ roleData.name }}</div>
              <div class="scrap-underline"></div>
              <div class="scrap-desc" contenteditable="true" @input="onBioInput" :textContent="roleData.bio" style="outline:none;"></div>
              <div class="scrap-row">
                <div class="scrap-hearts">{{ roleData.decorationEmoji }} {{ roleData.decorationEmoji }}</div>
                <span class="scrap-tagline" contenteditable="true" @input="onTaglineInput" :textContent="roleData.tagline" style="font-family:'Caveat',cursive;font-size:12px;color:var(--card-accent,#c87030);outline:none;"></span>
              </div>
            </div>
          </div>

        </div><!-- end rcg-card-wrap -->
        <div v-else class="rcg-loading">正在加载...</div>
      </div><!-- end preview area -->
    </div><!-- end body -->
  </div>
</template>

<style>
/* ── Modal layout ── */
.rcg-modal { width:min(900px,96vw);max-height:90vh;background:#0e0e1f;border:1px solid rgba(255,255,255,0.1);border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6); }
.rcg-header { display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0; }
.rcg-title { font-size:18px;font-weight:700;color:#f0eeff; }
.rcg-close { width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#aaa;cursor:pointer;font-size:14px;transition:background 0.15s; }
.rcg-close:hover { background:rgba(255,255,255,0.15);color:#fff; }
.rcg-mode-tabs { display:flex;gap:8px;padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0; }
.rcg-tab { padding:6px 16px;border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#9ca3af;font-size:13px;cursor:pointer;transition:all 0.15s; }
.rcg-tab:hover { background:rgba(255,255,255,0.06); }
.rcg-tab.active { background:rgba(99,102,241,0.25);border-color:rgba(99,102,241,0.5);color:#a5b4fc; }
.rcg-body { display:flex;flex:1;overflow:hidden; }
.rcg-controls { width:280px;flex-shrink:0;padding:16px;overflow-y:auto;border-right:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:16px; }
.rcg-section { display:flex;flex-direction:column;gap:8px; }
.rcg-label { font-size:11px;letter-spacing:1px;color:#6b7280;text-transform:uppercase; }
.rcg-hint { font-size:12px;color:#6b7280;line-height:1.5; }
.rcg-warn { font-size:11px;color:#f59e0b; }
.rcg-btn-primary { padding:9px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:opacity 0.15s; }
.rcg-btn-primary:disabled { opacity:0.5;cursor:not-allowed; }
.rcg-btn-primary:not(:disabled):hover { opacity:0.88; }
.rcg-textarea { width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e5e7eb;font-size:12px;padding:8px;resize:none;outline:none; }
.rcg-textarea:focus { border-color:rgba(99,102,241,0.5); }
.rcg-template-list { display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto; }
.rcg-tmpl-btn { display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#9ca3af;font-size:12px;cursor:pointer;text-align:left;transition:all 0.12s; }
.rcg-tmpl-btn:hover { background:rgba(255,255,255,0.06);color:#e5e7eb; }
.rcg-tmpl-btn.active { background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#a5b4fc; }
.rcg-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0; }
.rcg-color-row { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
.rcg-color-item { display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;color:#6b7280;cursor:pointer; }
.rcg-color-item input[type="color"] { width:36px;height:28px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;cursor:pointer;background:none;padding:2px; }
.rcg-actions { display:flex;gap:8px;margin-top:auto; }
.rcg-btn-export { flex:1;padding:9px;border-radius:10px;border:1px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.1);color:#a5b4fc;font-size:12px;cursor:pointer;transition:all 0.15s; }
.rcg-btn-export:not(:disabled):hover { background:rgba(99,102,241,0.2); }
.rcg-btn-export:disabled { opacity:0.5;cursor:not-allowed; }
.rcg-btn-save { flex:1;padding:9px;border-radius:10px;border:1px solid rgba(52,211,153,0.4);background:rgba(52,211,153,0.08);color:#6ee7b7;font-size:12px;cursor:pointer;transition:all 0.15s; }
.rcg-btn-save:hover { background:rgba(52,211,153,0.15); }
.rcg-local-toast { padding:8px 14px;border-radius:20px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.3);color:#c7d2fe;font-size:12px;text-align:center; }
.rcg-toast-enter-active,.rcg-toast-leave-active { transition:opacity 0.3s; }
.rcg-toast-enter-from,.rcg-toast-leave-to { opacity:0; }
/* Preview */
.rcg-preview-area { flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:24px;overflow-y:auto;gap:12px; }
.rcg-preview-hint { font-size:11px;color:#4b5563;letter-spacing:1px; }
.rcg-card-wrap { display:flex;align-items:center;justify-content:center; }
.rcg-loading { color:#4b5563;font-size:14px; }
/* Mobile */
@media (max-width:640px) {
  .rcg-body { flex-direction:column; }
  .rcg-controls { width:100%;border-right:none;border-bottom:1px solid rgba(255,255,255,0.06); }
  .rcg-card-wrap { transform:scale(0.85);transform-origin:top center; }
}
</style>
