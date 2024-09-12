import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { i18n } from "@/i18n";
import { useStorage } from "@vueuse/core";
import { useTheme } from "vuetify";


export const useAppSettingsStore = defineStore('appSettings', () => {
  const uiLang = i18n.global.locale

  const theme = useTheme();
  const uiTheme = useStorage("ui-theme", "system", localStorage)
  const uiThemeIsDark = ref(false)

  applyGeneralTheme(uiTheme.value)

  function applySpecificTheme(themeName) {
    switch (themeName) {
      case "light":
        theme.global.name.value = "nabangaLight";
        uiThemeIsDark.value = false
        break;
      case "dark":
        theme.global.name.value = "nabangaDark";
        uiThemeIsDark.value = true
        break;
      default:
        break;
    }
  }

  function applyGeneralTheme(themeName) {
    switch (themeName) {
      case "light":
        applySpecificTheme("light")
        break;
      case "dark":
        applySpecificTheme("dark")
        break;
      case "system":
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          applySpecificTheme("dark")
        }
        else {
          applySpecificTheme("light")
        }
        break;

      default:
        break;
    }
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (uiTheme.value === "system") {
      applyGeneralTheme(uiTheme.value)
    }
  });

  watch(
    () => uiTheme.value,
    (newValue) => {
      applyGeneralTheme(newValue)
    }
  );

  const colorFullMatch = computed(() => {
    return "rgba(var(--v-theme-error), " + (uiThemeIsDark.value ? "0.7" : "0.3") + ")"
  });
  
  const colorPartialMatch = computed(() => {
    return "rgba(var(--v-theme-warning), " + (uiThemeIsDark.value ? "0.7" : "0.3") + ")"
  });

  return { uiLang, uiTheme, uiThemeIsDark, colorFullMatch, colorPartialMatch }
})