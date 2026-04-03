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
- **酒馆角色卡兼容** — 支持直接导入 SillyTavern 格式的第三方角色卡，智能映射 `mes_example` (对话示例) 与 `creator_notes` (补充指令) 以高度还原原卡风味
- **🃏 角色卡片生成器** — 一键生成精美角色卡片，多种主题模板可选
- **📚 卡片库** — 浏览、管理、收藏已生成的角色卡片

### 💬 智能对话
- **SSE 流式响应** — 实时逐字输出 AI 回复，体验自然
- **双层解析引擎** — 支持 `<think>` 推理过程 和 `<inner>` 角色内心戏，分层展示
- **标签容错系统** — 自动处理 AI 输出的各种标签变体（`</think >`, `< /think>`, `</Think>` 等）
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
- **后台调度优化** — 采用智能错峰计算机制独立调度章节摘要（15轮）、认知卡（20轮）与时间线（25轮），根绝并发导致的数据丢失或全局锁冲突
- **💾 关键词记忆 (v7.0)** — 重要记忆存储为关键事件条目，对话时基于纯本地算法模糊检索并召回相关片段注入上下文（原向量记忆）

### 🔊 语音 & 交互
- **TTS 语音朗读** — 支持 Web Speech API，可选声线
- **自动朗读模式** — AI 回复完自动播放语音
- **消息管理** — 编辑、删除、重新生成消息
- **复制到剪贴板** — 一键复制消息内容，带视觉反馈

### 📖 日记 & 关系系统
- **📔 角色日记** — 自动生成角色视角的日记，记录剧情发展
- **🎭 用户人设** — 设定玩家自身的角色背景，AI 感知你是谁
- **📅 时间线分析** — 异步分析对话时间线，维护剧情连贯性

### 📖 世界书 / Lorebook (v8.0)
- **世界观注入** — 定义地点、物品、历史等设定，对话中提到关键词时自动注入到 AI 上下文
- **关键词匹配** — 扫描最近对话，精确触发触发词，按优先级排序注入
- **🔍 关键词检索** — 全文搜索自动发现相关的未触发世界书条目（原语义搜索）
- **混合匹配** — 关键词精确匹配 + 关键词模糊检索双引擎，可自由开关
- **✨ AI 世界书生成器** — 三种生成模式，共用预览审核界面
  - **📄 TXT 提取** — 上传小说/设定文档，自动分块提取（UTF-8/GBK 自动检测，暂停/继续/停止）
  - **🌍 主题生成** — 输入主题关键词（如"东方修仙世界"），一键生成完整世界观，支持类别勾选和条目数滑块
  - **🎭 角色推导** — 从当前角色的人设、世界规则、隐藏设定等字段自动推导配套世界观
  - 预览支持分类分组、条目展开查看全文、保存时同名去重
- **Tag 式关键词输入** — 直观的标签输入框，回车/Tab 添加，Backspace 删除
- **注入位置控制** — 可选「角色设定前」或「对话上下文前」两个注入点
- **Token 预算** — 自动估算注入内容的 token 消耗，超预算自动截止

### 🎭 RP 体验优化 (v9.0)
- **叙事驱动** — 用户短消息（<15字）时 AI 主动推进场景，引入环境变化、NPC 动作和伏笔
- **括号指令智能化** — 用户 `()` 表达导演意图而非逐字脚本，AI 用角色逻辑自然实现

### 🌏 小说模式 (Novel Mode v2)
- **书库系统** — 导入 TXT 小说 → AI 自动拆分为世界书条目 → 生成独立冒险世界
- **多存档管理** — 每本书 4 个独立存档位，自由切换冒险进度
- **STATE 驱动侧边栏** — AI 每轮回复自动附带隐藏 JSON 状态块，实时更新修为/物品/NPC 关系/位置/任务
- **段落分层渲染** — 场景描写（暗金色）、内心独白（斜体+竖线）、对话（白色）自动分类着色，流式输出时即时分段
- **数值变化动画** — 灵力/灵石等数值变动时青色闪烁高亮，境界提升时卡片发光，新物品获得 glow 动画
- **STATE 失败警告** — AI 未返回有效 STATE 时顶部显示持久警告条（而非瞬时 toast）
- **侧边栏折叠** — 各分区标题可点击折叠/展开，箭头旋转动画
- **行动建议** — AI 每轮生成 3 条上下文相关的行动选项 + 🎲 随机行动，依次淡入动画
- **事件标签** — 金色情报 / 红色危险 / 绿色获得 / 紫色神秘，依次弹出动画
- **叙事节奏控制** — max_tokens 随叙事节奏（简洁 1200 / 标准 3000 / 沉浸 5000）动态调整
- **自动存档** — AI 回复完成后自动保存到 IndexedDB + localStorage
- **SSE 安全层** — 跨 chunk 的 SSE 行缓冲机制，防止 JSON.parse 静默失败
- **书籍设置** — 叙事风格（武侠/仙侠/现代/末世/西幻）、难度（轻松/普通/硬核）、叙事节奏、世界书条目编辑
- **移动端适配** — 侧边栏抽屉 + 底部导航栏，小屏幕完整可用

