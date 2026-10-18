import { ref, computed } from 'vue'

/**
 * App-code updates through the service worker.
 *
 * A new service worker installs in the background and then WAITS until every page it would replace is closed, so a plain
 * reload never picks it up. This module makes the update predictable:
 *
 *  1. While the app is open it checks for a new version every 30 min, when the tab becomes visible and when the network
 *     returns, and shows a prompt as soon as a new version is installed (see UpdateSnackbar.vue).
 *  2. "Reload" tells the waiting worker to take over (message SKIP_WAITING, handled in service-worker.js) and reloads once
 *     it is in control.
 *  3. If the user ignores the prompt, the update is applied at the latest on the NEXT PAGE LOAD: before the app mounts,
 *     applyWaitingUpdateOnStartup() activates the waiting worker and reloads, so the user never lands in an old version
 *     twice. (An update that is still downloading at that moment is applied/prompted as soon as it has installed.)
 */

const RELOAD_GUARD_KEY = 'ln-sw-update-reload-at'   // sessionStorage: prevents reload loops
const RELOAD_GUARD_MS = 15000
const CHECK_EVERY_MS = 30 * 60 * 1000
const MIN_CHECK_GAP_MS = 60 * 1000
const APPLY_TIMEOUT_MS = 4000

const updateReady = ref(false)    // a new version is installed and waiting (or already active, see onControllerChange)
const dismissed = ref(false)      // the user chose "Later" for this version
const isApplying = ref(false)

let registration = null
let waitingWorker = null
let hadController = false         // was this page controlled by a service worker when it started?
let applying = false              // we asked a worker to take over and expect a controllerchange
let reloading = false
let lastCheckAt = 0
let lifecycleReady = false
let checksStarted = false

function reloadPage() {
    if (reloading) return
    reloading = true
    try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())) } catch (e) { /* ignore */ }
    window.location.reload()
}

function recentlyReloadedForUpdate() {
    try { return Date.now() - Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0) < RELOAD_GUARD_MS } catch (e) { return false }
}

function onControllerChange() {
    if (!hadController) {            // very first install: the new worker just claimed a page that had none. Not an update.
        hadController = true
        return
    }
    if (applying) {                  // we asked for it: reload into the new version (once)
        reloadPage()
        return
    }
    // Another tab applied an update. This page still runs the old code under the new worker, so offer a reload.
    waitingWorker = null
    dismissed.value = false
    updateReady.value = true
}

function initLifecycle() {
    if (lifecycleReady || !('serviceWorker' in navigator)) return
    lifecycleReady = true
    hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
}

function setWaiting(worker) {
    if (waitingWorker !== worker) {
        waitingWorker = worker
        dismissed.value = false      // a new version deserves a new prompt
    }
    updateReady.value = true
}

function trackWorker(worker) {
    if (!worker) return
    const onState = () => {
        // "installed" with an existing controller = an update (without a controller it is just the first install)
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker)
        else if (worker.state === 'redundant' && waitingWorker === worker) {
            waitingWorker = null
            updateReady.value = false
        }
    }
    worker.addEventListener('statechange', onState)
    onState()
}

function waitUntilInstalled(worker, timeoutMs) {
    return new Promise((resolve) => {
        if (worker.state === 'installed') return resolve(worker)
        const finish = (value) => { clearTimeout(timer); worker.removeEventListener('statechange', onState); resolve(value) }
        const onState = () => {
            if (worker.state === 'installed') finish(worker)
            else if (worker.state === 'redundant') finish(null)
        }
        const timer = setTimeout(() => finish(null), timeoutMs)
        worker.addEventListener('statechange', onState)
    })
}

function activate(worker, timeoutMs) {
    applying = true
    return new Promise((resolve) => {
        const timer = setTimeout(() => { applying = false; resolve(false) }, timeoutMs)
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(true) }, { once: true })
        worker.postMessage({ type: 'SKIP_WAITING' })
    })
}

/**
 * Call before mounting the app. Resolves true when an update was applied and a reload is underway (do not mount),
 * false when the app should start normally.
 */
export function applyWaitingUpdateOnStartup({ installTimeoutMs = 1500, activateTimeoutMs = 3000 } = {}) {
    if (!('serviceWorker' in navigator)) return Promise.resolve(false)
    initLifecycle()
    // Nothing to replace on a first visit; and never reload twice in a row for an update (guards against loops)
    if (!navigator.serviceWorker.controller || recentlyReloadedForUpdate()) return Promise.resolve(false)

    return navigator.serviceWorker.getRegistration().then(async (reg) => {
        if (!reg) return false
        let worker = reg.waiting
        if (!worker && reg.installing) worker = await waitUntilInstalled(reg.installing, installTimeoutMs)
        if (!worker) return false
        return activate(worker, activateTimeoutMs)
    }).catch(() => false)
}

export function checkForUpdate(force = false) {
    if (!registration || navigator.onLine === false) return
    const now = Date.now()
    if (!force && now - lastCheckAt < MIN_CHECK_GAP_MS) return
    lastCheckAt = now
    registration.update().catch(() => { /* offline or server hiccup: try again later */ })
}

function startUpdateChecks() {
    if (checksStarted) return
    checksStarted = true
    // Navigations inside this SPA never ask the browser to look for a new worker, so do it explicitly
    setInterval(() => checkForUpdate(), CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate() })
    window.addEventListener('online', () => checkForUpdate())
}

/** Registers the service worker and starts tracking updates. Resolves with the registration (or null). */
export function registerServiceWorker(url = '/service-worker.js') {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null)
    initLifecycle()
    // updateViaCache 'none': never let an HTTP cache (host/CDN headers) hide a new worker script
    return navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' }).then((reg) => {
        registration = reg
        trackWorker(reg.waiting)
        trackWorker(reg.installing)
        reg.addEventListener('updatefound', () => trackWorker(reg.installing))
        startUpdateChecks()
        return reg
    }).catch((err) => {
        console.error('Service worker registration failed', err)
        return null
    })
}

function applyUpdate() {
    if (isApplying.value) return
    if (!waitingWorker) {            // the new worker is already in control (applied from another tab): just reload
        reloadPage()
        return
    }
    isApplying.value = true
    applying = true
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    setTimeout(() => {               // nothing happened (worker vanished?): give the button back
        if (!reloading) { isApplying.value = false; applying = false }
    }, APPLY_TIMEOUT_MS)
}

function dismiss() {
    dismissed.value = true
}

export function useServiceWorkerUpdate() {
    return {
        updateReady,
        isApplying,
        showPrompt: computed(() => updateReady.value && !dismissed.value),
        applyUpdate,
        dismiss,
        checkForUpdate,
    }
}
