# 小说模式重做 — 实现规格说明 v2.0

## 一、这个 HTML 是什么

`novel-mode.html` 是纯静态演示稿，用来展示目标视觉效果和交互逻辑。
**所有数据都是硬编码的 mock**，没有接真实 API。

你需要把这套 UI 移植进现有的 Vue 3 项目，替换掉旧的小说模式组件。

---

## 二、项目技术栈

- Vue 3 + Vite 7 + Tailwind CSS 4
- 现有 composables：`usePromptBuilder.js` / `useMemory.js` / `useAutoSummary.js` 等
- API 调用走现有的流式 completions 接口
- 小说模式与角色系统完全独立，不绑定任何角色卡

---

## 三、入口结构

CharacterHome 现有一个「角色」Tab，新增一个「🌏 世界」Tab，两者平级。

```
CharacterHome
  ├── 角色 Tab（现有，不动）
  └── 🌏 世界 Tab（新增）
           ↓ 首次进入（书库为空）
      空状态页：「+ 导入新书」按钮
           ↓ 点击导入
      上传 TXT 文件 → AI 拆分条目（复用现有世界书生成器）
           ↓ 拆分完成
      书库页（书籍卡片列表，支持多本书）
           ↓ 点击某本书
      存档选择页（最多 4 个存档位，空位显示「新建冒险」）
           ↓ 选择/新建存档
      小说模式主界面（novel-mode.html 那套 UI）
           ↓ 右上角设置按钮
      书籍设置页（见下）
```

---

## 四、书库数据结构

### 存储分层设计

> **重要**：消息历史体积大，不能存 localStorage，采用双层存储避免容量溢出。

| 存储层 | 内容 | Key |
|---|---|---|
| `localStorage["bookList"]` | 所有书的**元数据** + 每个存档位的**最新 STATE** | 单一 key |
| `IndexedDB` | 每个存档位的完整 `messages[]` 对话历史 | `novel_messages_{bookId}_{slotIndex}` |

### localStorage 结构（元数据）

```javascript
// localStorage["bookList"] 存储的单本书结构
{
  id: "book_uuid",
  title: "凡人修仙传",
  coverEmoji: "📖",          // 或上传封面图
  createdAt: 1234567890,
  worldEntries: [...],        // 从 TXT 拆出来的世界书条目，结构同现有 world_entries
  saves: [                    // 最多 4 个存档
    {
      slotIndex: 0,           // 0~3
      label: "存档一",
      createdAt: 1234567890,
      updatedAt: 1234567890,
      chapterTitle: "第十二章 · 坊市奇遇",
      state: { ... },         // 最新的 STATE JSON（见第七节），只存最后一次
      // ❌ 注意：messages 不在这里！messages 存在 IndexedDB
    },
    null,  // 空存档位
    null,
    null,
  ]
}
```

### IndexedDB 读写

```javascript
// 写入消息历史（每次 AI 回复完成后）
await idb.put('novel_messages_{bookId}_{slotIndex}', messages);

// 读取消息历史（进入存档、读档时）
const messages = await idb.get('novel_messages_{bookId}_{slotIndex}');

// 删除存档时同步清理
await idb.delete('novel_messages_{bookId}_{slotIndex}');
```

---

## 五、书籍设置页内容

从小说模式主界面右上角进入，包含：

- **世界书条目**：列表展示，可逐条编辑/删除，可手动新增
- **叙事风格**：下拉选择（武侠 / 仙侠 / 现代 / 末世 / 西幻）
- **难度**：滑块（轻松 / 普通 / 硬核）—— 影响 system prompt 里的死亡/失败概率描述
- **存档管理**：查看4个存档，可删除某个存档
- **危险区**：删除整本书（含所有存档和世界书条目）

---

## 六、AI 输出格式约定（最关键）

小说模式的 system prompt 要求 AI 每次回复末尾附带隐藏 JSON 状态块。

### 6.1 正文格式

纯叙事文本，不输出任何 markdown，段落之间用空行分隔。

### 6.2 末尾隐藏 STATE 块

```
<!--STATE:
{
  "stats": {
    "realm": "练气七层",
    "realmProgress": 68,
    "mana": 78,
    "manaMax": 120,
    "lifespan": 124,
    "lifespanMax": 200,
    "spiritStones": 247
  },
  "items": [
    {"name": "青元剑诀残页", "rarity": "epic"},
    {"name": "寒铁飞剑", "rarity": "rare"},
    {"name": "聚气丹", "count": 3},
    {"name": "储物袋"},
    {"name": "符箓", "count": 12}
  ],
  "npcs": [
    {"name": "墨老", "role": "引路人", "relation": 3, "type": "ally"},
    {"name": "苏茵", "role": "同道", "relation": 2, "type": "ally"},
    {"name": "张铁手", "role": "丹药商", "relation": -2, "type": "enemy"}
  ],
  "location": {"main": "天南坊市", "sub": "东区丹药街"},
  "quests": [
    {"text": "寻找入门宗门，收集推荐书信", "active": true},
    {"text": "查明坊市假药来源", "active": false}
  ],
  "events": [
    {"text": "发现可疑商贩", "type": "info"},
    {"text": "潜在危险", "type": "danger"}
  ],
  "suggestions": ["回头查看来者", "悄悄听掌柜动静", "运转灵力戒备"],
  "chapterTitle": "第十二章 · 坊市奇遇"
}
-->
```

