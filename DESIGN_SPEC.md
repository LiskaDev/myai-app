# MyAI RolePlay — 视觉设计规范
> 基于 chat_final.html 像素级提取。所有组件必须严格遵循此文档，不得使用写死颜色，所有颜色必须走 CSS 变量。

---

## 一、CSS 变量体系

所有颜色、背景、阴影必须使用以下变量，在 `html[data-theme]` 上切换。

### 日间主题（`data-theme="light"`，优莅风格）
```css
--ink: #1a1410;               /* 主文字色 */
--ink-light: #3d3530;         /* 次要文字 */
--ink-faint: #6b5e54;         /* 弱化文字、占位符、旁白 */
--paper: #f5f0e8;             /* 页面/聊天区背景 */
--paper-warm: #ede6d6;        /* 顶栏/底栏背景 */
--paper-card: #faf7f2;        /* 卡片/气泡/输入框背景 */
--accent: #8b6f5e;            /* 强调色（角色名、状态、链接）*/
--accent-gold: #c4963a;       /* 金色（时间戳、主动标签、星星）*/
--brush: rgba(139,111,94,0.15); /* 轻量hover/选中背景 */
--shadow: rgba(26,20,16,0.12);  /* 普通阴影 */
--shadow-lg: rgba(26,20,16,0.18); /* 较重阴影 */
--user-bubble-bg: #1a1410;    /* 用户气泡背景（深色） */
--user-bubble-text: #f5f0e8;  /* 用户气泡文字（浅色） */
--ai-bubble-bg: #faf7f2;      /* AI气泡背景 */
--ai-bubble-border: rgba(139,111,94,0.12); /* AI气泡边框 */
--thought-bg: rgba(139,111,94,0.08);       /* 内心戏背景 */
--thought-border: rgba(196,150,58,0.5);    /* 内心戏左竖线 */
--border: rgba(139,111,94,0.2);            /* 通用边框 */
--topbar-bg: rgba(237,230,214,0.97);       /* 顶栏/底栏背景 */
--overlay-bg: rgba(26,20,16,0.45);         /* 遮罩层背景 */
--dot-color: #8b6f5e;                      /* 打字指示点颜色 */
--sidebar-bg: rgba(237,230,214,0.97);      /* 侧边栏背景 */
```

### 夜间主题（`data-theme="dark"`，林小夏风格）
```css
--ink: #e8e6f0;
--ink-light: #9490a8;
--ink-faint: #5a5670;
--paper: #0d0e14;
--paper-warm: #13151f;
--paper-card: #1a1d2e;
--accent: #8b78ff;
--accent-gold: #d4a843;
--brush: rgba(139,120,255,0.1);
--shadow: rgba(0,0,0,0.35);
--shadow-lg: rgba(0,0,0,0.5);
--user-bubble-bg: #2a2350;
--user-bubble-text: #d4d0f0;
--ai-bubble-bg: #1a1d2e;
--ai-bubble-border: rgba(255,255,255,0.07);
--thought-bg: rgba(139,120,255,0.07);
--thought-border: rgba(139,120,255,0.25);
--border: rgba(255,255,255,0.07);
--topbar-bg: rgba(19,21,31,0.97);
--overlay-bg: rgba(0,0,0,0.6);
--dot-color: #5a5670;
--sidebar-bg: rgba(19,21,31,0.97);
```

---

## 二、字体

```css
/* 必须在全局引入 */
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;700&family=Noto+Sans+SC:wght@300;400&display=swap');

--font-serif: 'Noto Serif SC', serif;   /* 正文、气泡、标题 */
--font-sans:  'Noto Sans SC', sans-serif; /* UI标签、角色名、时间戳、按钮 */
```

**规则：**
- 聊天气泡正文（`.bubble-ai`）：`font-family: 'Noto Serif SC'`
- 用户气泡（`.bubble-user`）：`font-family: 'Noto Serif SC'`（继承body即可）
- 所有 UI 文字（角色名、时间戳、按钮文字、标签）：`font-family: 'Noto Sans SC'`
- 内心戏文字：`font-family: 'Noto Sans SC'`，`font-style: italic`

---

## 三、顶栏（Topbar）

```
高度: 58px
背景: var(--topbar-bg)
下边框: 1px solid var(--border)
阴影: 0 1px 8px var(--shadow)
padding: 0 12px
布局: flex, align-items: center, gap: 8px
```

### 左侧（topbar-left）
```
布局: flex, align-items: center, gap: 8px, flex: 1
```

