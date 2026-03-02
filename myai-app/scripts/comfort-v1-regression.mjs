import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(projectRoot, '..');

const filePaths = {
  chatWindow: path.join(projectRoot, 'src', 'components', 'ChatWindow.vue'),
  groupWindow: path.join(projectRoot, 'src', 'components', 'GroupChatWindow.vue'),
  style: path.join(projectRoot, 'src', 'style.css'),
  storage: path.join(projectRoot, 'src', 'utils', 'storage.js'),
  readabilityReport: path.join(repoRoot, 'docs', 'comfort-v1-readability-report.md'),
  output: path.join(repoRoot, 'docs', 'comfort-v1-regression-report.md'),
};

const files = Object.fromEntries(
  Object.entries(filePaths)
    .filter(([k]) => k !== 'output')
    .map(([k, p]) => [k, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '']),
);

const checks = [];
const addCheck = (name, pass, detail) => checks.push({ name, pass, detail });
const has = (content, token) => content.includes(token);

addCheck(
  'ChatWindow mounted comfort shell and density class',
  has(files.chatWindow, 'class="chat-window-shell') &&
    has(files.chatWindow, "'density-' + (globalSettings.readingDensity || 'standard')"),
  'ChatWindow main container uses comfort shell + density class.',
);

addCheck(
  'GroupChatWindow mounted comfort shell and density class',
  has(files.groupWindow, 'class="chat-window-shell') &&
    has(files.groupWindow, "'density-' + (globalSettings?.readingDensity || 'standard')"),
  'GroupChatWindow main container uses comfort shell + density class.',
);

addCheck(
  'ChatWindow splits AI/user reading columns',
  has(files.chatWindow, 'chat-ai-column') && has(files.chatWindow, 'chat-user-column'),
  'ChatWindow has separate AI and user width classes.',
);

addCheck(
  'Group AI bubble reuses unified speech-bubble style system',
  has(files.groupWindow, 'group-speech-bubble speech-bubble') &&
    has(files.groupWindow, "['style-' + (globalSettings?.rpTextStyle || 'clear')"),
  'Group assistant message uses style-{rpTextStyle} unified class path.',
);

addCheck(
  'No group-only style branches for text styles',
  !/group-speech-bubble\.style-(clear|misty|day|loveDark|loveLight)/.test(files.groupWindow),
  'No scoped group-speech-bubble.style-* overrides found in GroupChatWindow.vue.',
);

addCheck(
  'Token files imported in global stylesheet',
  has(files.style, '@import "./styles/tokens.css";') &&
    has(files.style, '@import "./styles/theme-tokens.css";') &&
    has(files.style, '@import "./styles/decor-tokens.css";'),
  'style.css imports tokens + theme-tokens + decor-tokens.',
);

addCheck(
  'Motion tier classes exist in chat windows',
  has(files.chatWindow, "'motion-off': level === 'off'") &&
    has(files.chatWindow, "'motion-soft': level === 'soft'") &&
    has(files.chatWindow, "'motion-expressive': level === 'expressive'") &&
    has(files.groupWindow, "'motion-off': level === 'off'") &&
    has(files.groupWindow, "'motion-soft': level === 'soft'") &&
    has(files.groupWindow, "'motion-expressive': level === 'expressive'"),
  'Single/group chat both expose off/soft/expressive motion classes.',
);

addCheck(
  'Long-conversation fatigue softening exists',
  has(files.style, '.motion-fatigue .floating-heart') &&
    has(files.style, '.motion-fatigue .speech-bubble:hover'),
  'Fatigue class lowers animation intensity for long conversations.',
);

addCheck(
  'Reduced-motion fallback exists',
  has(files.style, '@media (prefers-reduced-motion: reduce)') &&
    has(files.style, '.floating-heart-layer'),
  'Prefers-reduced-motion disables decorative animation chain.',
);

addCheck(
  'Default reading density is standard',
  /readingDensity:\s*'standard'/.test(files.storage),
  'storage default keeps readingDensity as standard.',
);

addCheck(
  'Default motion level is soft',
  /motionLevel:\s*'soft'/.test(files.storage),
  'storage default keeps motionLevel as soft.',
);

const readabilityAllGreen = files.readabilityReport.includes('| clear |') && !files.readabilityReport.includes('❌');
addCheck(
  'Readability audit report all pass',
  readabilityAllGreen,
  'comfort-v1-readability-report.md has no failing marks.',
);

const allPass = checks.every((c) => c.pass);
const now = new Date().toISOString();

const out = [];
out.push('# Comfort V1 Regression Report');
out.push('');
out.push(`- Time: ${now}`);
out.push(`- Result: ${allPass ? 'PASS' : 'FAIL'}`);
out.push('');
out.push('| Check | Result | Notes |');
out.push('| --- | :---: | --- |');
for (const c of checks) {
  out.push(`| ${c.name} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.detail} |`);
}
out.push('');
out.push('## Manual Scenario Checklist');
out.push('');
out.push('- [ ] 30 short messages: verify density and hierarchy comfort');
out.push('- [ ] 800+ character long message: verify line-length and paragraph rhythm');
out.push('- [ ] alternating group speakers: verify single/group style parity');
out.push('- [ ] 5-minute continuous scrolling: verify motion fatigue and scrollbar stability');
out.push('');
out.push('## Notes');
out.push('');
out.push('- This report is structural regression + audit aggregation, not a replacement for visual QA.');

fs.writeFileSync(filePaths.output, `${out.join('\n')}\n`, 'utf8');
console.log(`Regression report generated: ${filePaths.output}`);
console.table(checks.map((c) => ({ check: c.name, pass: c.pass })));
