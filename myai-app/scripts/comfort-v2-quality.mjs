import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(projectRoot, '..');

const paths = {
  themeTokens: path.join(projectRoot, 'src', 'styles', 'theme-tokens.css'),
  decorTokens: path.join(projectRoot, 'src', 'styles', 'decor-tokens.css'),
  baseTokens: path.join(projectRoot, 'src', 'styles', 'tokens.css'),
  style: path.join(projectRoot, 'src', 'style.css'),
  chatWindow: path.join(projectRoot, 'src', 'components', 'ChatWindow.vue'),
  groupWindow: path.join(projectRoot, 'src', 'components', 'GroupChatWindow.vue'),
  storage: path.join(projectRoot, 'src', 'utils', 'storage.js'),
  readability: path.join(repoRoot, 'docs', 'comfort-v1-readability-report.md'),
  regression: path.join(repoRoot, 'docs', 'comfort-v1-regression-report.md'),
  output: path.join(repoRoot, 'docs', 'comfort-v2-quality-report.md'),
};

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const files = Object.fromEntries(Object.entries(paths).filter(([k]) => k !== 'output').map(([k, p]) => [k, read(p)]));

const STYLE_IDS = ['clear', 'misty', 'day', 'loveDark', 'loveLight'];

function extractCssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const m = css.match(re);
  return m ? m[1] : '';
}

function extractVar(block, varName) {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*:\\s*([^;]+);`);
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function parseColor(colorText) {
  const text = (colorText || '').trim().replace(/\s*!important\s*$/i, '').toLowerCase();
  if (!text) return { r: 0, g: 0, b: 0, a: 0 };
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
  }
  const rgba = text.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const parts = rgba[1].split(',').map((s) => s.trim());
    return {
      r: Number(parts[0] || 0),
      g: Number(parts[1] || 0),
      b: Number(parts[2] || 0),
      a: parts.length >= 4 ? Number(parts[3]) : 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 0 };
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const da = (a.a - b.a) * 255;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
  return dist;
}

function scoreStyleDistinctness() {
  const vectors = STYLE_IDS.map((id) => {
    const themeBlock = extractCssBlock(files.themeTokens, `.chat-style-${id}`);
    const decorBlock = extractCssBlock(files.decorTokens, `.chat-style-${id}`);
    return [
      parseColor(extractVar(themeBlock, '--style-body-color')),
      parseColor(extractVar(themeBlock, '--style-action-color')),
      parseColor(extractVar(decorBlock, '--decor-divider-label-color')),
      parseColor(extractVar(decorBlock, '--decor-time-color')),
    ];
  });

  const pairDistances = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      let sum = 0;
      for (let k = 0; k < vectors[i].length; k++) {
        sum += colorDistance(vectors[i][k], vectors[j][k]);
      }
      pairDistances.push(sum / vectors[i].length);
    }
  }

  const avg = pairDistances.reduce((a, b) => a + b, 0) / pairDistances.length;
  const min = Math.min(...pairDistances);
  const score = Math.max(0, Math.min(100, Math.round((avg * 0.45) + (min * 0.25))));
  return { score, avgDistance: avg.toFixed(2), minDistance: min.toFixed(2) };
}

function scoreLongReadFatigue() {
  let score = 0;
  const reasons = [];

  if (/motionLevel:\s*'soft'/.test(files.storage)) {
    score += 20;
    reasons.push('默认动效为 soft');
  }
  if (files.style.includes('.motion-fatigue .floating-heart') && files.style.includes('.motion-fatigue .speech-bubble:hover')) {
    score += 25;
    reasons.push('长对话启用 fatigue 降噪');
  }
  if (files.style.includes('@media (prefers-reduced-motion: reduce)')) {
    score += 25;
    reasons.push('支持 prefers-reduced-motion');
  }
  if (
    files.style.includes('@media (max-width: 768px)') &&
    (files.chatWindow.includes("matchMedia?.('(max-width: 768px)')") ||
      files.groupWindow.includes("matchMedia?.('(max-width: 768px)')"))
  ) {
    score += 10;
    reasons.push('移动端动效降级');
  }
  const tokenBlock = extractCssBlock(files.baseTokens, ':root');
  const lineHeight = Number((extractVar(tokenBlock, '--read-line-height') || '0').replace(/[^\d.]/g, ''));
  const fontSize = Number((extractVar(tokenBlock, '--read-font-size') || '0').replace(/[^\d.]/g, ''));
  if (lineHeight >= 1.8 && fontSize >= 15) {
    score += 20;
    reasons.push('排版舒适基线达标');
  }

  return { score: Math.min(100, score), reasons };
}

const readabilityPass = files.readability && !files.readability.includes('❌');
const regressionPass = files.regression && !files.regression.includes('| FAIL |');
const hardGatePass = readabilityPass && regressionPass;

const distinctness = scoreStyleDistinctness();
const fatigue = scoreLongReadFatigue();

const lines = [];
lines.push('# Comfort V2 质量报告');
lines.push('');
lines.push(`- Time: ${new Date().toISOString()}`);
lines.push(`- Hard Gate (v1 regression + readability): ${hardGatePass ? 'PASS' : 'FAIL'}`);
lines.push(`- 风格辨识度分数: ${distinctness.score}/100`);
lines.push(`- 长读疲劳度分数: ${fatigue.score}/100`);
lines.push('');
lines.push('## Scoring Details');
lines.push('');
lines.push(`- Distinctness Avg Distance: ${distinctness.avgDistance}`);
lines.push(`- Distinctness Min Distance: ${distinctness.minDistance}`);
lines.push(`- Fatigue Reasons: ${fatigue.reasons.join('、') || '无'}`);
lines.push('');
lines.push('## Hard Gate');
lines.push('');
lines.push(`- v1 Readability all green: ${readabilityPass ? '✅' : '❌'}`);
lines.push(`- v1 Regression all pass: ${regressionPass ? '✅' : '❌'}`);

fs.writeFileSync(paths.output, `${lines.join('\n')}\n`, 'utf8');
console.log(`Quality report generated: ${paths.output}`);
console.table([
  { metric: 'hardGate', pass: hardGatePass },
  { metric: 'styleDistinctness', score: distinctness.score },
  { metric: 'longReadFatigue', score: fatigue.score },
]);
