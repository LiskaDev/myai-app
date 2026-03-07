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
- **头像裁剪器** — 上传图片后自由裁剪、缩放，生成完美头像
- **单角色导出/导入** — 单独导出某个角色的完整数据，支持导入
- **🃏 角色卡片生成器** — 一键生成精美角色卡片，多种主题模板可选
- **📚 卡片库** — 浏览、管理、收藏已生成的角色卡片

### 💬 智能对话
- **SSE 流式响应** — 实时逐字输出 AI 回复，体验自然
- **双层解析引擎** — 支持 `<think>` 推理过程 和 `<inner>` 角色内心戏，分层展示
- **标签容错系统** — 自动处理 AI 输出的各种标签变体（`</think >`、`< /think>`、`</Think>` 等）
- **角色扮演文字风格** — 动作 `*...*`、思绪 `(...)`、状态 `[...]`、对话 `"..."` 自动着色
- **5 种视觉风格** — 清澈 (clear) / 烟雨 (misty) / 白昼 (day) / 甜心暗粉 (loveDark) / 甜心浅粉 (loveLight)
- **消息时间戳** — 悬浮显示消息发送/接收时间
- **表情系统** — `<expr:joy>` 等标签驱动角色头像表情变化（8 种情绪 + 模糊匹配）
- **😊 消息表情反应** — 对消息添加 ❤️ 👍 🔥 👎 反应，pill 标签展示
- **🔀 对话分支系统** — 在任意消息处分叉、切换、重命名、删除分支，探索不同剧情走向

### 🎨 写作风格系统 (v6.1)
- **写作风格模板** — 角色级别的预设写作风格（如"文艺"、"轻松"、"诗意"等）
- **动态风格指令** — 在聊天中实时调整 AI 写作偏好（快捷标签 + 自定义指令）
- **🎨 风格调整面板** — 输入框旁一键弹出，单聊 & 群聊均支持
- **场景感知动态长度** — auto 模式下 AI 根据剧情节奏（日常/转折/高潮）自动调节回复长度
- **写作质量基础指令** — 所有风格共享的底层写作质量保障

### 🧠 记忆系统
- **滑动窗口记忆** — 可调节的上下文窗口（5-30 轮对话）
- **永久记忆（📌）** — 手动钉选重要对话，AI 始终记住
- **AI 记忆精简** — 一键用 AI 压缩冗长记忆，节省 Token
- **自动摘要** — 对话过长时自动生成剧情摘要（单聊 & 群聊均支持）
- **认知画像卡** — 自动跟踪用户特征、关键事件和关系阶段
- **🧠 向量记忆 (v7.0)** — 重要记忆自动向量化存储（Supabase pgvector + SiliconFlow Embedding），对话时语义搜索召回相关记忆注入上下文

### 👥 多角色群聊
- **群聊创建** — 选择 2-8 个角色组建群聊，设置群名和主题描述
- **导演模式** — 作为"导演"引导话题，发消息后 AI 自动回复
- **@提及** — 导演消息中 @某角色 → 仅该角色回复
- **智能 PASS** — AI 判断无关话题时自动跳过，Discord 风格折叠显示跳过角色
- **独立群聊设置** — 每个群可独立选择模型和回复长度
- **群聊描述** — 设置讨论主题/背景，AI 围绕主题发言
- **群聊自动摘要** — 消息超出窗口时自动压缩，保持长期记忆
- **消息管理** — 群聊中也支持编辑/删除消息
- **上下文感知设置** — 群聊模式下设置面板显示群信息和角色预览
- **连续多轮对话** — 群聊支持 1-5 轮连续对话
- **群聊风格调整** — 群聊级别的写作风格指令，所有角色共享

### 🎬 导演工具箱
- **🌍 世界事件注入** — 一键投放天气/时间/突发等预设事件，或自定义输入任意情境变化，所有角色在下一轮都能感知
- **🤫 悄悄话系统** — 向指定角色发送私密指令（"一会儿故意反驳他"），其他角色完全不知情
- **🎬 AI 影子导演** — 基于近期对话上下文 + 剧本基调，由 AI 智能生成恰到好处的突发事件
  - **剧本基调 (Genre)** — 8 种预设风格（搞笑日常 / 校园恋爱 / 悬疑推理 / 废土生存 等），约束事件生成方向
  - **自动救场** — 当所有角色集体 PASS（剧情卡壳）时，影子导演自动介入生成转折事件
  - **智能判断** — 如果 AI 判断当前剧情已在高潮，不会强行干预

### 🔊 语音 & 交互
- **TTS 语音朗读** — 支持 Web Speech API，可选声线
- **自动朗读模式** — AI 回复完自动播放语音
- **消息管理** — 编辑、删除、重新生成消息
- **复制到剪贴板** — 一键复制消息内容，带视觉反馈

