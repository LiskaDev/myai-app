import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const themeTokenPath = path.join(projectRoot, 'src', 'styles', 'theme-tokens.css');
const stylePath = path.join(projectRoot, 'src', 'style.css');
const reportPath = path.resolve(projectRoot, '..', 'docs', 'comfort-v1-readability-report.md');

const themeCss = fs.readFileSync(themeTokenPath, 'utf8');
const styleCss = fs.readFileSync(stylePath, 'utf8');

const STYLE_IDS = ['clear', 'misty', 'day', 'loveDark', 'loveLight'];

function parseColor(colorText) {
  const text = colorText.trim().replace(/\s*!important\s*$/i, '').toLowerCase();
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    }
  }
  const rgbaMatch = text.match(/rgba?\(([^)]+)\)/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((p) => p.trim());
    const [r, g, b] = parts.slice(0, 3).map((v) => Number(v));
    const a = parts.length >= 4 ? Number(parts[3]) : 1;
    return { r, g, b, a };
  }
  if (text === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  throw new Error(`Unsupported color format: ${colorText}`);
}

function blend(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const r = (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a;
  const g = (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a;
  const b = (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a;
  return { r, g, b, a };
}

function toLinear(channel255) {
  const v = channel255 / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractCssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const m = css.match(re);
  if (!m) return '';
  return m[1];
}

function extractProp(block, propName) {
  const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*:\\s*([^;]+);`);
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function getPageBg(styleId) {
  const block = extractCssBlock(styleCss, `.chat-style-${styleId}`);
  return extractProp(block, 'background');
}

function getBubbleBg(styleId) {
  const block = extractCssBlock(styleCss, `.speech-bubble.style-${styleId}`);
  return extractProp(block, 'background');
}

function getThemeVars(styleId) {
  const block = extractCssBlock(themeCss, `.chat-style-${styleId}`);
  return {
    body: extractProp(block, '--style-body-color'),
    action: extractProp(block, '--style-action-color'),
    status: extractProp(block, '--style-status-color'),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const rows = STYLE_IDS.map((styleId) => {
  const pageBg = parseColor(getPageBg(styleId));
  const bubbleBgRaw = parseColor(getBubbleBg(styleId) || 'transparent');
  const bubbleBg = blend(bubbleBgRaw, pageBg);
  const vars = getThemeVars(styleId);

  const bodyColor = blend(parseColor(vars.body), bubbleBg);
  const actionColor = blend(parseColor(vars.action), bubbleBg);
  const statusColor = blend(parseColor(vars.status), bubbleBg);

  const bodyRatio = round2(contrastRatio(bodyColor, bubbleBg));
  const actionRatio = round2(contrastRatio(actionColor, bubbleBg));
  const statusRatio = round2(contrastRatio(statusColor, bubbleBg));

  return {
    styleId,
    bodyRatio,
    actionRatio,
    statusRatio,
    bodyPass: bodyRatio >= 4.5,
    weakPass: actionRatio >= 3 && statusRatio >= 3,
  };
});

const bodyAllPass = rows.every((r) => r.bodyPass);
const weakAllPass = rows.every((r) => r.weakPass);

const lines = [];
lines.push('# Comfort V1 可读性审计');
lines.push('');
lines.push(`- 时间: ${new Date().toISOString()}`);
lines.push('- 规则: 正文 >= 4.5:1，弱信息(动作/状态) >= 3:1');
lines.push('');
lines.push('| 风格 | 正文对比度 | 动作对比度 | 状态对比度 | 正文达标 | 弱信息达标 |');
lines.push('| --- | ---: | ---: | ---: | :---: | :---: |');
for (const row of rows) {
  lines.push(
    `| ${row.styleId} | ${row.bodyRatio} | ${row.actionRatio} | ${row.statusRatio} | ${row.bodyPass ? '✅' : '❌'} | ${row.weakPass ? '✅' : '❌'} |`,
  );
}
lines.push('');
lines.push(`- 正文整体: ${bodyAllPass ? '✅ 全部达标' : '❌ 存在未达标'}`);
lines.push(`- 弱信息整体: ${weakAllPass ? '✅ 全部达标' : '❌ 存在未达标'}`);
lines.push('');
lines.push('## 回归场景检查项');
lines.push('');
lines.push('- [ ] 短消息连续 30 条（观察密度与层级）');
lines.push('- [ ] 长消息 800+ 字（观察长行与段落节奏）');
lines.push('- [ ] 群聊交替角色（检查单聊/群聊同风格一致性）');
lines.push('- [ ] 连续滚动 5 分钟（检查动效疲劳、滚动稳定）');

fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Readability report generated: ${reportPath}`);
console.table(rows);
