import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { version } from '@/../package.json'
import { normalizeURLPathname } from '@/utils/normalizeURLPathname.js'

const DATA_JSON_CACHE = "data-json"
const DATA_ASSETS_CACHE = "data-assets"
const OTHER_ASSETS_CACHE = "other-assets"
const GOOGLE_APIS_CACHE = "google-apis"

const VERSION = version
console.log("version", VERSION)

self.addEventListener('install', function (event) {
    event.waitUntil(self.skipWaiting()); // Activate worker immediately
    //console.log("SW installed")
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim()); // Become available to all pages
    //console.log("SW activated")
});

cleanupOutdatedCaches()

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(new NavigationRoute(
    createHandlerBoundToURL('index.html'),
))

registerRoute(({ url }) => {
    return url.pathname.endsWith("/data/data.json");
}, new StaleWhileRevalidate(
    {
        cacheName: DATA_JSON_CACHE,
        cacheableResponse: {
            statuses: [0, 200],
        },
    }
));

registerRoute(({ url, request, event }) => {
    return url.pathname.startsWith("/") && !url.pathname.startsWith("/data");
}, new CacheFirst(
    {
        cacheName: OTHER_ASSETS_CACHE,
        cacheableResponse: {
            statuses: [0, 200],
        },
    }
));

registerRoute(({ url, request, event }) => {
    return url.pathname.startsWith("/data/") && !url.pathname.endsWith("/data.json");
}, new CacheFirst(
    {
        cacheName: DATA_ASSETS_CACHE,
        cacheableResponse: {
            statuses: [0, 200],
        },
    }
));

registerRoute('https://fonts.googleapis.com/(.*)',
    new CacheFirst({
        cacheName: GOOGLE_APIS_CACHE,
        cacheExpiration: {
            maxEntries: 30
        },
        cacheableResponse: { statuses: [0, 200] }
    })
);

let communicationPort;

//Save reference to port
self.addEventListener('message', function (message) {
    if (message.data && message.data.type === 'PORT_INITIALIZATION') {
        //Initialize communication port on request from the page
        communicationPort = message.ports[0];
    } else if (message.data && message.data.type == "GET_CACHED_ASSETS") {
        //Return all the properly cached (code 200) items from DATA_ASSETS_CACHE
        getCachedUrls(DATA_ASSETS_CACHE).then((urls) => {
            communicationPort.postMessage({ type: 'CACHED_ASSETS', assets: urls });
        })
    } else if (message.data && message.data.type == "CLEAR_DATA_ASSETS") {
        caches.delete(DATA_ASSETS_CACHE);
        communicationPort.postMessage({ type: 'DATA_ASSETS_CLEARED' });
    }
});

async function getCachedUrls(cacheName) {
    return (await (await caches.open(cacheName)).keys()).map(i => normalizeURLPathname(location.origin, i.url))
}