# MyAI-RolePlay 项目说明

> 面向 AI 编码助手的项目架构速查文档。
> 如果你是 AI，请在修改代码前读完本文件。

---

## 技术栈

- **前端框架**：Vue 3（Composition API + `<script setup>`）
- **构建工具**：Vite 7
- **CSS**：Tailwind CSS 4 + 原生 CSS（`style.css`）
- **测试**：Vitest + jsdom
- **部署**：Cloudflare Pages（纯静态，零后端）

---

## 核心架构：纯客户端，无后端

本项目已完成去后端化迁移，**不依赖任何服务端**。所有功能在浏览器内完成。

### 数据存储（混合方案）

| 存储方式 | 用途 | 容量 |
|---|---|---|
| **localStorage** | 角色列表、全局设置、世界书、向量记忆元数据、认知卡、用户画像 | ~5MB |
| **IndexedDB** (`useNovelDB.js`) | 小说模式的聊天消息（数据量大，避免 localStorage 上限） | 数百 MB+ |

> ⚠️ **注意**：`useMemory.js` 中的 `retrieveRelevantMemories()` 从 localStorage 读取角色的 `vectorMemories`，
> 但小说模式的 messages 存储在 IndexedDB（DB: `myai_novel_db`，Store: `messages`）。
> 不要误以为全部数据都在 localStorage 中。

### 搜索引擎（全部本地）

| 功能 | 实现方式 |
|---|---|
| 世界书匹配 | 关键词 `includes()` 子串匹配 (`worldBook.js`) |
| 向量记忆检索 | n-gram 子串匹配评分（2-4 字 n-gram，纯 JS，零依赖）(`useMemory.js`) |

> 历史遗留：`worldBook.js` 中有 `syncEntryToSupabase`、`deleteEntryFromSupabase`、`semanticSearch` 三个
> `@deprecated` no-op stub 函数，**不要删除**，它们保留签名是防止旧版调用方编译报错。

### API 调用

本项目**没有自建后端 API**。`/api/` 目录已删除。

代码中出现的 `fetch()` 调用全部是**直接请求用户配置的 LLM API**（如 DeepSeek、OpenRouter），
不经过任何中转服务器。

---

## 目录结构

```
myai-app/
├── src/
│   ├── App.vue                  # 主入口（64KB，包含大量业务逻辑）
│   ├── style.css                # 全局样式（74KB）
│   ├── components/
│   │   ├── ChatWindow.vue       # 聊天界面
│   │   ├── GroupChatWindow.vue   # 群聊界面
│   │   ├── SettingsModal.vue     # 设置弹窗（80KB，最大组件）
│   │   ├── CharacterHome.vue    # 角色主页
│   │   ├── RoleCardGenerator.vue # 角色卡生成
│   │   ├── novel/               # 小说模式组件
│   │   └── settings/            # 设置子组件
│   ├── composables/
│   │   ├── useChat.js           # 聊天核心逻辑
│   │   ├── useMemory.js         # 记忆系统（章节摘要、认知卡、向量记忆）
│   │   ├── useGroupChat.js      # 群聊逻辑（72KB，最大文件）
│   │   ├── useNovelDB.js        # IndexedDB 封装
│   │   ├── useNovelStore.js     # 小说模式状态管理
│   │   ├── useAppState.js       # 全局状态
│   │   ├── usePromptBuilder.js  # Prompt 组装管道
│   │   └── promptModules/
│   │       └── worldBook.js     # 世界书系统
│   └── utils/
│       ├── textParser.js        # 文本解析（表情、内心独白等）
│       ├── storage.js           # localStorage 工具
│       └── validation.js        # 数据校验
├── tests/                       # Vitest 测试
└── vitest.config.js
```

---

## 记忆系统（四层）

1. **滑动窗口**：最近 N 条消息直接进 prompt
2. **章节摘要** (`chapterSummaries`)：旧消息归档为摘要，超上限合并为「远古摘要」
3. **认知卡** (`memoryCard`)：AI 自动维护的结构化角色认知（JSON）
4. **向量记忆** (`vectorMemories`)：章节摘要提取的关键记忆，存储在 localStorage 角色对象的 `vectorMemories` 字段中（仅含 `content`、`importance`、`memory_type`，**不含 embedding 向量**）。检索时从查询文本提取 2-4 字 n-gram，对每条记忆统计命中数并排序，取前 5 条。纯 JS 实现，零依赖，无内存积累。

---

## 小说模式数据

| 存储 | Key 格式 | 内容 |
|---|---|---|
| localStorage | `myai_bookList_v1` | 书籍列表、元数据、存档位信息、STATE |
| IndexedDB | `novel_messages_{bookId}_{slotIndex}` | 完整对话历史（消息数组） |

书籍模型配置独立于全局设置，存在书籍对象的 `novelModel` 字段里。

---

## 开发注意事项

- `App.vue` 和 `SettingsModal.vue` 体积很大，修改前务必读完相关上下文
- 角色数据以 `myai_roles_v1` 为 key 存在 localStorage 中
- 世界书以 `myai_worldbook_{roleId}` 为 key 存在 localStorage 中
- 小说消息以 `novel_messages_{bookId}_{slotIndex}` 为 key 存在 IndexedDB 中
- 所有后台任务（摘要生成、认知卡更新等）有排他锁机制，见 `useTimeline.js` 的 `acquireBackgroundLock`

---

## 禁止事项

- 不要引入任何需要服务端的依赖
- 不要引入 `@xenova/transformers`（ONNX Runtime Wasm 在 Vite + Cloudflare Pages 上有严重兼容性问题，已用 n-gram 子串匹配代替）
- 不要删除 `worldBook.js` 中标注 `@deprecated` 的三个 stub 函数
- 不要把小说模式的 messages 存入 localStorage（有容量风险）
- 修改 `App.vue` 前务必确认影响范围，该文件耦合度很高