### ✨ 内置智能助手 (AssistantBot)
- **右侧抽屉对话** — 右上角唤起，复用用户已配置的 API Key，无需额外设置
- **功能引导** — 可回答关于平台任何功能的问题，提供操作步骤说明
- **ACTION 指令执行** — AI 可在回复中内嵌隐藏指令，帮用户直接完成跳转页面、修改设置等操作
- **安全白名单** — 只允许修改无害字段（model、temperature 等），`apiKey`/`baseUrl` 走独立安全通道，BaseURL 实行 SSRF 校验（禁止局域网地址）
- **快捷问题芯片** — 首次打开时展示常用问题入口，一键提问
- **友好错误提示** — API 余额不足时自动显示对应平台的充值链接

### ⚙️ 设置系统
- **📊 状态与调试** — 直观的记忆状态面板（诊断摘要/认知卡健康度），支持实时 Prompt 预览及 Token 消耗预估
- **多平台模型预设** — DeepSeek 官方 / 硅基流动 (SiliconFlow) / OpenRouter 一键切换
- **模型选择器** — 预设 + 手动输入双模式，预设按平台分组（DeepSeek / Qwen / Kimi / GLM 等）
- **聊天字体大小** — 滑块调节，实时预览
- **高级设置折叠** — 常用设置一目了然，高级选项按需展开
- **独立浮层反馈** — 核心模态框（如设置面板）配备互相隔离的局部 Toast UI，解决层级冲突带来视觉盲区的问题
- **全局 & 角色级参数** — Temperature、Max Tokens、回复长度等独立配置

### 💾 数据管理
- **混合式本地存储引擎**
  - **IndexedDB（`myai_db_v1`）** — 角色数据与对话历史的主存储，容量数百 MB，彻底告别 5MB 瓶颈
  - **IndexedDB（`myai_novel_db`）** — 小说模式对话消息独立存储
  - **localStorage** — 世界书、用户人设、卡片库、全局设置等辅助数据缓存