**汉堡按钮（icon-btn）**
```
尺寸: 36×36px, border-radius: 10px
背景: transparent（hover时 var(--brush)）
颜色: var(--ink-faint)
SVG: 18×18px
```

**角色头像（char-avatar）**
```
尺寸: 34×34px, border-radius: 50%
日间背景: linear-gradient(135deg, #c4b8ae, #9e8478)
夜间背景: linear-gradient(135deg, #a090e0, #6040c0)
日间边框: 1.5px solid rgba(196,150,58,0.4)
夜间边框: 1.5px solid rgba(139,120,255,0.35)
夜间光晕: box-shadow: 0 0 8px rgba(139,120,255,0.25)
```

**角色名（char-name）**
```
font-family: 'Noto Serif SC'
font-size: 15px, font-weight: 500, line-height: 1.2
color: var(--ink)
```

**在线状态（char-status）**
```
font-family: 'Noto Sans SC'
font-size: 10px, color: var(--accent)
display: flex, align-items: center, gap: 3px
前缀绿点: width:5px, height:5px, border-radius:50%, background:#7aad6e
```

### 右侧（topbar-right）
```
布局: flex, align-items: center, gap: 4px
```

**日夜切换按钮（theme-btn）**
```
尺寸: 36×36px, border-radius: 10px
背景: rgba(196,150,58,0.1)
边框: 1px solid rgba(196,150,58,0.25)
颜色: var(--accent-gold)
font-size: 16px（emoji）
```

**星星按钮（star-btn，即功能菜单）**
```
尺寸: 36×36px（同 icon-btn）
颜色: var(--accent-gold)
```

---

## 四、聊天区（Chat Scroll）

```
背景: var(--paper)
padding: 20px 16px 12px
gap（消息间距）: 18px
overflow-y: auto
scrollbar宽度: 3px，颜色: var(--border)
```

### 日期分隔线（date-divider）
```
font-family: 'Noto Sans SC'
font-size: 11px, color: var(--ink-faint)
display: flex, align-items: center, gap: 10px
两侧线: flex:1, height:1px
        background: linear-gradient(to right, transparent, var(--border), transparent)
```

---

## 五、消息结构

### 用户消息行（msg-user）
```
display: flex
justify-content: flex-end   ← 靠右
```

**用户气泡（bubble-user）**
```
max-width: 68%
background: var(--user-bubble-bg)
color: var(--user-bubble-text)
border-radius: 18px 4px 18px 18px   ← 右上角直角
padding: 11px 15px
font-size: 15px, line-height: 1.65
font-family: 'Noto Serif SC'
box-shadow: 0 2px 10px var(--shadow-lg)
word-break: break-word
```

### AI消息行（msg-ai）
```
display: flex
gap: 10px
align-items: flex-start   ← 头像顶部对齐
```

**AI头像（ai-avatar）**
```
尺寸: 38×38px, border-radius: 50%
日间背景: linear-gradient(135deg, #c4b8ae, #9e8478)
日间边框: 1.5px solid rgba(196,150,58,0.35)
夜间背景: linear-gradient(135deg, #a090e0, #6040c0)
夜间边框: 1.5px solid rgba(139,120,255,0.3)
夜间光晕: box-shadow: 0 0 8px rgba(139,120,255,0.2)
margin-top: 2px（让头像与内容顶部稍微错开）
```

**AI内容区（ai-content）**
```
flex: 1, min-width: 0
max-width: 80%（限制气泡最大宽度）
```

**角色名标签（ai-name）**
```
font-family: 'Noto Sans SC'
font-size: 11px, font-weight: 500
color: var(--accent)
margin-bottom: 5px, padding-left: 2px
```

**内心戏（bubble-thought）**
```
background: var(--thought-bg)
border-left: 2px solid var(--thought-border)   ← 左竖线，无其他边框
border-radius: 0 10px 10px 0
padding: 8px 12px
margin-bottom: 6px
font-family: 'Noto Sans SC'
font-size: 13px, font-style: italic, line-height: 1.6
color: var(--ink-faint)
display: flex, gap: 7px, align-items: flex-start

  💭图标（thought-icon）:
    font-size: 12px, flex-shrink: 0, opacity: 0.7, margin-top: 1px
```

**AI主气泡（bubble-ai）**
```
background: var(--ai-bubble-bg)
border: 1px solid var(--ai-bubble-border)
border-radius: 4px 16px 16px 16px   ← 左上角直角，其余圆角
padding: 14px 16px
font-family: 'Noto Serif SC'
font-size: 15px, line-height: 1.85
box-shadow: 0 1px 6px var(--shadow)
word-break: break-word
```

