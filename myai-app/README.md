# 🎭 MyAI-RolePlay v5.1

> AI 角色扮演沉浸式体验 — 纯前端 SPA，直连 DeepSeek API

**在线体验：** [https://myai-app-eight.vercel.app](https://myai-app-eight.vercel.app)

## ✨ 功能特性

### 🎭 角色系统
- **自定义角色** — 名称、性格、System Prompt、语气风格全自定义
- **角色深度字段** — 世界观设定、外貌、说话风格、关系、秘密
- **头像选择** — 点击拍照/从相册选择，或粘贴 URL
- **对话规则 / 禁区** — 设定角色不能聊的话题
- **剧情摘要** — 手动 + 自动摘要，AI 始终记住重要剧情
- **预设角色** — 内置角色模板，开箱即用

### 💬 单聊模式
- **流式响应** — DeepSeek V3/R1 实时流式输出
- **双层响应解析** — 自动提取 `<think>` 推理 + `<inner>` 内心戏
- **输出长度控制** — Auto / 简短 / 标准 / 沉浸小说 四档
- **消息管理** — 删除、重新生成、记忆固定
- **对话分支 (Fork)** — 在任意消息处分叉，探索不同剧情走向
- **自动摘要** — 20 条触发，保留最近 10 条 + 摘要上下文
- **TTS 语音朗读** — 支持自动朗读和声线选择

### 👥 群聊模式
- **多角色群聊** — 2-8 个 AI 角色同时对话
- **导演模式** — 用户作为导演引导话题
- **🎬 AI 盲盒事件** — 一键生成 AI 世界事件，无需手动输入
- **影子导演** — AI 自动检测剧情卡壳并注入情境事件
- **悄悄话** — 私聊某个角色，目标角色立即回应
- **PASS 机制** — 无关角色自动跳过，对话更自然
- **⚡ 命令菜单** — 向上弹出的 Popover，收纳事件/悄悄话/指定角色发言
- **▶️ 继续按钮** — 紫色渐变发光 FAB，一键继续一轮
- **剧本基调** — 搞笑日常 / 校园恋爱 / 悬疑推理等风格约束
- **回复长度控制** — 简短(~250字) / 适中(~500字) / 较长(~1000字) / 长文(~2000字)

### 🎨 视觉体验
- **Glassmorphism UI** — 毛玻璃质感暗色主题
- **RP 文字风格** — Simple / 月光夜曲 / 梦幻浪漫 / 清透水晶 / 自定义
- **Tab 分页设置** — 角色/记忆/通用/数据 四栏切换，告别拥挤
- **消息工具栏溢出菜单** — 主操作 2 个 + "···" 更多菜单
- **呼吸气泡边框** — 仅最新消息高亮发光，旧消息低调退场
- **消息入场动画** — 新消息从下方滑入 + 淡入
- **Token 压力条** — 标题栏下方 3px 彩色条，实时显示记忆窗口用量
- **沉浸模式** — 隐藏所有标记，纯粹阅读体验
- **移动端适配** — 响应式布局，44px+ 触控热区，FAB 不遮挡内容

### 🔊 音效系统
- **UI 交互音效** — 发送消息、AI 回复完成、世界事件等 5 种音效
- **每角色提示音** — 群聊中每个 AI 说完话都有独立提示音
- **音量控制** — 默认静音，设置中可开启 + 音量滑条(5%-50%)
- **浏览器兼容** — 自动处理 Chrome/Safari 首次交互解锁

### 🛡️ 安全与稳定
- **发送锁** — 防止快速点击重复发送
- **竞态保护** — 角色切换时中止旧请求
- **超时保护** — 30 秒自动超时
- **输入验证** — XSS 防护、原型污染检测、URL 安全校验
- **localStorage 持久化** — 所有数据本地存储，刷新不丢失

## 🛠️ 技术栈

- **前端框架：** Vue 3 (Composition API + `<script setup>`)
- **构建工具：** Vite 7
- **样式：** 原生 CSS + Glassmorphism
- **测试：** Vitest + jsdom (88 个测试用例)
- **部署：** Vercel
- **AI 模型：** DeepSeek V3 / R1（兼容 OpenAI 格式 API）

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/LiskaDev/myai-app.git
cd myai-app

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npx vitest run

# 构建生产版本
npx vite build
```

## 📦 部署到 Vercel

```bash
cd myai-app && npx vite build && cd .. && npx vercel --prod --yes
```

> ⚠️ 从仓库根目录 (`MyAI_RolePlay/`) 运行，Vercel Root Directory 设置为 `myai-app`

## 📁 项目结构

```
myai-app/
├── public/sounds/                  # UI 音效资源 (5 个 MP3)
├── src/
│   ├── App.vue                    # 主应用组件
│   ├── style.css                  # 全局样式 + 移动端适配
│   ├── composables/
│   │   ├── useAppState.js         # 应用状态管理
│   │   ├── useChat.js             # 单聊 API 调用 + 流式响应
│   │   ├── useGroupChat.js        # 群聊全部逻辑 + 影子导演
│   │   ├── usePromptBuilder.js    # System Prompt 构建
│   │   ├── useBranch.js           # 对话分支管理
│   │   ├── useSoundEffects.js     # 音效预加载 + 播放控制
│   │   ├── useAutoSummary.js      # 自动摘要
│   │   └── presets.js             # 预设角色模板
│   ├── components/
│   │   ├── ChatWindow.vue         # 单聊界面
│   │   ├── GroupChatWindow.vue    # 群聊界面
│   │   ├── BranchSwitcher.vue     # 对话分支选择器
│   │   ├── EditGroupModal.vue     # 群聊编辑弹窗
│   │   ├── SettingsModal.vue      # 设置弹窗 (Tab 分页)
│   │   └── settings/              # 设置子组件
│   └── utils/
│       ├── storage.js             # localStorage 封装
│       ├── textParser.js          # RP 文本格式化
│       ├── validation.js          # 输入验证 + 安全
│       └── summary.js             # 摘要工具函数
├── tests/                          # 单元测试 (88 cases)
│   ├── textParser.test.js
│   ├── useChat.test.js
│   ├── useGroupChat.test.js
│   ├── useBranch.test.js
│   ├── usePromptBuilder.test.js
│   ├── storage.test.js
│   └── validation.test.js
└── vitest.config.js
```

## 📝 更新日志

### v5.1 (2026-02-26)

#### ✨ 新功能
- **🎬 AI 盲盒事件** — ⚡ 命令菜单一键生成 AI 世界事件，影子导演根据上下文制造突发状况
- **💫 消息入场动画** — 新消息从下方 12px 滑入 + 淡入 (CSS animation)
- **📊 Token 压力条** — 标题栏下方实时显示记忆窗口用量，绿→黄→红渐变
- **🔊 UI 音效系统** — 5 种音效(发送/回复/事件/弹出/点击)，每角色独立提示音，音量控制+静音开关
- **浏览器音频解锁** — 自动处理 Chrome/Safari 首次交互限制

#### 🎨 UI 精细打磨
- **⚡ 命令菜单** — 从输入框旁向上弹出的 Popover，收纳所有群聊操作
- **▶️ 继续 FAB** — 紫色渐变发光浮动按钮，hover 抬升 + 按下缩放
- **呼吸气泡边框** — 仅最新消息 3px 发光边框 + pulse 动画，旧消息 2px 低透明度
- **消息列表底部留白** — pb-24 防止 FAB 遮挡最后一条消息
- **触控热区优化** — 命令菜单项 padding 14px，满足 44px+ 移动端标准
- **气泡边框降噪** — border-left 透明度 0.35→0.25

### v5.0 (2026-02-26)

#### ✨ 新功能
- **对话分支 (Fork)** — 在任意消息处分叉探索不同剧情，支持切换/重命名/删除分支
- **消息工具栏溢出菜单** — 2 个主操作 + "···" 浮动卡片(TTS/固定/分支/删除)
- **Tab 分页设置** — 单聊 4 栏(角色/记忆/通用/数据)，群聊 3 栏(通用/群聊/数据)

### v4.5.1 (2026-02-26)

#### 🐛 Bug 修复
- **群聊回复长度** — 修复 maxTokens 不生效，system prompt 动态调整长度指引
- **群聊性格表达** — 三重强化确保角色性格不被稀释
- **悄悄话自动回复** — 目标角色立即回应
- **移动端适配** — 头部图标/底部按钮/输入框字体优化

#### 🧪 测试
- **88 个单元测试** — 覆盖 7 个模块，全部通过

## 📄 License

MIT
