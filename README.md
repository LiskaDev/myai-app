# 🎭 MyAI-RolePlay

> **沉浸式 AI 角色扮演对话平台** — 与 AI 角色进行视觉小说体验，支持多角色群聊、深度角色定制和智能记忆系统

![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ 核心功能

### 🎭 角色系统
- **多角色管理** — 创建、切换、删除角色，每个角色独立保存对话历史
- **深度人设定制** — 角色性格、说话风格、内心秘密、关系设定、外貌描写、世界观
- **自定义头像 & 背景** — 为每个角色设置独立的视觉风格

### 💬 智能对话
- **SSE 流式响应** — 实时逐字输出 AI 回复，体验自然
- **双层解析引擎** — 支持 `<think>` 推理过程 和 `<inner>` 角色内心戏，分层展示
- **角色扮演文字风格** — 动作 `*...*`、思绪 `(...)`、状态 `[...]`、对话 `"..."` 自动着色
- **5 种预设风格 + 自定义** — Simple / Moonlight / Dreamy / Crystal / Custom

### 🧠 记忆系统
- **滑动窗口记忆** — 可调节的上下文窗口（5-30 轮对话）
- **永久记忆（📌）** — 手动钉选重要对话，AI 始终记住
- **AI 记忆精简** — 一键用 AI 压缩冗长记忆，节省 Token
- **自动摘要** — 对话过长时自动生成剧情摘要（单聊 & 群聊均支持）

### 👥 多角色群聊
- **群聊创建** — 选择 2-8 个角色组建群聊，设置群名和主题描述
- **导演模式** — 作为"导演"引导话题，发消息后 AI 自动回复
- **@提及** — 导演消息中 @某角色 → 仅该角色回复
- **智能 PASS** — AI 判断无关话题时自动跳过，Discord 风格折叠显示跳过角色
- **独立群聊设置** — 每个群可独立选择模型（V3/R1）和回复长度
- **群聊描述** — 设置讨论主题/背景，AI 围绕主题发言
- **群聊自动摘要** — 消息超出窗口时自动压缩，保持长期记忆
- **消息管理** — 群聊中也支持编辑/删除消息
- **上下文感知设置** — 群聊模式下设置面板显示群信息和角色预览

### 🔊 语音 & 交互
- **TTS 语音朗读** — 支持 Web Speech API，可选声线
- **自动朗读模式** — AI 回复完自动播放语音
- **消息管理** — 编辑、删除、重新生成消息

### 💾 数据管理
- **本地持久化** — 全部数据存储在 localStorage，无需服务器
- **Session 恢复** — 刷新浏览器自动回到上次的角色/群聊
- **一键导出/导入** — JSON 格式备份恢复所有角色和设置
- **跨标签页同步** — 多窗口实时状态同步

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 18
- npm ≥ 9

### 安装 & 运行

```bash
# 克隆项目
git clone https://github.com/LiskaDev/myai-app.git
cd myai-app

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开 `http://localhost:5173/`，在设置面板中填入 API Key 即可开始对话。

### 构建部署

```bash
npm run build     # 生成 dist/ 目录
npm run preview   # 本地预览生产构建
```

---

## ⚠️ 安全提示

> [!CAUTION]
> **API Key 安全风险**：当前版本将 API Key 存储在浏览器 `localStorage` 中，并通过前端直接发送到 AI API。
> 
> **这意味着**：
> - API Key 可通过浏览器开发者工具查看
> - 如果部署到公网，其他用户需要填入自己的 Key（不会泄露你的）
> - **不要**将带有 Key 的 `localStorage` 数据分享给他人
> 
> **推荐的安全部署方案**：
> 1. **仅本地使用** — 在自己电脑上 `npm run dev`，最安全
> 2. **反向代理** — 使用 Nginx/Cloudflare Worker 做 API 代理，Key 存在服务端环境变量中
> 3. **私有部署** — 部署在内网或设置访问密码

---

## 🏗️ 项目结构

```
myai-app/
├── src/
│   ├── App.vue                    # 主应用（路由、布局）
│   ├── components/
│   │   ├── ChatWindow.vue         # 聊天消息列表
│   │   ├── GroupChatWindow.vue    # 群聊消息列表
│   │   ├── SettingsModal.vue      # 设置面板（群聊/单聊自适应）
│   │   ├── RoleSidebar.vue        # 角色列表侧边栏
│   │   ├── CreateGroupModal.vue   # 创建群聊弹窗
│   │   ├── EditGroupModal.vue     # 编辑群聊弹窗
│   │   ├── EditMessageModal.vue   # 编辑消息弹窗
│   │   ├── ImportDataModal.vue    # 数据导入弹窗
│   │   └── settings/              # 设置子组件
│   │       ├── GlobalSettings.vue
│   │       ├── RoleBasicSettings.vue
│   │       ├── RoleAdvancedSettings.vue
│   │       ├── CharacterDepthSettings.vue
│   │       ├── ParameterSettings.vue
│   │       └── MemoryManager.vue
│   ├── composables/               # 组合式函数
│   │   ├── useChat.js             # 核心聊天逻辑（流式 SSE）
│   │   ├── useGroupChat.js        # 群聊逻辑（多角色、摘要）
│   │   ├── usePromptBuilder.js    # API Prompt 构建
│   │   ├── useAutoSummary.js      # 单聊自动摘要
│   │   ├── useAppState.js         # 全局状态 + Session 持久化
│   │   ├── useMemory.js           # 记忆系统
│   │   └── useTTS.js              # 语音朗读
│   └── utils/
│       ├── textParser.js          # 双层解析 & 角色扮演文字格式化
│       ├── storage.js             # localStorage 封装
│       └── validation.js          # 输入验证
├── tests/                         # Vitest 单元测试
└── index.html
```

---

## 🧪 测试

```bash
npm run test              # 运行测试
npm run test:watch        # 监听模式
npm run test:coverage     # 生成覆盖率报告
```

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API + `<script setup>`) |
| 构建 | Vite 7 |
| 样式 | Tailwind CSS 4 + 自定义 Glassmorphism |
| 测试 | Vitest + Vue Test Utils |
| 安全 | DOMPurify (XSS 防护) |
| AI API | DeepSeek (兼容 OpenAI 格式) |

---

## 📄 License

MIT
