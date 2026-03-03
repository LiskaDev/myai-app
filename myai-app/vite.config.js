import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// 🔑 构建后自动注入版本号到 sw.js
function swVersionPlugin() {
  return {
    name: 'sw-version',
    closeBundle() {
      const swPath = resolve('dist/sw.js');
      try {
        let content = readFileSync(swPath, 'utf-8');
        content = content.replace('__BUILD_TIME__', Date.now().toString());
        writeFileSync(swPath, content);
        console.log('[sw-version] ✅ 已注入构建版本号到 sw.js');
      } catch (e) {
        console.warn('[sw-version] ⚠️ sw.js 版本注入失败:', e.message);
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    swVersionPlugin(),
  ],
})
