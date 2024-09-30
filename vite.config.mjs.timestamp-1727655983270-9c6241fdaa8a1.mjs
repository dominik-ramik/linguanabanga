// vite.config.mjs
import AutoImport from "file:///D:/Programy/web/lingo-nabanga/node_modules/unplugin-auto-import/dist/vite.js";
import Components from "file:///D:/Programy/web/lingo-nabanga/node_modules/unplugin-vue-components/dist/vite.js";
import Fonts from "file:///D:/Programy/web/lingo-nabanga/node_modules/unplugin-fonts/dist/vite.mjs";
import Layouts from "file:///D:/Programy/web/lingo-nabanga/node_modules/vite-plugin-vue-layouts/dist/index.mjs";
import Vue from "file:///D:/Programy/web/lingo-nabanga/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import VueRouter from "file:///D:/Programy/web/lingo-nabanga/node_modules/unplugin-vue-router/dist/vite.mjs";
import { VitePWA } from "file:///D:/Programy/web/lingo-nabanga/node_modules/vite-plugin-pwa/dist/index.js";
import Vuetify, { transformAssetUrls } from "file:///D:/Programy/web/lingo-nabanga/node_modules/vite-plugin-vuetify/dist/index.mjs";
import { defineConfig } from "file:///D:/Programy/web/lingo-nabanga/node_modules/vite/dist/node/index.js";
import { fileURLToPath, URL } from "node:url";
var __vite_injected_original_import_meta_url = "file:///D:/Programy/web/lingo-nabanga/vite.config.mjs";
var vite_config_default = defineConfig({
  plugins: [
    VueRouter(),
    Layouts(),
    Vue({
      template: {
        transformAssetUrls,
        compilerOptions: {
          isCustomElement: (tag) => ["x-v-card-header"].includes(tag)
        }
      }
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
      styles: {
        configFile: "src/styles/settings.scss"
      }
    }),
    Components(),
    Fonts({
      google: {
        families: [{
          name: "Roboto",
          styles: "wght@100;300;400;500;700;900"
        }]
      }
    }),
    AutoImport({
      imports: [
        "vue",
        "vue-router"
      ],
      eslintrc: {
        enabled: true
      },
      vueTemplate: true
    }),
    VitePWA({
      injectRegister: null,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.js",
      registerType: null,
      includeAssets: ["assets/*.*"],
      injectManifest: {
        globPatterns: ["assets/*", "favicons/*", "screenshots/*", "data/*.json", "*.{js,css,html,webmanifest}"]
        //, '**/*.{js,css,html,svg,ttf,woof,woof2,eot}', 'assets/*.*'],
      },
      manifest: {
        // caches the assets/icons mentioned (assets/* includes all the assets present in your src/ directory) 
        name: "Lingo Nabanga",
        short_name: "Lingo Nabanga",
        id: "/",
        display_override: ["fullscreen", "minimal-ui"],
        display: "fullscreen",
        start_url: ".",
        background_color: "#3b4997",
        theme_color: "#ffffff",
        icons: [
          {
            src: "/favicons/logo_blue.svg",
            purpose: "any",
            sizes: "any",
            type: "image/svg+xml"
          }
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
      }
    })
  ],
  define: { "process.env": {} },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    },
    extensions: [
      ".js",
      ".json",
      ".jsx",
      ".mjs",
      ".ts",
      ".tsx",
      ".vue"
    ]
  },
  server: {
    port: 3e3,
    host: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubWpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcUHJvZ3JhbXlcXFxcd2ViXFxcXGxpbmdvLW5hYmFuZ2FcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXFByb2dyYW15XFxcXHdlYlxcXFxsaW5nby1uYWJhbmdhXFxcXHZpdGUuY29uZmlnLm1qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovUHJvZ3JhbXkvd2ViL2xpbmdvLW5hYmFuZ2Evdml0ZS5jb25maWcubWpzXCI7Ly8gUGx1Z2luc1xuaW1wb3J0IEF1dG9JbXBvcnQgZnJvbSAndW5wbHVnaW4tYXV0by1pbXBvcnQvdml0ZSdcbmltcG9ydCBDb21wb25lbnRzIGZyb20gJ3VucGx1Z2luLXZ1ZS1jb21wb25lbnRzL3ZpdGUnXG5pbXBvcnQgRm9udHMgZnJvbSAndW5wbHVnaW4tZm9udHMvdml0ZSdcbmltcG9ydCBMYXlvdXRzIGZyb20gJ3ZpdGUtcGx1Z2luLXZ1ZS1sYXlvdXRzJ1xuaW1wb3J0IFZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5pbXBvcnQgVnVlUm91dGVyIGZyb20gJ3VucGx1Z2luLXZ1ZS1yb3V0ZXIvdml0ZSdcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xuaW1wb3J0IFZ1ZXRpZnksIHsgdHJhbnNmb3JtQXNzZXRVcmxzIH0gZnJvbSAndml0ZS1wbHVnaW4tdnVldGlmeSdcblxuLy8gVXRpbGl0aWVzXG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSAnbm9kZTp1cmwnXG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgVnVlUm91dGVyKCksXG4gICAgTGF5b3V0cygpLFxuICAgIFZ1ZSh7XG4gICAgICB0ZW1wbGF0ZToge1xuICAgICAgICB0cmFuc2Zvcm1Bc3NldFVybHMsXG4gICAgICAgIGNvbXBpbGVyT3B0aW9uczoge1xuICAgICAgICAgIGlzQ3VzdG9tRWxlbWVudDogKHRhZykgPT4gWyd4LXYtY2FyZC1oZWFkZXInXS5pbmNsdWRlcyh0YWcpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSxcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vdnVldGlmeWpzL3Z1ZXRpZnktbG9hZGVyL3RyZWUvbWFzdGVyL3BhY2thZ2VzL3ZpdGUtcGx1Z2luI3JlYWRtZVxuICAgIFZ1ZXRpZnkoe1xuICAgICAgYXV0b0ltcG9ydDogdHJ1ZSxcbiAgICAgIHN0eWxlczoge1xuICAgICAgICBjb25maWdGaWxlOiAnc3JjL3N0eWxlcy9zZXR0aW5ncy5zY3NzJyxcbiAgICAgIH0sXG4gICAgfSksXG4gICAgQ29tcG9uZW50cygpLFxuICAgIEZvbnRzKHtcbiAgICAgIGdvb2dsZToge1xuICAgICAgICBmYW1pbGllczogW3tcbiAgICAgICAgICBuYW1lOiAnUm9ib3RvJyxcbiAgICAgICAgICBzdHlsZXM6ICd3Z2h0QDEwMDszMDA7NDAwOzUwMDs3MDA7OTAwJyxcbiAgICAgICAgfV0sXG4gICAgICB9LFxuICAgIH0pLFxuICAgIEF1dG9JbXBvcnQoe1xuICAgICAgaW1wb3J0czogW1xuICAgICAgICAndnVlJyxcbiAgICAgICAgJ3Z1ZS1yb3V0ZXInLFxuICAgICAgXSxcbiAgICAgIGVzbGludHJjOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgdnVlVGVtcGxhdGU6IHRydWUsXG4gICAgfSksXG4gICAgVml0ZVBXQSh7XG4gICAgICBpbmplY3RSZWdpc3RlcjogbnVsbCxcbiAgICAgIHN0cmF0ZWdpZXM6ICdpbmplY3RNYW5pZmVzdCcsXG4gICAgICBzcmNEaXI6ICdzcmMnLFxuICAgICAgZmlsZW5hbWU6ICdzZXJ2aWNlLXdvcmtlci5qcycsXG4gICAgICByZWdpc3RlclR5cGU6IG51bGwsXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbJ2Fzc2V0cy8qLionXSxcbiAgICAgIGluamVjdE1hbmlmZXN0OiB7XG4gICAgICAgIGdsb2JQYXR0ZXJuczogWydhc3NldHMvKicsICdmYXZpY29ucy8qJywgJ3NjcmVlbnNob3RzLyonLCAnZGF0YS8qLmpzb24nLCAnKi57anMsY3NzLGh0bWwsd2VibWFuaWZlc3R9J10gLy8sICcqKi8qLntqcyxjc3MsaHRtbCxzdmcsdHRmLHdvb2Ysd29vZjIsZW90fScsICdhc3NldHMvKi4qJ10sXG4gICAgICB9LFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgLy8gY2FjaGVzIHRoZSBhc3NldHMvaWNvbnMgbWVudGlvbmVkIChhc3NldHMvKiBpbmNsdWRlcyBhbGwgdGhlIGFzc2V0cyBwcmVzZW50IGluIHlvdXIgc3JjLyBkaXJlY3RvcnkpIFxuICAgICAgICBuYW1lOiAnTGluZ28gTmFiYW5nYScsXG4gICAgICAgIHNob3J0X25hbWU6ICdMaW5nbyBOYWJhbmdhJyxcbiAgICAgICAgaWQ6IFwiL1wiLFxuICAgICAgICBkaXNwbGF5X292ZXJyaWRlOiBbXCJmdWxsc2NyZWVuXCIsIFwibWluaW1hbC11aVwiXSxcbiAgICAgICAgZGlzcGxheTogXCJmdWxsc2NyZWVuXCIsXG4gICAgICAgIHN0YXJ0X3VybDogJy4nLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnIzNiNDk5NycsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnI2ZmZmZmZicsXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnL2Zhdmljb25zL2xvZ29fYmx1ZS5zdmcnLFxuICAgICAgICAgICAgcHVycG9zZTogJ2FueScsXG4gICAgICAgICAgICBzaXplczogXCJhbnlcIixcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9zdmcreG1sJ1xuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIHNjcmVlbnNob3RzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiBcInNjcmVlbnNob3RzL3NjcmVlbnNob3QtbW9iaWxlLndlYnBcIixcbiAgICAgICAgICAgIHNpemVzOiBcIjcyMHgxMjgwXCIsXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3dlYnBcIixcbiAgICAgICAgICAgIGxhYmVsOiBcIkxpbmdvIE5hYmFuZ2FcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiBcInNjcmVlbnNob3RzL3NjcmVlbnNob3QtZGVza3RvcC53ZWJwXCIsXG4gICAgICAgICAgICBzaXplczogXCIxMjgweDcyMFwiLFxuICAgICAgICAgICAgdHlwZTogXCJpbWFnZS93ZWJwXCIsXG4gICAgICAgICAgICBmb3JtX2ZhY3RvcjogXCJ3aWRlXCIsXG4gICAgICAgICAgICBsYWJlbDogXCJMaW5nbyBOYWJhbmdhXCJcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgfSksXG4gIF0sXG4gIGRlZmluZTogeyAncHJvY2Vzcy5lbnYnOiB7fSB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpXG4gICAgfSxcbiAgICBleHRlbnNpb25zOiBbXG4gICAgICAnLmpzJyxcbiAgICAgICcuanNvbicsXG4gICAgICAnLmpzeCcsXG4gICAgICAnLm1qcycsXG4gICAgICAnLnRzJyxcbiAgICAgICcudHN4JyxcbiAgICAgICcudnVlJyxcbiAgICBdLFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiAzMDAwLFxuICAgIGhvc3Q6IHRydWVcbiAgfSxcbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQ0Es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
