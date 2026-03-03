# 聊天文字风格系统 · 完整实现说明
> 读完整份文档再开始写任何代码。参考文件：inner-bubble-styles.html、text-style-love.html

---

## 概览

实现 5 种聊天文字风格，用户在设置里选择后，整个聊天界面的气泡样式、字体、颜色、内心戏气泡全部跟着切换。

| 风格ID | 风格名 | 背景 | 字体 | 气泡形式 |
|--------|--------|------|------|---------|
| `clear` | 清澈·标准 | 深色 #12121a | 无衬线 Noto Sans SC | 圆角气泡 |
| `misty` | 烟雨·无气泡 | 深暖色 #0e0c09 | 衬线 Noto Serif SC | 无气泡，左边线 |
| `day` | 烟雨·日间 | 浅色 #f7f5f1 | 衬线 Noto Serif SC | 圆角气泡 |
| `loveDark` | 甜心·暗粉 | 深色 #130d14 | 无衬线 Noto Sans SC | 圆角气泡 |
| `loveLight` | 甜心·浅粉 | 浅色 #f9f4f6 | 衬线 Noto Serif SC | 圆角气泡 |

---

## 一、文字类型与渲染规则

AI 回复的文本里有四种内容，解析规则如下：

| 内容类型 | 原文标记 | 说明 |
|---------|---------|------|
| 动作 | `*...*` 包裹的内容 | 角色的肢体动作描写 |
| 对话 | `「...」` 或 `"..."` 包裹 | 角色说的话 |
| 心声 | `(...)` 包裹的内容 | 角色内心独白，**单独渲染成内心戏气泡** |
| 普通叙述 | 其余文字 | 正常显示 |

**心声单独成块**，显示在角色名下方、主消息气泡上方，不内嵌在主气泡里。

---

## 二、五种风格的完整视觉规范

---

### 风格一：清澈·标准（`clear`）

**整体基调**：简洁现代，深色背景，颜色区分文字类型，最易读。

**聊天区背景**：`#12121a`

**角色名**：
- 字体：Noto Sans SC，font-weight 300
- 颜色：`rgba(107,159,255,0.45)`
- 字号：10px，letter-spacing 2px

**内心戏气泡**：
- 背景：`rgba(100,130,220,0.07)`
- 边框：`1px solid rgba(100,130,220,0.14)`
- 圆角：10px
- 内边距：9px 13px
- 图标：💭，font-size 12px，opacity 0.55
- 文字：Noto Sans SC，12.5px，font-weight 300，`rgba(140,170,255,0.58)`，斜体
- 气泡底部有向下的小三角，颜色与气泡背景一致，连接主气泡

**主消息气泡（角色）**：
- 背景：`rgba(255,255,255,0.04)`
- 边框：`1px solid rgba(255,255,255,0.07)`
- 圆角：`4px 14px 14px 14px`（左上角小，其余圆）
- 内边距：12px 15px
- 字体：Noto Sans SC，14px，font-weight 300，line-height 1.9
- 动作文字：`rgba(255,255,255,0.32)`，斜体，13px
- 对话文字：`rgba(255,255,255,0.88)`，正常
- 普通文字：`rgba(255,255,255,0.78)`

**用户消息气泡**：
- 背景：`rgba(107,159,255,0.08)`
- 边框：`1px solid rgba(107,159,255,0.18)`
- 圆角：`14px 4px 14px 14px`（右上角小）
- 文字：Noto Sans SC，14px，`rgba(255,255,255,0.65)`

---

### 风格二：烟雨·无气泡（`misty`）

**整体基调**：文学感，无气泡框，靠排版和颜色区分，像在读小说。动作和叙述融为一体，对话加「」引号。

**聊天区背景**：`#0e0c09`

**角色名**：
- 字体：Noto Serif SC，font-weight 400
- 颜色：`rgba(200,168,120,0.4)`
- 字号：11px，letter-spacing 3px

**内心戏气泡**：
- 无背景色，无边框
- 左侧竖线：`1.5px solid rgba(200,168,120,0.22)`
- 内边距：8px 0 8px 14px
- 图标：💭，font-size 11px，opacity 0.5
- 文字：Noto Serif SC，12.5px，font-weight 300，`rgba(200,168,120,0.42)`，斜体，letter-spacing 0.8px
- **无小三角**（因为本身无气泡形态）

