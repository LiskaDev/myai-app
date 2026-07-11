/**
 * 📔 单篇日记导出 (Diary Exporter)
 *
 * 将单篇角色日记导出为独立的手写信纸风格 HTML 文件，
 * 完整复刻 DiaryModal.vue 里 paper 模式的视觉样式，CSS 全部内联，离线可打开。
 */

import { downloadHTML } from './useStoryExporter';

const FONT_FAMILY = 'Ma Shan Zheng';
// 内联字体总大小上限，超过则放弃内联改用系统字体
// 🛡️ 实测：中文手写字体每个 unicode-range 分片约 70-90KB，一篇 ~100 字左右的
// 日记通常命中 10-15 个分片（约 1MB），500KB 的上限会让几乎所有日记都降级，
// 因此放宽到 3MB，仍能拦住异常情况（字符特别杂、分片特别多）
const FONT_SIZE_LIMIT = 3 * 1024 * 1024;
const MAX_FONT_CHUNKS = 60; // Google Fonts 对中文字体按 unicode-range 切成很多小分片，数量过多也放弃内联

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 解析 CSS unicode-range 声明（如 "U+4E00-9FFF, U+3400-4DBF"）为 [start, end] 数组
function parseUnicodeRange(rangeText) {
    return rangeText.split(',').map((part) => {
        const token = part.trim().replace(/^U\+/i, '');
        if (token.includes('-')) {
            const [start, end] = token.split('-');
            return [parseInt(start, 16), parseInt(end, 16)];
        }
        if (token.includes('?')) {
            // 通配符形式如 4E?? ，展开为覆盖的完整范围
            return [parseInt(token.replace(/\?/g, '0'), 16), parseInt(token.replace(/\?/g, 'F'), 16)];
        }
        const code = parseInt(token, 16);
        return [code, code];
    });
}