### 📖 日记 & 关系系统
- **📔 角色日记** — 自动生成角色视角的日记，记录剧情发展
- **💞 关系雷达图** — 可视化展示角色间的关系亲密度与变化
- **🎭 用户人设** — 设定玩家自身的角色背景，AI 感知你是谁
- **📅 时间线分析** — 异步分析对话时间线，维护剧情连贯性

### 📖 世界书 / Lorebook (v8.0)
- **世界观注入** — 定义地点、物品、历史等设定，对话中提到关键词时自动注入到 AI 上下文
- **关键词匹配** — 扫描最近对话，精确匹配触发词，按优先级排序注入
- **🧠 语义搜索** — 通过 AI 向量搜索自动发现语义相关的世界书条目（需配置 Supabase + SiliconFlow）
- **混合匹配** — 关键词匹配作为 baseline，语义搜索补充覆盖面，可开关切换
- **✨ AI 世界书生成器** — 三种生成模式，共用预览审核界面
  - **📄 TXT 提取** — 上传小说/设定文档，自动分块提取（UTF-8/GBK 自动检测，暂停/继续/停止）
  - **🌍 主题生成** — 输入主题关键词（如"东方修仙世界"），一键生成完整世界观，支持类别勾选和条目数滑块
  - **🎭 角色推导** — 从当前角色的人设、世界规则、隐藏设定等字段自动推导配套世界观
  - 预览支持分类分组、条目展开查看全文、保存时同名去重
  - 🌍 **小说冒险模式** — 提取小说世界书 + 创建"故事引导者"角色，即可以主角身份在小说世界冒险
- **SillyTavern 兼容** — 支持导入 SillyTavern Lorebook JSON 格式
- **Tag 式关键词输入** — 直观的标签输入框，回车/Tab 添加，Backspace 删除
- **注入位置控制** — 可选「角色设定前」或「对话上下文前」两个注入点
- **Token 预算** — 自动估算注入内容的 token 消耗，超预算自动截止

### 🎭 RP 体验优化 (v9.0)
- **叙事驱动** — 用户短消息（<15字）时 AI 主动推进场景，引入环境变化、NPC 动作和伏笔
- **括号指令智能化** — 用户 `()` 表达导演意图而非逐字脚本，AI 用角色逻辑自然实现

### ⚙️ 设置系统
- **多平台模型预设** — DeepSeek 官方 / 硅基流动 (SiliconFlow) / OpenRouter 一键切换
- **模型选择器** — 预设 + 手动输入双模式，预设按平台分组（DeepSeek / Qwen / Kimi / GLM 等）
- **聊天字体大小** — 滑块调节，实时预览
- **高级设置折叠** — 常用设置一目了然，高级选项按需展开
- **全局 & 角色级参数** — Temperature、Max Tokens、回复长度等独立配置

### 💾 数据管理
- **本地持久化** — 全部数据存储在 localStorage，无需服务器
- **Session 恢复** — 刷新浏览器自动回到上次的角色/群聊
- **一键导出/导入** — JSON 格式备份恢复所有角色和设置，支持单角色导入
- **跨标签页同步** — 多窗口实时状态同步
- **📖 故事导出** — 将对话导出为可读的故事文本
- **存储用量监控** — 实时显示 localStorage 使用百分比

### 📱 PWA 支持
- **添加到主屏幕** — 手机用户可全屏运行像原生 App
- **Service Worker** — 页面 network-first，资源 cache-first，跳过 API 请求
- **新手引导** — 3 步引导 overlay，仅首次显示

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

### 🌐 在线访问