### 6.3 前端解析

```javascript
function parseStateFromResponse(fullText) {
  const match = fullText.match(/<!--STATE:([\s\S]*?)-->/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); }
  catch { return null; }
}

function extractNarrative(fullText) {
  return fullText.replace(/<!--STATE:[\s\S]*?-->/g, '').trim();
}
```

---

## 七、STATE 初始值

新建存档时，用一次 AI 调用生成初始 STATE：
- 传入书籍的世界书条目摘要 + 叙事风格 + 难度
- 让 AI 返回一个符合这个世界观的初始角色状态 JSON
- 存入 `save.state`，作为第一轮的初始值

---

## 八、存档逻辑

- **自动存档**：每次 AI 回复完成后，自动更新当前存档的 `state` 和 `messages`
- **手动存档**：顶栏 🔖 按钮，弹出4个存档位，选择覆盖哪个槽
- **读档**：从存档选择页进入，恢复 `state` 和 `messages`，从上次位置继续

---

## 九、打字机实现要点

```javascript
// 标点后停顿更长，营造节奏感
const pause = (ch === '。' || ch === '？' || ch === '！') ? 80 : 28;

// 每输出5个字滚动一次
if (i % 5 === 0) scrollToBottom();

// 流式接入：每收到一个 SSE chunk 直接追加字符，不要等全部收到再开始
```

---

## 十、行动建议按钮

来自 AI STATE JSON 的 `suggestions` 字段（3条），每轮 AI 回复后更新：

```javascript
function updateSuggestions(texts) {
  const wrap = document.getElementById('suggButtons');
  wrap.style.opacity = '0';
  setTimeout(() => {
    wrap.innerHTML = texts.map(t =>
      `<button class="sugg-btn" onclick="useAction(this)">${t}</button>`
    ).join('') + `<button class="sugg-btn random" onclick="randomAction()">🎲 随机</button>`;
    wrap.style.opacity = '1';
  }, 300);
}
```

---

## 十一、侧边栏状态更新

| STATE 字段 | 侧边栏位置 | 说明 |
|---|---|---|
| `stats.realm` | 境界名称 | 直接替换 |
| `stats.realmProgress` | 进度条宽度 | `width: X%` |
| `stats.mana` | 灵力数值 | 替换 |
| `stats.spiritStones` | 灵石数量 | 替换 |
| `items[]` | 持有物品 | 重新渲染 chip 列表 |
| `npcs[]` | NPC关系 | relation 正数=绿点，负数=红点，绝对值=填充数量 |
| `location` | 当前位置 | 替换 |
| `quests[]` | 任务列表 | active:true 高亮显示 |
| `events[]` | 事件标签 | 追加到当前叙事块末尾 |
| `chapterTitle` | 顶栏章节标题 | 替换 |

---

## 十二、CSS 类名速查（来自 novel-mode.html）

```
.narr-block p          — 普通叙事段落（缩进 2em）
.narr-block p.scene    — 场景描写（颜色偏暗）
.narr-block p.thought  — 内心独白（斜体，颜色偏暖）
.player-act            — 玩家行动块（左边金色竖线）
.ev-tag.info           — 金色事件标签
.ev-tag.danger         — 红色事件标签
.ev-tag.obtain         — 绿色获得标签
.ev-tag.mystery        — 紫色神秘标签
.item-chip             — 普通物品
.item-chip.rare        — 稀有物品（绿色）
.item-chip.epic        — 史诗物品（紫色）
.generating            — 生成中动画（三个跳动圆点）
```

---

## 十三、移动端注意

- 屏幕宽度 ≤ 700px：侧边栏隐藏，底部显示4个导航按钮
- 点「状态」按钮展开侧边栏抽屉（`.sidebar.open`）
- 输入区加 `padding-bottom: 64px` 避免被底栏遮住

---

## 十四、不需要做的事

- ❌ 不需要重建记忆系统（四层记忆已完成，可复用）
- ❌ 不需要重建 API 调用层（复用现有 completions 接口）
- ❌ 不需要新建数据库表（书籍数据存 localStorage）
- ❌ 不需要做地图功能（底栏地图按钮暂时 toast「开发中」）
- ❌ 世界书条目不存 Supabase（直接存在书籍对象里，简单够用）
