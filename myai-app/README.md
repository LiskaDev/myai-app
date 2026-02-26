# 🎭 MyAI-RolePlay v4.5.1

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
- **自动摘要** — 20 条触发，保留最近 10 条 + 摘要上下文
- **TTS 语音朗读** — 支持自动朗读和声线选择

### 👥 群聊模式
- **多角色群聊** — 2-8 个 AI 角色同时对话
- **导演模式** — 用户作为导演引导话题
- **影子导演** — AI 自动生成世界事件推动剧情
- **悄悄话** — 私聊某个角色，目标角色立即回应
- **PASS 机制** — 无关角色自动跳过，对话更自然
- **剧本基调** — 搞笑日常 / 校园恋爱 / 悬疑推理等风格约束
- **回复长度控制** — 简短(~250字) / 适中(~500字) / 较长(~1000字) / 长文(~2000字)
- **性格强化** — 三重 prompt 强化确保角色性格不被稀释

### 🎨 视觉体验
- **Glassmorphism UI** — 毛玻璃质感暗色主题
- **RP 文字风格** — Simple / 月光夜曲 / 梦幻浪漫 / 清透水晶 / 自定义
- **沉浸模式** — 隐藏所有标记，纯粹阅读体验
- **移动端适配** — 响应式布局，手机端友好

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
- **测试：** Vitest + jsdom (77 个测试用例)
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
├── src/
│   ├── App.vue                    # 主应用组件
│   ├── style.css                  # 全局样式 + 移动端适配
│   ├── composables/
│   │   ├── useAppState.js         # 应用状态管理
│   │   ├── useChat.js             # 单聊 API 调用 + 流式响应
│   │   ├── useGroupChat.js        # 群聊全部逻辑
│   │   ├── usePromptBuilder.js    # System Prompt 构建
│   │   ├── useAutoSummary.js      # 自动摘要
│   │   └── presets.js             # 预设角色模板
│   ├── components/
│   │   ├── ChatWindow.vue         # 单聊界面
│   │   ├── GroupChatWindow.vue    # 群聊界面
│   │   ├── EditGroupModal.vue     # 群聊编辑弹窗
│   │   ├── SettingsModal.vue      # 设置弹窗
│   │   └── settings/              # 设置子组件
│   └── utils/
│       ├── storage.js             # localStorage 封装
│       ├── textParser.js          # RP 文本格式化
│       ├── validation.js          # 输入验证 + 安全
│       └── summary.js             # 摘要工具函数
├── tests/                         # 单元测试
│   ├── textParser.test.js
│   ├── useChat.test.js
│   ├── useGroupChat.test.js
│   ├── usePromptBuilder.test.js
│   ├── storage.test.js
│   └── validation.test.js
└── vitest.config.js
```

## 📝 更新日志

### v4.5.1 (2026-02-26)

#### 🐛 Bug 修复
- **群聊回复长度** — 修复 maxTokens 设置不生效的问题，根本原因是 system prompt 硬编码了"简洁有力"指令，现改为根据设置动态调整
- **群聊性格表达** — 三重强化 prompt 确保角色性格不被群聊指令稀释（CHARACTER DEFINITION 标签 + 性格强化条目 + ROLEPLAY FRAMEWORK 英文提醒）
- **悄悄话自动回复** — 发送悄悄话后目标角色立即回应，而非等到下一轮
- **移动端适配** — 头部图标不再拥挤、群聊底部按钮分两行、输入框字体放大防止 iOS 缩放

#### ✨ 新功能
- **头像选择器** — 点击圆形头像即可从手机相册选择或拍照，图片自动压缩为 256px 存储
- **回复长度标签优化** — 从 "适中 (1000)" 改为 "适中（~500字）"，更直观

#### 🧪 测试
- **新增 35 个单元测试** — 覆盖 storage.js、usePromptBuilder.js、useGroupChat.js
- **总计 77 个测试用例**，6 个测试文件全部通过

## 📄 License

MIT