- **一次性数据迁移** — 首次启动自动将旧版 localStorage 数据迁移至 IndexedDB，保留原始备份
- **Session 恢复** — 刷新浏览器自动回到上次的角色/群聊界面
- **一键导出/导入** — JSON 格式备份恢复所有角色和跨应用设置，支持单角色导入
- **📖 故事导出** — 将对话一键导出为可供离线阅读的纯文本
- **后台体检面板** — 提供界面实时监控认知卡片归档状态及各区块用量占比

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
| **Cloudflare Pages** | [myai-app.pages.dev](https://myai-app.pages.dev) | 🇨🇳 国内可访问，功能完整 |

> 本项目已完成去后端化迁移，所有功能（含记忆检索、世界书搜索）均在浏览器本地运行，无需 Serverless 函数，单平台部署即可获得完整体验。

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
> - 所有数据仅保存在用户本地浏览器的 `localStorage` / `IndexedDB` 中
> - 用户需自行遵守所在地区法律法规及 API 服务商的使用条款
> - 开发者对用户使用本工具产生的任何内容不承担责任

---

## 🏗️ 项目结构

```
myai-app/
├── src/
│   ├── App.vue                        # 主应用（路由、布局）
│   ├── style.css                      # 全局样式
│   ├── components/
│   │   ├── AssistantBot.vue           # ✨ 内置智能助手（右侧抽屉）
│   │   ├── ChatWindow.vue             # 聊天消息列表
│   │   ├── SettingsModal.vue          # 设置面板（群聊/单聊自适应）
│   │   ├── RoleSidebar.vue            # 角色列表侧边栏
│   │   ├── RoleCardGenerator.vue      # 🃏 角色卡片生成器
│   │   ├── CardLibraryModal.vue       # 📚 卡片库弹窗
│   │   ├── AvatarCropper.vue          # ✂️ 头像裁剪器
│   │   ├── BranchSwitcher.vue         # 🔀 分支切换器
│   │   ├── DiaryModal.vue             # 📔 角色日记弹窗
│   │   ├── RelationshipRadar.vue      # 💞 关系雷达图
│   │   ├── StoryExportModal.vue       # 📖 故事导出弹窗
│   │   ├── EditMessageModal.vue       # 编辑消息弹窗
│   │   ├── ImportDataModal.vue        # 数据导入弹窗
│   │   ├── OnboardingOverlay.vue      # 新手引导覆盖层
│   │   ├── CharacterHome.vue          # 首页（角色 Tab + 🌏 世界 Tab）
│   │   ├── novel/                     # 🌏 小说模式组件
│   │   │   ├── NovelMode.vue          # 小说模式主界面（STATE 侧边栏 + 打字机 + 流式 API）
│   │   │   ├── BookLibrary.vue        # 书库（书籍卡片列表）
│   │   │   ├── BookImport.vue         # 书籍导入（TXT → AI 世界书拆分）
│   │   │   ├── BookSettings.vue       # 书籍设置（风格/难度/世界书/存档管理）
│   │   │   ├── ModelConfigPanel.vue   # 书籍模型配置
│   │   │   └── SaveSelect.vue         # 存档选择（4 个存档位）
│   │   └── settings/                  # 设置子组件
│   │       ├── GlobalSettings.vue     # 全局设置
│   │       ├── RoleBasicSettings.vue  # 角色基础 & 高级设置
│   │       ├── CharacterDepthSettings.vue # 角色深度设定
│   │       ├── UserPersonaSettings.vue # 🎭 用户人设设置
│   │       ├── WorldBookSettings.vue  # 📖 世界书管理
│   │       ├── WorldBookExtractor.vue # ✨ AI 世界书提取器
│   │       └── MemoryManager.vue      # 记忆管理器
│   ├── composables/                   # 组合式函数
│   │   ├── useChat.js                 # 核心聊天逻辑（流式 SSE）
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
│   │   ├── useNovelStore.js           # 🌏 小说书库数据管理
│   │   ├── useNovelDB.js              # 🌏 小说 IndexedDB 读写封装
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
│       ├── apiError.js                # API 错误友好提示（余额/Key/限流等）
│       ├── indexeddb.js               # IndexedDB 通用读写工具（主数据存储）
│       ├── storage.js                 # localStorage 封装
│       ├── uuid.js                    # UUID 生成
│       ├── validation.js              # 输入验证
│       └── novelUtils.js              # 🌏 小说模式工具（STATE 解析/流式 API/系统提示词）
├── tests/                             # Vitest 单元测试
└── index.html
```

---

## 🗄️ 数据存储架构

| 存储层 | 数据库/Key 格式 | 存储内容 | 容量上限 |
|--------|----------------|----------|----------|
| **IndexedDB** `myai_db_v1` | `myai_roles_v1` | 角色列表、对话历史 | 数百 MB+ |
| **IndexedDB** `myai_novel_db` | `novel_messages_{bookId}_{slotIndex}` | 小说模式完整对话消息 | 数百 MB+ |
| **localStorage** | `myai_worldbook_{roleId}` | 世界书条目 | ~5 MB（辅助） |
| **localStorage** | `myai_bookList_v1` | 书库书籍元数据 & 存档位信息 | ~5 MB（辅助） |
| **localStorage** | 全局设置、用户人设、卡片库等 | 辅助配置数据 | ~5 MB（辅助） |

> **注意**：v1 历史版本的数据存储于 localStorage。首次升级启动时，`indexeddb.js` 中的 `migrateFromLocalStorage()` 会自动将旧数据迁移至 IndexedDB，原始备份保留不删除。

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
| 本地搜索 | 原生 JS 实现的高效 n-gram 子串关联算法（关键词记忆 + 世界书） |
| 存储 | IndexedDB（主数据）+ localStorage（辅助数据） |
| 部署 | Cloudflare Pages（纯静态，功能完整） |
| PWA | Service Worker + Manifest |

---

## 📄 License

MIT
