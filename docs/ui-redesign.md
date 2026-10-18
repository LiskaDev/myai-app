# UI 重设计说明（陶土 · 墨黑）

> 本文件描述 2026-10 这次界面重设计后的视觉规范。
> `DESIGN_SPEC.md` 中的旧色板（优莅米色 / 深紫）已不再使用，仅保留变量名兼容。

---

## 1. 设计原则

1. **层级靠明度与阴影，不靠堆叠边框。** 不再「卡片套卡片」，需要分段就用 1px hairline。
2. **全站只有一个强调色。** 陶土色只出现在需要被注意的位置（主按钮、选中态、链接）。
3. **衬线标题 + 无衬线正文。** 角色名、面板标题用 `--font-serif-sc`，正文与控件用 `--font-sans-sc`。
4. **正文对比度 ≥ 12:1。** 浅色 `#171614` on `#F3F0EB`，深色 `#F4F1EC` on `#0C0C0F`。
5. **图标统一线性。** 导航类图标一律用 `IconLine.vue`，不再用 emoji 当图标。

---

## 2. 主题变量

定义在 `src/styles/theme-tokens.css`，通过 `html[data-theme="light"|"dark"]` 切换。

### 日间（纸白 · 陶土）

| 变量 | 值 | 用途 |
|---|---|---|
| `--paper` | `#f3f0eb` | 页面/聊天区背景 |
| `--paper-warm` | `#eae5de` | 侧栏、输入框底色 |
| `--paper-card` | `#ffffff` | 卡片、气泡、弹窗 |
| `--ink` | `#171614` | 主文字 |
| `--ink-light` | `#3a3733` | 次要文字 |
| `--ink-faint` | `#6d665e` | 弱化文字、占位符 |
| `--accent` | `#bf5b3b` | 强调色 |
| `--accent-strong` | `#a14a2e` | 强调色深阶（hover/文字） |
| `--accent-soft` | `rgba(191,91,59,.10)` | 强调色浅底 |
| `--border` | `rgba(23,22,20,.085)` | 通用分隔线 |
| `--online` | `#3fa86b` | 在线状态点 |

### 夜间（墨黑 · 暖陶）

| 变量 | 值 |
|---|---|
| `--paper` | `#0c0c0f` |
| `--paper-warm` | `#121216` |
| `--paper-card` | `#16161b` |
| `--ink` | `#f4f1ec` |
| `--ink-light` | `#cfc9c1` |
| `--ink-faint` | `#948d84` |
| `--accent` | `#e28462` |
| `--accent-strong` | `#f0a184` |

> 深色模式不是简单反色：强调色提亮、阴影加重、用户气泡反转为浅底深字。

### 光晕与环境光

`--glow-1` / `--glow-2` 用于头像光环与背景氛围，配合 `--glow-opacity` 控制强度。
背景层见 `style.css` 的 `.fullscreen-bg::before`。

---

## 3. 组件约定

### 气泡

| 类 | 说明 |
|---|---|
| `.speech-bubble` | AI 气泡，白色卡片，**左下角** 5px 尖角 |
| `.user-speech-bubble` | 用户气泡，深墨底，**右下角** 5px 尖角 |
| `.typing-bubble` | 打字指示器，与 AI 气泡同形 |

### 圆形头像

`--paper-card` 描边 + `0 2px 8px -2px var(--shadow-lg)` 投影，不再用金色/紫色描边。

### 设置弹窗

- 顶部：横向胶囊 tab（`.modal-tabs`）
- 左侧：分组导航（`.modal-sidebar`，白卡选中态 + 强调色图标）
- 右侧：`.modal-content`，内容列最大宽度 640–660px 并居中
- 表单：`.bs-input` / `.bs-textarea`，`--paper-warm` 底、聚焦时变白 + 3px 光环
- 字段之间只用 `border-top: 1px solid var(--border)` 分隔，**不要给 `.basic-field` 加背景色** ——
  整行上底色后左右没有圆角，视觉上会像被裁掉一条。(`style.css` 里旧版浅色兼容块已限定在 `[data-ui-style="classic"]`)

### 图标

`src/components/IconLine.vue`：把界面里沿用的 emoji 映射为 24×24 线性图标。

```vue
<IconLine emoji="📖" :size="15" />
```

新增图标时在 `ICONS` 里加一条 emoji → path 数组的映射即可，未知 emoji 会退化为一个「+」占位。

---

## 4. 界面风格切换（新版 / 原版）

设置路径：**设置 → 通用 → 显示与交互 → 界面风格**

用户可在两套界面之间随时切换，用来兜底新版的兼容性问题。