**气泡内：旁白文字（.action，即动作描写）**
```
display: block
font-size: 13px
color: var(--ink-faint)
font-style: italic
margin: 4px 0, line-height: 1.7
```

**气泡内：对话文字（.dialogue）**
```
display: block
color: var(--ink)
margin: 4px 0
font-style: normal（非斜体）
```

**时间戳（msg-time）**
```
font-family: 'Noto Sans SC'
font-size: 10px
color: var(--ink-faint)
text-align: right
margin-top: 5px
opacity: 0.6
```

**主动标签（proactive-tag）**
```
display: inline-flex, align-items: center, gap: 4px
background: rgba(212,168,67,0.12)
border: 1px solid rgba(212,168,67,0.3)
border-radius: 20px, padding: 2px 10px
font-family: 'Noto Sans SC'
font-size: 11px, font-weight: 500
color: var(--accent-gold)
margin-bottom: 6px
```

---

## 六、打字指示（Typing Indicator）

```
行布局: display: flex, gap: 10px（头像 + 内容，同 AI 消息行）

气泡（typing-indicator）:
  display: flex, align-items: center, gap: 4px
  padding: 10px 14px
  background: var(--ai-bubble-bg)
  border: 1px solid var(--ai-bubble-border)
  border-radius: 4px 16px 16px 16px   ← 与AI气泡一致
  box-shadow: 0 1px 6px var(--shadow)

圆点（typing-dot）:
  width: 6px, height: 6px, border-radius: 50%
  background: var(--dot-color)
  animation: typingBounce 1.2s infinite
  nth-child(2): animation-delay: 0.2s
  nth-child(3): animation-delay: 0.4s

@keyframes typingBounce:
  0%,60%,100% { transform: translateY(0); opacity: 0.4; }
  30%         { transform: translateY(-5px); opacity: 1; }
```

---

## 七、底栏（Bottombar）

```
background: var(--topbar-bg)   ← 与顶栏同色
border-top: 1px solid var(--border)
padding: 10px 12px 14px
display: flex, align-items: flex-end, gap: 8px
box-shadow: 0 -2px 12px var(--shadow)
```

**输入框容器（input-wrap）**
```
flex: 1
background: var(--paper-card)
border-radius: 22px
border: 1px solid var(--border)
padding: 10px 14px
min-height: 44px, max-height: 120px
:focus-within → border-color: var(--accent); box-shadow: 0 0 0 3px var(--brush)
```

**输入框文字（chat-input / textarea）**
```
font-family: 'Noto Serif SC'
font-size: 15px
color: var(--ink)
background: transparent
placeholder颜色: var(--ink-faint), opacity: 0.5
```

**发送按钮（send-btn）**
```
尺寸: 40×40px, border-radius: 50%
日间: background: var(--ink); color: var(--paper)
夜间: background: var(--accent); color: white
box-shadow日间: 0 2px 8px var(--shadow-lg)
box-shadow夜间: 0 2px 8px rgba(139,120,255,0.3)
:active → transform: scale(0.9)
SVG: 16×16px, margin-left: 1px
```

**停止按钮（stop-btn）**
```
同 send-btn 尺寸
background: #c07070（固定颜色）
box-shadow: 0 2px 8px rgba(192,112,112,0.3)
```

---

## 八、侧边栏（RoleSidebar）

```
width: 300px
background: var(--sidebar-bg)
border-right: 1px solid var(--border)
box-shadow: 2px 0 16px var(--shadow)
```

**搜索框**
```
border-radius: 22px（胶囊形）
border: 1px solid var(--border)
background: var(--paper-card)
font-family: 'Noto Sans SC', font-size: 13px
:focus → border-color: var(--accent); box-shadow: 0 0 0 3px var(--brush)
```

**角色卡片（role-item）**
```
border-radius: 12px
padding: 10px 12px
:hover → background: var(--brush)
.active → background: var(--brush); border-left: 3px solid var(--accent)
```

**角色头像（role-ava）**
```
尺寸: 40×40px, border-radius: 50%
日间背景: linear-gradient(135deg, #b8a89a, #8b6f5e)
夜间背景: linear-gradient(135deg, #a090e0, #6040c0)
```

**情绪角标（mood-dot）**
```
position: absolute, bottom: -2px, right: -2px
font-size: 11px
background: var(--paper-card)
border: 1px solid var(--border)
border-radius: 50%, padding: 1px
```

**角色名（role-name）**
```
font-family: 'Noto Sans SC'
font-size: 14px, font-weight: 500
color: var(--ink)
```

