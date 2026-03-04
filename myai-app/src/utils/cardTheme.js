// cardTheme.js — Role Card Generator theme utilities

export const DEFAULT_OVERRIDES = {
  love:    { primary: '#ff6eb0', bg: '#fff0f6', text: '#cc4488', accent: '#ffb3d1' },
  ink:     { primary: '#c8a96e', bg: '#f5efe0', text: '#1a0a00', accent: '#8b2020' },
  dark:    { primary: '#8b0000', bg: '#0d0005', text: '#e8dcc8', accent: '#4a0030' },
  cyber:   { primary: '#00ff9f', bg: '#020815', text: '#00ff9f', accent: '#bf00ff' },
  flame:   { primary: '#ff6b1a', bg: '#1a0800', text: '#fff0e0', accent: '#ff3300' },
  cozy:    { primary: '#7c9e6b', bg: '#f5f5ea', text: '#3a3a2a', accent: '#d4b896' },
  glitch:  { primary: '#ff0050', bg: '#000000', text: '#ffffff', accent: '#00ff80' },
  film:    { primary: '#c8a050', bg: '#1a1008', text: '#f0d880', accent: '#8a6020' },
  minimal: { primary: '#000000', bg: '#fafafa', text: '#111111', accent: '#666666' },
  aurora:  { primary: '#7c3aed', bg: '#05050f', text: '#ffffff', accent: '#0ea5e9' },
  scrap:   { primary: '#c87030', bg: '#f5f0e8', text: '#3a2a1a', accent: '#e8b870' },
}

export const TEMPLATE_LIST = [
  { id: 'love',    name: '甜心恋爱', dot: '#ff6eb0' },
  { id: 'ink',     name: '国风水墨', dot: '#c8a96e' },
  { id: 'dark',    name: '暗黑哥特', dot: '#8b0000' },
  { id: 'cyber',   name: '赛博朋克', dot: '#00ff9f' },
  { id: 'flame',   name: '烈焰热血', dot: '#ff6b1a' },
  { id: 'cozy',    name: '治愈日常', dot: '#7c9e6b' },
  { id: 'glitch',  name: '故障艺术', dot: '#ff0050' },
  { id: 'film',    name: '老式胶片', dot: '#c8a050' },
  { id: 'minimal', name: '极简主义', dot: '#888888' },
  { id: 'aurora',  name: '液态极光', dot: '#7c3aed' },
  { id: 'scrap',   name: '手账剪贴', dot: '#c87030' },
]

/**
 * Auto-select a template based on keyword matching in role text.
 * Used as fallback when AI generation fails or no API key is set.
 * @param {Object} role
 * @returns {Object} ThemeToken
 */
export function autoSelectTheme(role) {
  const text = `${role.name || ''} ${role.description || ''} ${role.systemPrompt || ''}`.toLowerCase()

  const rules = [
    { keywords: ['恶魔', '亡灵', '黑暗', '死亡', '诅咒', '骷髅', '吸血鬼'], template: 'dark' },
    { keywords: ['赛博', 'ai', '机甲', '黑客', '程序', '代码', '机器人', '电子'], template: 'cyber' },
    { keywords: ['古代', '仙侠', '武侠', '修仙', '剑客', '道士', '修炼', '江湖'], template: 'ink' },
    { keywords: ['魔法', '精灵', '梦境', '占卜', '星辰', '星空', '精灵族', '精灵王'], template: 'aurora' },
    { keywords: ['恋爱', '少女', '甜', '可爱', '萌', '校园', '初恋', '心动'], template: 'love' },
    { keywords: ['战士', '格斗', '热血', '战斗', '勇者', '英雄', '拳击', '格斗家'], template: 'flame' },
    { keywords: ['复古', '侦探', '黑白', '胶片', '民国', '1920', '1930', '1940', '侦探'], template: 'film' },
    { keywords: ['极简', '冷静', '精英', '冷酷', '知性', '商务', '职场'], template: 'minimal' },
    { keywords: ['故障', '混沌', '实验', '赛博朋克艺术', '像素'], template: 'glitch' },
    { keywords: ['手账', '日记', '剪贴', '贴纸', '手工', '拼贴'], template: 'scrap' },
    { keywords: ['咖啡', '温柔', '邻家', '日常', '普通', '家常', '治愈'], template: 'cozy' },
  ]

  for (const rule of rules) {
    if (rule.keywords.some(k => text.includes(k))) {
      const tmpl = rule.template
      return {
        template: tmpl,
        overrides: { ...DEFAULT_OVERRIDES[tmpl] },
        tagline: (role.name || '未知角色') + '・角色卡',
        mood: 'auto',
        decorationEmoji: getDefaultEmoji(tmpl),
      }
    }
  }

  return {
    template: 'minimal',
    overrides: { ...DEFAULT_OVERRIDES.minimal },
    tagline: (role.name || '未知角色') + '・角色卡',
    mood: 'default',
    decorationEmoji: '🌟',
  }
}

function getDefaultEmoji(template) {
  const emojiMap = {
    love: '💕', ink: '⚔️', dark: '💀', cyber: '🤖',
    flame: '🔥', cozy: '☕', glitch: '⚡', film: '🎞️',
    minimal: '✦', aurora: '✨', scrap: '📌',
  }
  return emojiMap[template] || '✨'
}