function codePointsOf(text) {
    return new Set(Array.from(text || '').map((ch) => ch.codePointAt(0)));
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 尝试把 Google Fonts 的手写字体内联为 base64（只挑选日记实际用到的字符所在分片，控制体积）。
 * 网络失败 / 体积过大 / 分片过多时静默返回 null，交给调用方降级为系统字体。
 */
async function tryInlineFont(sampleText) {
    try {
        const codePoints = codePointsOf(sampleText);
        if (codePoints.size === 0) return null;

        const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(FONT_FAMILY)}&display=swap`;
        const cssResp = await fetch(cssUrl);
        if (!cssResp.ok) {
            console.warn('[DiaryExporter] 字体 CSS 请求失败:', cssResp.status);
            return null;
        }
        const cssText = await cssResp.text();

        const faces = [];
        for (const block of cssText.matchAll(/@font-face\s*{([^}]+)}/g)) {
            const body = block[1];
            // 不锚定在 "src:" 后面——部分响应会先给 local(...) 再给 url(...)，
            // 且捕获到的 URL 可能被引号包裹，一并去掉
            const urlMatch = body.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)\s*format\(\s*['"]woff2['"]\s*\)/);
            const rangeMatch = body.match(/unicode-range:\s*([^;]+);/);
            if (!urlMatch || !rangeMatch) continue;
            faces.push({
                url: urlMatch[1].trim(),
                rangeText: rangeMatch[1].trim(),
                ranges: parseUnicodeRange(rangeMatch[1]),
            });
        }
        if (faces.length === 0) {
            console.warn('[DiaryExporter] 未能从字体 CSS 中解析出任何 @font-face，降级为系统字体');
            return null;
        }

        // 只保留和日记实际用到的字符有交集的分片，避免整套字体全部下载
        const needed = faces.filter((f) =>
            f.ranges.some(([start, end]) => {
                for (const cp of codePoints) {
                    if (cp >= start && cp <= end) return true;
                }
                return false;
            })
        );
        if (needed.length === 0 || needed.length > MAX_FONT_CHUNKS) {
            console.warn('[DiaryExporter] 匹配到的字体分片数量不合适，降级为系统字体:', needed.length);
            return null;
        }

        const results = await Promise.all(
            needed.map(async (face) => {
                const resp = await fetch(face.url);
                if (!resp.ok) throw new Error(`font chunk fetch failed: ${resp.status}`);
                return { face, blob: await resp.blob() };
            })
        );

        let totalBytes = 0;
        const fontFaceRules = [];
        for (const { face, blob } of results) {
            totalBytes += blob.size;
            if (totalBytes > FONT_SIZE_LIMIT) {
                console.warn('[DiaryExporter] 字体总体积超限，降级为系统字体:', totalBytes);
                return null;
            }
            const dataUrl = await blobToDataURL(blob);
            fontFaceRules.push(
                `@font-face { font-family: '${FONT_FAMILY}'; font-style: normal; font-weight: 400; ` +
                `src: url(${dataUrl}) format('woff2'); unicode-range: ${face.rangeText}; }`
            );
        }
        return fontFaceRules.join('\n');
    } catch (e) {
        console.warn('[DiaryExporter] 字体内联失败，降级为系统字体:', e?.message || e);
        return null;
    }
}

function formatDiaryDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDiaryDateForFileName(iso) {
    if (!iso) return '日记';
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function getDiaryExportFileName(diary) {
    const name = (diary.roleName || '角色').replace(/[^a-zA-Z0-9一-鿿]/g, '');
    return `${name}_${formatDiaryDateForFileName(diary.date)}_日记.html`;
}

/**
 * 构建单篇日记的独立 HTML 文档（手写信纸视觉样式，与 DiaryModal.vue 的 paper 模式一致）
 */
export async function buildDiaryHTML(diary) {
    const sampleText = `私密日记${diary.roleName || ''}的日记——${diary.content || ''}`;
    const fontFaceCSS = await tryInlineFont(sampleText);
    // 内联成功用内联字体名，失败时降级为系统衬线/楷体风格字体
    const fontStack = fontFaceCSS
        ? `'${FONT_FAMILY}', 'STKaiti', 'KaiTi', serif`
        : `'STKaiti', 'KaiTi', 'Noto Serif SC', serif`;

    const avatarHtml = diary.roleAvatar
        ? `<img src="${diary.roleAvatar}" alt="" />`
        : `<span class="diary-avatar-fallback">📝</span>`;

    const absenceBadgeHtml = diary.isAbsenceDiary
        ? `<div class="diary-absence-badge">💭 写于你不在的时候</div>`
        : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(diary.roleName || '角色')}的日记 · ${escapeHtml(formatDiaryDate(diary.date))}</title>
<style>
${fontFaceCSS || ''}
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height: 100%; }
body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px 20px;
    background:
        radial-gradient(ellipse 900px 560px at 50% 8%, rgba(140, 105, 70, 0.32), transparent 65%),
        radial-gradient(ellipse 1100px 700px at 50% 105%, rgba(20, 14, 9, 0.7), transparent 60%),
        linear-gradient(160deg, #261c13 0%, #1c150e 55%, #120d08 100%);
    background-color: #1c150e;
}
.diary-container {
    position: relative;
    width: 100%;
    max-width: 480px;
    color: #3a2a1a;
}
.diary-container::before {
    /* 信纸背后的暖光晕，让卡片在深色背景上显得更有层次 */
    content: '';
    position: absolute;
    inset: -36px;
    background: radial-gradient(closest-side, rgba(250, 220, 170, 0.16), transparent 72%);
    filter: blur(4px);
    z-index: -1;
}
.diary-paper {
    position:relative;
    background-color:#faf0de;
    border-radius:4px;
    padding:32px 28px 24px;
    box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(180, 150, 100, 0.35),
        0 0 70px rgba(200, 160, 100, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.5),
        inset 0 -1px 0 rgba(180, 150, 100, 0.2);
    background-image:
        linear-gradient(180deg, #fdf6ec 0%, #faf0de 30%, #f7ead2 60%, #f5e4c8 100%),
        repeating-linear-gradient(transparent, transparent 27px, rgba(180, 160, 120, 0.18) 27px, rgba(180, 160, 120, 0.18) 28px);
    background-position-y: 0, 80px;
}
.diary-paper::before {
    content: '';
    position: absolute; left: 40px; top: 0; bottom: 0; width: 1px;
    background: rgba(200, 80, 80, 0.2);
}
.diary-ribbon {
    font-family: ${fontStack};
    font-size: 1.4rem; color: #5a3e2b; letter-spacing: 2px;
    margin-bottom: 20px;
}
.diary-author { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.diary-avatar {
    width: 40px; height: 40px; border-radius: 50%; overflow: hidden;
    border: 2px solid rgba(180, 150, 100, 0.4); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(180, 150, 100, 0.2);
    font-size: 1.2rem;
}
.diary-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.diary-author-name { font-family: ${fontStack}; font-size: 1.15rem; color: #5a3e2b; font-weight: 600; }
.diary-date { font-size: 0.75rem; color: #a08060; margin-top: 2px; font-family: 'Noto Sans SC', sans-serif; }
.diary-absence-badge {
    display: inline-block; margin-top: 4px;
    font-size: 0.7rem; color: #9b7ba0;
    background: rgba(155, 123, 160, 0.12);
    border: 1px solid rgba(155, 123, 160, 0.25);
    border-radius: 20px; padding: 1px 8px;
    font-style: italic; letter-spacing: 0.3px;
    font-family: 'Noto Sans SC', sans-serif;
}
.diary-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(180, 150, 100, 0.4) 20%, rgba(180, 150, 100, 0.4) 80%, transparent);
    margin: 12px 0 20px;
}
.diary-text {
    font-family: ${fontStack};
    font-size: 1.15rem; line-height: 2; color: #3a2a1a;
    white-space: pre-wrap; word-break: break-word;
    min-height: 120px; padding-left: 20px;
}
.diary-signature {
    font-family: ${fontStack};
    text-align: right; color: #8b6e52;
    font-size: 1rem; margin-top: 24px;
    padding-right: 8px; font-style: italic;
}
.export-footer {
    text-align: center; margin-top: 20px;
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 11px; color: rgba(255, 255, 255, 0.25);
}
@media (max-width: 640px) {
    body { align-items: flex-start; padding: 20px 12px; }
    .diary-container::before { display: none; }
    .diary-paper { padding: 24px 20px 20px; }
    .diary-text { font-size: 1.05rem; padding-left: 12px; }
}
</style>
</head>
<body>
<div class="diary-container">
    <div class="diary-paper">
        <div class="diary-ribbon">📔 私密日记</div>
        <div class="diary-author">
            <div class="diary-avatar">${avatarHtml}</div>
            <div>
                <div class="diary-author-name">${escapeHtml(diary.roleName || '')} 的日记</div>
                <div class="diary-date">${escapeHtml(formatDiaryDate(diary.date))}</div>
                ${absenceBadgeHtml}
            </div>
        </div>
        <div class="diary-divider"></div>
        <div class="diary-text">${escapeHtml(diary.content || '')}</div>
        <div class="diary-signature">—— ${escapeHtml(diary.roleName || '')}</div>
    </div>
    <div class="export-footer">导出自 MyAI-RolePlay</div>
</div>
</body>
</html>`;
}

export { downloadHTML };
