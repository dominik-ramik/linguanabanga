/**
 * Service worker registration - and that is all the page does about app updates.
 *
 * How an update reaches the user (the whole flow):
 *
 *  1. The browser looks for a new service-worker.js when a page in scope is loaded (and registerServiceWorker() asks once
 *     explicitly, see below).
 *  2. A changed worker installs in the background. It becomes "installed" only after its complete precache is downloaded.
 *  3. The new worker takes over on its own (skipWaiting() in its `install` handler, clients.claim() in `activate`) - it never
 *     waits for tabs to close, and the old worker never holds it back (see holdWhile() in service-worker.js).
 *  4. Pages that are already open are NOT touched: no prompt, no banner, no automatic reload, no polling.
 *     The next time the user reloads the page or closes and reopens the app, the new version is served.
 *
 * Because step 3 does not depend on any page code, there is no "update available" state that could get stuck or come back.
 */

export function registerServiceWorker(url = '/service-worker.js') {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null)

    // updateViaCache 'none': never let an HTTP cache (host/CDN headers) hide a new worker script.
    return navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' }).then((registration) => {
        // Browsers already look for a new worker when a page is loaded; asking once explicitly makes that deterministic across
        // browsers. It is one conditional request for the script per page load - not polling. (Safe to delete if unwanted.)
        registration.update().catch(() => { /* first install, offline or server hiccup: the next page load tries again */ })
        return registration
    }).catch((err) => {
        console.error('Service worker registration failed', err)
        return null
    })
}