| 平台 | 链接 | 适用 |
|------|------|------|
| **Cloudflare Pages** | [myai-app.pages.dev](https://myai-app.pages.dev) | 🇨🇳 国内访问（纯前端功能） |
| **Vercel** | [myai-app-eight.vercel.app](https://myai-app-eight.vercel.app) | 🌍 完整功能（含语义搜索 API） |

> **平台差异**：Cloudflare Pages 仅部署静态前端，**语义搜索**需要通过 Vercel 的 Serverless Function 运行。关键词匹配在两个平台上都正常工作。
> 
> **无需梯子**：SiliconFlow 是国内服务，Supabase API 由 Vercel Serverless 中转调用（服务端到服务端），用户浏览器不直接请求海外服务。

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

## 📜 免责声明

> [!NOTE]
> 本工具仅提供对话界面，**不提供任何 AI 模型服务**。
> 
> - AI 回复内容由用户自行接入的第三方 API（DeepSeek、硅基流动等）生成
> - 本工具不存储、不传输、不审核任何用户对话内容
> - 所有数据仅保存在用户本地浏览器的 `localStorage` 中
> - 用户需自行遵守所在地区法律法规及 API 服务商的使用条款
> - 开发者对用户使用本工具产生的任何内容不承担责任

---

## 🏗️ 项目结构

```
myai-app/
├── src/
│   ├── App.vue                        # 主应用（路由、布局）
│   ├── components/
│   │   ├── ChatWindow.vue             # 聊天消息列表
│   │   ├── GroupChatWindow.vue        # 群聊消息列表
│   │   ├── SettingsModal.vue          # 设置面板（群聊/单聊自适应）
│   │   ├── RoleSidebar.vue            # 角色列表侧边栏
│   │   ├── RoleCardGenerator.vue      # 🃏 角色卡片生成器
│   │   ├── CardLibraryModal.vue       # 📚 卡片库弹窗
│   │   ├── AvatarCropper.vue          # ✂️ 头像裁剪器
│   │   ├── BranchSwitcher.vue         # 🔀 分支切换器
│   │   ├── DiaryModal.vue             # 📔 角色日记弹窗
│   │   ├── RelationshipRadar.vue      # 💞 关系雷达图
│   │   ├── StoryExportModal.vue       # 📖 故事导出弹窗
│   │   ├── CreateGroupModal.vue       # 创建群聊弹窗
│   │   ├── EditGroupModal.vue         # 编辑群聊弹窗
│   │   ├── EditMessageModal.vue       # 编辑消息弹窗
│   │   ├── ImportDataModal.vue        # 数据导入弹窗
│   │   ├── OnboardingOverlay.vue      # 新手引导覆盖层
│   │   └── settings/                  # 设置子组件
│   │       ├── GlobalSettings.vue     # 全局设置
│   │       ├── RoleBasicSettings.vue   # 角色基础设置
│   │       ├── RoleAdvancedSettings.vue # 角色高级设置
│   │       ├── CharacterDepthSettings.vue # 角色深度设定
│   │       ├── UserPersonaSettings.vue # 🎭 用户人设设置
│   │       ├── WorldBookSettings.vue   # 📖 世界书管理
│   │       ├── WorldBookExtractor.vue  # ✨ AI 世界书提取器
│   │       └── MemoryManager.vue      # 记忆管理器
│   ├── composables/                   # 组合式函数
│   │   ├── useChat.js                 # 核心聊天逻辑（流式 SSE）
│   │   ├── useGroupChat.js            # 群聊逻辑（多角色、摘要）
│   │   ├── usePromptBuilder.js        # API Prompt 构建
│   │   ├── useAutoSummary.js          # 单聊自动摘要
│   │   ├── useAppState.js             # 全局状态 + Session 持久化
│   │   ├── useBranch.js               # 🔀 分支管理
│   │   ├── useDiary.js                # 📔 日记系统
│   │   ├── useRelationship.js         # 💞 关系系统
│   │   ├── useTimeline.js             # 📅 时间线分析
│   │   ├── useUserPersona.js          # 🎭 用户人设
│   │   ├── useMemory.js               # 记忆系统
│   │   ├── useRoleGenerator.js        # 角色生成器
│   │   ├── useStoryExporter.js        # 故事导出
│   │   ├── useBackgroundTasks.js      # 后台任务
│   │   ├── useActiveMessage.js        # 消息激活状态
│   │   ├── useGestures.js             # 手势交互
│   │   ├── useSoundEffects.js         # 音效系统
│   │   ├── modelAdapter.js            # 模型适配器
│   │   ├── presets.js                 # 预设数据
│   │   ├── useTTS.js                  # 语音朗读
│   │   └── promptModules/             # Prompt 模块
│   │       ├── coreIdentity.js        # 核心身份
│   │       ├── styleSystem.js         # 风格系统
│   │       ├── memorySystem.js        # 记忆系统
│   │       ├── worldBook.js           # 📖 世界书 + 语义搜索
│   │       └── contextAssembler.js    # 上下文组装器
│   ├── styles/                        # 风格主题
│   │   ├── tokens.css                 # 基础 token
│   │   ├── theme-tokens.css           # 主题 token
│   │   ├── decor-tokens.css           # 装饰 token
│   │   └── card-templates.css         # 🃏 卡片模板样式
│   └── utils/
│       ├── textParser.js              # 双层解析 & 角色扮演文字格式化
│       ├── cardTheme.js               # 🃏 卡片主题工具
│       ├── markdown.js                # Markdown 渲染
│       ├── summary.js                 # 摘要工具
│       ├── apiUtils.js                # API 工具函数
│       ├── storage.js                 # localStorage 封装
│       ├── uuid.js                    # UUID 生成
│       └── validation.js              # 输入验证
├── api/                               # Vercel Serverless Functions
│   ├── worldbook-embed.js             # 📖 世界书 embedding 存储
│   ├── worldbook-search.js            # 🧠 世界书向量语义搜索
│   ├── memory-save.js                 # 🧠 向量记忆存储
│   └── memory-search.js               # 🧠 向量记忆检索
├── tests/                             # Vitest 单元测试
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
| AI API | DeepSeek / Qwen / Kimi / GLM（兼容 OpenAI 格式） |
| 向量搜索 | Supabase pgvector + SiliconFlow Embedding |
| Serverless | Vercel Serverless Functions |
| 部署 | Vercel（完整功能） + Cloudflare Pages（纯前端） |
| PWA | Service Worker + Manifest |

---

## 📄 License

MIT