| 值 | 名称 | 说明 |
|---|---|---|
| `modern` | 新版（默认） | 纸白 · 陶土，线性图标，本文档描述的样式 |
| `classic` | 原版 | 重设计之前的界面：暖纸 / 深紫，Emoji 图标，圆头像，直角气泡尖角 |

### 实现方式

- 切换值保存在 `globalSettings.uiStyle`，跟随角色数据一起持久化。
- 运行时写到 `<html data-ui-style="modern|classic">`，并镜像一份到
  `localStorage.myai_ui_style`，保证首帧就是正确风格、不闪屏。
- 原版样式全部集中在 `src/styles/classic-theme.css`，规则统一以
  `html[data-ui-style="classic"]` 前缀提高特异性，覆盖组件 scoped 样式。
- 图标组件 `IconLine` 在原版模式下直接渲染原始 emoji，因此选项卡、
  侧栏、菜单会自动回到旧观感。

### 新增界面时

如果新写的组件在「原版」下需要不同表现，把覆盖规则加到
`classic-theme.css`，不要改动组件自身的现代样式。

---

## 4.1 样式分层与维护约定

`style.css` 里有三类规则，改动前先确认归属：

| 层级 | 位置 | 说明 |
|---|---|---|
| 主题 token | `styles/theme-tokens.css` | 颜色的唯一来源，按 `html[data-theme]` 切换 |
| 全局基础/工具 | `style.css` 上半部分 | 重置、滚动条、动画、Markdown 等 |
| 浅色兼容层 | `style.css` 末段 `[data-theme="light"]` | 修正组件里写死的深色 Tailwind 工具类 |
| 原版风格 | `styles/classic-theme.css` | 按 `html[data-ui-style="classic"]` 覆盖 |

**清理历史**（2026-10）：删除了已无任何引用的死规则 ——
`.settings-panel`（含移动端规则）、`.sidebar-panel`、`.story-export-modal`、
`.card-library-*`、`.token-pressure-bar`、`.glass-strong`、`.bg-glass-user`，
以及 `text-gray-50 / text-gray-700 / border-white/12 / hover:bg-white/10 /
bg-white/4 / bg-purple-400\/20` 等选择器。

同时修掉了几处级联打架：

- `.avatar` 在 `style.css` 写 44px、在 `ChatWindow.vue` 写 38px，统一为 **38px**
- `.speech-bubble` 内边距被旧规则 `18px 22px` 覆盖，恢复为 token 里的 **13px 16px**
- `.message-bubble` 的 `margin-bottom` 有两处 `!important` + 一处普通声明，合并为单一来源（桌面 20px / 移动端 16px）
- 移动端 `.speech-bubble` 的 padding 声明了两遍，只保留一处

> 经验：新版组件已经用 token 的元素，**不要再往 `style.css` 加 `!important` 覆盖**。
> 之前 `.basic-field` 被强制上底色，导致整行看起来像被裁掉，就是这个原因。

## 5. 移动端适配

断点统一用 `640px`（窄屏）与 `900px`（桌面宽屏收栏）。

### 布局

| 区域 | ≤640px | 说明 |
|---|---|---|
| 首页角色网格 | 2 列，卡片 18px 圆角、64px 头像 | 极窄（≤360px）再缩一档 |
| 聊天区 | 内边距 `16px 14px 10px`，AI 气泡 88% 宽 | 由 `style.css` 的移动端块统一覆盖 |
| 气泡圆角 | 保持 `16px ... 5px` 的说话人尖角 | 不再退回旧的「左上/右上直角」 |
| 设置弹窗 | 全屏 `92dvh` 底部表，顶部 Tab 横向滚动 + 右缘渐隐 | 二级导航变成横向胶囊条 |
| 角色侧栏 | `85vw`，最大 320px，底部按钮贴合安全区 | |
| 星标菜单 | 底部面板，行间只用 hairline | |

### 触控与安全区

- 所有输入框在移动端字号提到 `16px`，避免 iOS 聚焦自动放大。
- 顶部/底部/侧栏/底部面板都留了 `env(safe-area-inset-*)`。
- 点击热区 ≥ 34px（导航项、关闭按钮 38px）。
- 工具栏按钮、发送按钮在移动端放大到 44px。

### 宽屏

≥900px 时消息列收进 `800px` 并居中，避免长行横穿屏幕；`--read-column-max` 等排版变量仍可单独覆盖。

## 6. 新增界面时怎么做

1. 先查上表挑 token，**不要写死颜色值**。
2. 需要强调才用 `--accent`；普通交互用 `--brush` / `--border-strong`。
3. 分段优先用 hairline，而不是再加一层卡片。
4. 标题用 `var(--font-serif-sc)`，正文继承 `body`。
5. 导航图标用 `IconLine`，内容里的 emoji 可以作为语气保留。
