import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  root: './src/vue', // 指定项目根目录，默认为当前工作目录
  build: {
    rollupOptions: {
      input: 'src/vue/index.html' // 指定入口文件路径
    },
    outDir: './asset/vue', // 指定输出目录
    sourcemap: false // 是否生成 sourcemap 文件
  },
  server: {
    port: 8080, // 指定端口号，按需修改
    cors: true // 允许跨域
  }
})
