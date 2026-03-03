---
description: 推送更新到 GitHub + Vercel + Cloudflare Pages（三平台同步部署）
---

# 推送更新流程

用户说"推送"时，按以下步骤执行：

## 1. 运行测试
// turbo
```bash
npx vitest run
```
确认所有测试通过。

## 2. 构建生产版本
// turbo
```bash
npx vite build
```
工作目录: `c:\Users\ALan\Desktop\MyAI_RolePlay\myai-app`

## 3. 暂存文件
// turbo
```bash
git add -u
```
- 使用 `git add -u` 只添加已跟踪文件的修改（不包含新增的未跟踪文件）
- 如果用户明确说要包含新文件，改用 `git add -A -- ':!style/'`（排除 style 文件夹）
- **永远排除 `style/` 文件夹**，除非用户明确要求包含

工作目录: `c:\Users\ALan\Desktop\MyAI_RolePlay`

## 4. 提交
```bash
git commit -m "描述性的提交信息"
```
提交信息用中文，格式如 `feat:` / `fix:` / `refactor:` 开头。

工作目录: `c:\Users\ALan\Desktop\MyAI_RolePlay`

## 5. 推送到 GitHub（同时触发 Cloudflare Pages 自动部署）
```bash
git push
```
- GitHub 收到推送后，**Cloudflare Pages 会自动检测并重新构建部署**
- 无需手动操作 Cloudflare

工作目录: `c:\Users\ALan\Desktop\MyAI_RolePlay`

## 6. 部署到 Vercel
```bash
npx vercel --prod --yes
```
- 与 git push 同时执行（并行）
- 等待完成确认

工作目录: `c:\Users\ALan\Desktop\MyAI_RolePlay`

## 部署结果

推送完成后，三个平台会同步更新：

| 平台 | 链接 | 更新方式 |
|------|------|----------|
| **GitHub** | github.com/LiskaDev/myai-app | `git push` 直接更新 |
| **Cloudflare Pages** | myai-app.pages.dev | GitHub 推送后自动部署（国内可访问） |
| **Vercel** | myai-app-eight.vercel.app | `npx vercel --prod` 手动触发 |

## 注意事项
- 永远排除 `style/` 文件夹
- 测试必须全部通过才能推送
- 构建必须成功才能推送
- 报告格式：`**已推送** ✅ {commit hash} — {描述}（{N} tests pass）`
