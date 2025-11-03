import { computed } from 'vue'

import { createI18n } from 'vue-i18n'

//import translations
import en from './locales/en.json'
import fr from './locales/fr.json'
import cz from './locales/cz.json'

const SUPPORTED_LOCALES = [
    {
        code: 'en',
        name: 'English',
        messages: en
    },
    {
        code: 'fr',
        name: 'Français',
        messages: fr
    },
    {
        code: 'cz',
        name: 'Česky',
        messages: cz
    }
]

export function inferLocale() {
    let persistedLocale = getPersistedLocale()

    if (isLocaleSupported(persistedLocale)) {
        return persistedLocale
    }
    else {
        let userLocale = getUserLocale()
        if (isLocaleSupported(userLocale)) {
            return userLocale
        }
    }

    return i18n.global.fallbackLocale.value
}

function getUserLocale() {
    const locale = window.navigator.language ||
        window.navigator.userLanguage ||
        i18n.fallbackLocale

    return locale.split('-')[0]
}

function getPersistedLocale() {
    const persistedLocale = localStorage.getItem("user-locale")
    if (isLocaleSupported(persistedLocale)) {
        return persistedLocale
    } else {
        return undefined
    }
}

export function isLocaleSupported(locale) {
    if(!locale){
        return false
    }

    return supportedLocales.value.includes(locale)
}

export const supportedLocales = computed(() => {
    return SUPPORTED_LOCALES.map((locale) => locale.code)
})

export const localeMessages = computed(() => {
    let messages = {}

    SUPPORTED_LOCALES.forEach((locale) => {
        messages[locale.code] = locale.messages
    })

    return messages
})

export function setLocale(newLocale) {
    if (isLocaleSupported(newLocale)) {
        localStorage.setItem("user-locale", newLocale)
        i18n.global.locale.value = newLocale

        document.title = i18n.global.t("appName")
    }
    else {
        console.warn("Trying to set unsupported locale " + newLocale)
    }
}

export const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    legacy: false,
    mode: "composition",
    globalInjection: true,
    messages: localeMessages.value
});