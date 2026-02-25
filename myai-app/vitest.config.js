import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
    plugins: [vue()],
    test: {
        // 使用 jsdom 模拟浏览器环境
        environment: 'jsdom',

        // 全局 API（describe, it, expect 无需导入）
        globals: true,

        // 测试文件匹配模式
        include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],

        // 覆盖率配置
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/**/*.{js,vue}'],
            exclude: ['src/**/*.test.js', 'src/**/*.spec.js', 'node_modules'],
            // 🛡️ 覆盖率阈值 - 随测试增加逐步提高
            thresholds: {
                lines: 3,
                functions: 3,
                branches: 2,
                statements: 3,
            },
        },

        // 设置别名
        alias: {
            '@': path.resolve(__dirname, './src'),
        },

        // 模拟 localStorage 和其他浏览器 API
        setupFiles: [path.resolve(__dirname, './tests/setup.js')],
    },
});
