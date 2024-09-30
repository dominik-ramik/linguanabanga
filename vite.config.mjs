// Plugins
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Fonts from 'unplugin-fonts/vite'
import Layouts from 'vite-plugin-vue-layouts'
import Vue from '@vitejs/plugin-vue'
import VueRouter from 'unplugin-vue-router/vite'
import { VitePWA } from 'vite-plugin-pwa';
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// Utilities
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    VueRouter(),
    Layouts(),
    Vue({
      template: {
        transformAssetUrls,
        compilerOptions: {
          isCustomElement: (tag) => ['x-v-card-header'].includes(tag)
        }
      }
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    Components(),
    Fonts({
      google: {
        families: [{
          name: 'Roboto',
          styles: 'wght@100;300;400;500;700;900',
        }],
      },
    }),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
      ],
      eslintrc: {
        enabled: true,
      },
      vueTemplate: true,
    }),
    VitePWA({
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.js',
      registerType: null,
      includeAssets: ['assets/*.*'],
      injectManifest: {
        globPatterns: ['assets/*', 'favicons/*', 'screenshots/*', 'data/*.json', '*.{js,css,html,webmanifest}'], //, '**/*.{js,css,html,svg,ttf,woof,woof2,eot}', 'assets/*.*'],
        maximumFileSizeToCacheInBytes: 100000000, //100mb file limit
      },
      manifest: {
        // caches the assets/icons mentioned (assets/* includes all the assets present in your src/ directory) 
        name: 'Lingo Nabanga',
        short_name: 'Lingo Nabanga',
        id: "/",
        display_override: ["fullscreen", "minimal-ui"],
        display: "fullscreen",
        start_url: '.',
        background_color: '#3b4997',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/favicons/logo_blue.svg',
            purpose: 'any',
            sizes: "any",
            type: 'image/svg+xml'
          },
        ],
        screenshots: [
          {
            src: "screenshots/screenshot-mobile.webp",
            sizes: "720x1280",
            type: "image/webp",
            label: "Lingo Nabanga"
          },
          {
            src: "screenshots/screenshot-desktop.webp",
            sizes: "1280x720",
            type: "image/webp",
            form_factor: "wide",
            label: "Lingo Nabanga"
          }
        ]
      },
    }),
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 3000,
    host: true
  },
})
