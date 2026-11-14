import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('locale selection follows the loaded dictionary languages', async () => {
    const storage = new Map()
    globalThis.localStorage = {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
    }
    globalThis.window = { navigator: { language: 'fr-FR' } }

    const server = await createServer({
        configFile: false,
        resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
        server: { middlewareMode: true },
        appType: 'custom',
        logLevel: 'silent',
    })

    try {
        const { inferLocale, isLocaleSupported } =
            await server.ssrLoadModule('/src/i18n/index.js')
        const { reloadDictionary } = await server.ssrLoadModule('/src/composables/useDictionary.js')
        const dictionary = (languages, defaultLocale, versions = languages) => ({
            general: {
                supportedLanguages: languages.map((code) => ({ code })),
                defaultLanguageVersion: defaultLocale,
            },
            versions: Object.fromEntries(versions.map((code) => [
                code, { portalMeta: { sheetDataDetails: [] }, tables: [] },
            ])),
        })

        assert.equal(inferLocale(), 'fr')
        storage.set('user-locale', 'fr')
        reloadDictionary(dictionary(['en'], 'en'))
        assert.equal(isLocaleSupported('fr'), false)
        assert.equal(inferLocale(), 'en')

        reloadDictionary(dictionary(['en', 'fr'], 'en'))
        assert.equal(inferLocale(), 'fr')
        storage.set('user-locale', 'en')
        assert.equal(inferLocale(), 'en')

        storage.clear()
        window.navigator.language = 'de-DE'
        reloadDictionary(dictionary(['fr', 'en'], 'fr'))
        assert.equal(inferLocale(), 'fr')
        reloadDictionary(dictionary(['en', 'fr'], 'fr', ['en']))
        assert.equal(inferLocale(), 'en')
    } finally {
        await server.close()
        delete globalThis.localStorage
        delete globalThis.window
    }
})