**主消息（无气泡）**：
- 无背景，无边框
- 底部细线：`1px solid rgba(200,168,120,0.07)`，作为段落分隔
- 内边距：4px 0 14px 0
- 字体：Noto Serif SC，14.5px，font-weight 400，line-height 2.15，letter-spacing 0.8px
- 动作文字：`rgba(200,168,120,0.42)`，正常（不斜体）
- 对话文字：`rgba(248,232,208,0.88)`，自动加「」引号（CSS ::before/::after）
- 普通文字：`rgba(235,215,185,0.72)`

**用户消息（无气泡）**：
- 右对齐
- 右侧竖线：`1px solid rgba(200,168,120,0.1)`
- 底部细线：`1px solid rgba(200,168,120,0.05)`
- 文字：Noto Serif SC，14px，`rgba(230,210,180,0.5)`，斜体

---

### 风格三：烟雨·日间（`day`）

**整体基调**：浅色背景，衬线字体，白天使用，护眼温润。

**聊天区背景**：`#f7f5f1`

**角色名**：
- 字体：Noto Serif SC
- 颜色：`rgba(139,115,85,0.5)`
- 字号：11px，letter-spacing 2px

**内心戏气泡**：
- 背景：`rgba(139,115,85,0.05)`
- 边框：`1px solid rgba(139,115,85,0.13)`
- 圆角：8px
- 内边距：9px 13px
- 图标：💭，font-size 11px，opacity 0.45
- 文字：Noto Serif SC，12.5px，font-weight 300，`rgba(100,80,50,0.48)`，斜体
- 气泡底部有向下小三角，颜色与背景一致

**主消息气泡（角色）**：
- 背景：`#ffffff`
- 边框：`1px solid rgba(0,0,0,0.07)`
- 圆角：`4px 14px 14px 14px`
- 内边距：12px 15px
- box-shadow：`0 1px 6px rgba(0,0,0,0.04)`
- 字体：Noto Serif SC，14px，font-weight 400，line-height 2
- 动作文字：`rgba(139,115,85,0.42)`，斜体，13px
- 对话文字：`rgba(40,30,20,0.85)`
- 普通文字：`rgba(60,45,30,0.75)`

**用户消息气泡**：
- 背景：`rgba(139,115,85,0.07)`
- 边框：`1px solid rgba(139,115,85,0.14)`
- 圆角：`14px 4px 14px 14px`
- 文字：Noto Serif SC，14px，`rgba(60,45,30,0.58)`

---

### 风格四：甜心·暗粉（`loveDark`）

**整体基调**：深色背景，粉色调，有飘动的小心形背景装饰，内心戏用🌸图标。

**聊天区背景**：`#130d14`，背景有径向渐变粉色光晕 `radial-gradient(ellipse at 20% 20%, rgba(255,100,160,0.04) ...)`

**飘动心形背景**：
- 用 JS 在聊天区域动态生成 14 个飘动元素
- 内容随机取自：`♡ ♥ 🌸 ✿ ·`
- 颜色：`rgba(255,110,160,0.25)`
- 从底部飘到顶部，透明度淡入淡出
- animation duration 随机 4-9s，有随机 delay

**角色名**：
- 字体：Noto Sans SC，font-weight 300
- 颜色：`rgba(255,110,160,0.4)`
- 字号：10px，letter-spacing 2px

**内心戏气泡**：
- 背景：`rgba(255,110,160,0.06)`
- 边框：`1px solid rgba(255,110,160,0.13)`
- 圆角：10px
- 内边距：9px 13px
- 图标：🌸（不是💭），font-size 12px，opacity 0.55
- 文字：Noto Sans SC，12.5px，font-weight 300，`rgba(255,160,200,0.52)`，斜体
- 气泡底部有向下小三角，连接主气泡

**主消息气泡（角色）**：
- 背景：`rgba(255,110,160,0.07)`
- 边框：`1px solid rgba(255,110,160,0.13)`
- 圆角：`4px 16px 16px 16px`
- 内边距：13px 16px
- 气泡内右下角有淡粉色模糊光晕（`::after` 伪元素，60px圆，blur 10px）
- 字体：Noto Sans SC，14px，font-weight 300，line-height 1.95
- 动作文字：`rgba(255,140,180,0.4)`，斜体，13px
- 对话文字：`rgba(255,235,245,0.92)`
- 普通文字：`rgba(255,230,240,0.8)`

