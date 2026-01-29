# MyAI-RolePlay v2.0 升级计划

## 📋 升级概览

将现有 v1.0 升级到 v2.0，实现**简易酒馆风格**的视觉重构和**三层记忆系统**的核心逻辑升级。

***

## 🎨 视觉重构（简易酒馆风格）

### 1. 全屏背景系统

* 移除白色/渐变背景，改为固定全屏背景图片

* 在设置面板新增 `Background URL` 输入框

* 默认提供二次元风景图 URL

### 2. 磨砂玻璃效果（Glassmorphism）

* 聊天气泡：`backdrop-filter: blur(12px)` + 半透明背景

* 设置面板：`backdrop-filter: blur(16px)` + 半透明背景

* 输入栏：`backdrop-filter: blur(12px)` + 半透明背景

* 确保文字可读性：使用 `text-shadow` 和合适的对比度

### 3. 头像系统

* 在设置面板新增 `User Avatar URL` 和 `AI Avatar URL` 输入框

* 在聊天气泡旁显示圆形头像（40x40px）

* 支持自定义头像图片 URL

***

## 🧠 核心逻辑升级（三层记忆系统）

### Layer 1: 固定层（不可移动）

* **System Prompt**（人设）- 已有

* **Style Guide**（风格指导）- 新增，用于控制聊天风格/话题限制

### Layer 2: 手动记忆层（永远不被截断）

* **Story Summary**（剧情摘要）- 新增，用于记录关键剧情

### Layer 3: 滑动窗口层（动态截取）

* 倒序截取最近 N 条对话（默认 15 轮）

* 超出部分自动丢弃

### 核心函数：`constructPrompt()`

实现三层记忆的拼接逻辑，确保：

* Layer 1 和 Layer 2 始终保留

* Layer 3 动态滑动窗口

* 防止 Token 溢出

***

## 💾 持久化升级

所有新设置自动存入 localStorage：

* `backgroundUrl`

* `userAvatarUrl`

* `aiAvatarUrl`

* `styleGuide`

* `storySummary`

***

## 🔧 技术实现

### 前端（`templates/index.html`）

1. 更新 HTML 结构，添加背景层和头像元素
2. 使用 Tailwind 实现磨砂玻璃效果
3. 在设置面板新增 5 个输入字段
4. 实现 `constructPrompt()` 函数
5. 更新 localStorage 读写逻辑

### 后端（`main.py`）

* 保持现有流式响应逻辑

* 如需要，微调 CORS 配置

***

## ✅ 实施步骤

1. **Step 1**: 重构 HTML & CSS（UI 框架）

   * 添加全屏背景层

   * 实现磨砂玻璃效果

   * 添加头像布局

   * 扩展设置面板

2. **Step 2**: 升级 Vue 3 Logic（Setup 函数）

   * 实现 `constructPrompt()` 函数

   * 更新 localStorage 读写逻辑

   * 集成三层记忆系统

3. **Step 3**: 运行指南

   * 启动命令

   * 配置说明

***

## 📝 注意事项

* 保持向后兼容（现有设置继续有效）

* 确保在深色/复杂背景上的文字可读性

* 优化移动端体验

* 保持流式响应的流畅性