**最后一句预览（role-preview）**
```
font-family: 'Noto Sans SC'
font-size: 12px, font-style: italic
color: var(--ink-faint)
```

**创建按钮**
```
border: 1.5px dashed var(--border)
border-radius: 12px, padding: 10px
font-family: 'Noto Sans SC', font-size: 13px
color: var(--ink-faint)
:hover → background: var(--brush); border-color: var(--accent)
```

---

## 九、底部面板（星星菜单）

```
background: var(--paper-card)
border-radius: 20px 20px 0 0
border-top: 1px solid var(--border)
padding: 14px 20px 32px
```

**拖把条（panel-handle）**
```
width: 36px, height: 4px
background: var(--border), border-radius: 2px
margin: 0 auto 18px
```

**菜单行（menu-row）**
```
display: flex, align-items: center, gap: 14px
padding: 14px 4px
border-bottom: 1px solid var(--border)
border-radius: 10px
:active → background: var(--brush)

图标区（menu-row-icon）: font-size: 20px, width: 28px, color: var(--ink-faint)
标签（menu-row-label）: font-family: 'Noto Sans SC', font-size: 15px, color: var(--ink), flex: 1
箭头（menu-row-arrow）: color: var(--ink-faint), font-size: 18px

危险行（.danger）: menu-row-label 和 menu-row-icon 颜色改为 #c07070
```

---

## 十、Toast 提示

```
position: fixed, bottom: 88px, left: 50%, transform: translateX(-50%)
background: var(--ink); color: var(--paper)
font-family: 'Noto Sans SC', font-size: 13px
padding: 8px 18px, border-radius: 20px
box-shadow: 0 4px 12px var(--shadow-lg)
白色无边框，不用半透明玻璃

.toast-error → background: #c07070; color: white
```

---

## 十一、通用弹窗（Modal）

```
遮罩: background: var(--overlay-bg); backdrop-filter: blur(2px~8px)
卡片: background: var(--paper-card); border: 1px solid var(--border)
      border-radius: 16px~20px; box-shadow: 0 8px 32px var(--shadow-lg)

按钮-取消: background: var(--brush); color: var(--ink-faint)
按钮-确认: background: var(--accent); color: white
按钮-危险: background: #c07070; color: white
```

---

## 十二、给 AI 的执行指令模板

每次修改一个组件，给 Cursor/Claude Code 用以下模板：

```
参考 DESIGN_SPEC.md，对 [组件名].vue 进行样式改造。

要求：
1. 所有颜色必须使用 CSS 变量（见规范第一节），禁止写死任何颜色值
2. 字体严格按照规范第二节，气泡用 Noto Serif SC，UI标签用 Noto Sans SC
3. 每个元素的尺寸、padding、border-radius、box-shadow 严格按照规范对应章节
4. 不改任何 JS 逻辑、props、emits、computed
5. 改完后逐条对照规范自检，列出每个修改点

重点检查：
- [ ] 用户气泡：border-radius 是否为 18px 4px 18px 18px
- [ ] AI气泡：border-radius 是否为 4px 16px 16px 16px
- [ ] 内心戏：是否只有左竖线（border-left），无其他边框，无背景色渐变
- [ ] 旁白文字：是否为斜体+var(--ink-faint)
- [ ] 对话文字：是否为正体+var(--ink)
- [ ] 打字点：是否走 var(--dot-color)
- [ ] 发送按钮：日间是否用 var(--ink) 而非蓝紫色
- [ ] 所有 glass/bg-glass-*/border-white/* 是否已全部清除
```

---

## 十三、常见错误清单（禁止出现）

| 错误写法 | 正确写法 |
|---|---|
| `class="glass bg-glass-dark"` | `style="background: var(--paper-card)"` 或对应 CSS class |
| `border-white/10` | `border: 1px solid var(--border)` |
| `text-gray-300` | `color: var(--ink-faint)` |
| `text-gray-100` | `color: var(--ink)` |
| `bg-indigo-500` | `background: var(--accent)` |
| `from-primary to-secondary` | `background: var(--accent)` |
| `backdrop-filter: blur()` 用于气泡 | 气泡不用毛玻璃，直接纯色背景 |
| `font-family: Inter` | `font-family: 'Noto Sans SC'` 或 `'Noto Serif SC'` |
| `border-radius: 20px` 用于AI气泡 | `border-radius: 4px 16px 16px 16px` |
| `border-radius: 20px` 用于用户气泡 | `border-radius: 18px 4px 18px 18px` |