**用户消息气泡**：
- 背景：`rgba(255,255,255,0.04)`
- 边框：`1px solid rgba(255,255,255,0.08)`
- 圆角：`16px 4px 16px 16px`
- 文字：Noto Sans SC，14px，`rgba(255,255,255,0.55)`

---

### 风格五：甜心·浅粉（`loveLight`）

**整体基调**：浅色背景，衬线字体，粉色调，白天使用，甜而不腻。

**聊天区背景**：`#f9f4f6`

**角色名**：
- 字体：Noto Serif SC
- 颜色：`rgba(232,105,154,0.45)`
- 字号：11px，letter-spacing 2px

**内心戏气泡**：
- 背景：`rgba(255,110,160,0.05)`
- 边框：`1px solid rgba(255,110,160,0.12)`
- 圆角：10px
- 内边距：9px 13px
- 图标：🌸，opacity 0.55
- 文字：Noto Serif SC，12.5px，font-weight 300，`rgba(220,100,150,0.48)`，斜体
- 气泡底部有向下小三角

**主消息气泡（角色）**：
- 背景：`#ffffff`
- 边框：`1px solid rgba(255,110,160,0.12)`
- 圆角：`4px 16px 16px 16px`
- box-shadow：`0 2px 10px rgba(255,110,160,0.06)`
- 字体：Noto Serif SC，14px，font-weight 400，line-height 2
- 动作文字：`rgba(220,120,160,0.4)`，斜体，13px
- 对话文字：`rgba(60,30,45,0.88)`
- 普通文字：`rgba(80,40,60,0.75)`

**用户消息气泡**：
- 背景：`rgba(255,110,160,0.07)`
- 边框：`1px solid rgba(255,110,160,0.13)`
- 圆角：`16px 4px 16px 16px`
- 文字：Noto Serif SC，14px，`rgba(80,40,60,0.58)`

---

## 三、内心戏气泡小三角实现

气泡底部中间的小三角用 CSS 伪元素实现：

```css
.inner-bubble::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 18px;
  width: 8px;
  height: 6px;
  background: /* 与气泡背景色相同 */;
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  border-left: 1px solid /* 与气泡边框色相同 */;
  border-right: 1px solid /* 与气泡边框色相同 */;
}
```

烟雨·无气泡风格**没有**这个小三角。

---

## 四、文字解析逻辑

在渲染 AI 回复时，对文本做以下处理：

```javascript
function parseMessage(text) {
  // 1. 提取心声 (...)，单独存为 innerThought 字段
  const innerMatch = text.match(/\(([^)]+)\)/g)
  const innerThought = innerMatch
    ? innerMatch.map(s => s.slice(1,-1)).join(' ')
    : null

  // 2. 剩余文本里标记动作 *...*
  // 3. 标记对话 「...」或 "..."
  // 4. 其余为普通文字

  return { innerThought, formattedText }
}
```

渲染顺序：角色名 → 内心戏气泡（如有）→ 主消息气泡

---

## 五、风格切换实现

风格存在全局状态里（`useAppState.js`），切换时：
- 更新 `currentTextStyle` 字段
- 聊天区域根据 `currentTextStyle` 动态添加对应的 CSS class
- 历史消息也跟着重新渲染（因为是 class 控制，不存在重新生成问题）

```javascript
// 每条消息的容器
<div :class="`msg-container style-${currentTextStyle}`">
```

---

## 六、设置页展示方式

不用下拉框，用**卡片选择器**：
- 5 张小预览卡并排显示
- 每张卡展示该风格的一句示例对话（动作+对话各一句）
- 点击选中，当前聊天界面实时变化
- 选中状态有描边高亮

---

## 七、不能做的事

- 不能用 Inter、Roboto、Arial 等通用字体，必须用文档里指定的字体
- 不能把五种风格的 CSS 合并共享，每种风格完全独立
- 不能省略内心戏气泡的小三角细节（烟雨·无气泡除外）
- 不能省略甜心系的飘动心形背景
- 不能省略气泡右下角的粉色光晕（甜心·暗粉专属）
- 切换风格时不能有明显的闪烁，用 transition 过渡
