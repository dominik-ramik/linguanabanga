import { ref, computed, watch, onScopeDispose } from 'vue'
import { useGlobalMessageChannel } from '@/composables/useGlobalMessageChannel.js';

export function useAssetsCacheManagement(langCodeRef, selectedProjectsRef, preloadableAssetsRef) {

    const langCode = ref(langCodeRef)
    const selectedProjects = ref(selectedProjectsRef)
    const preloadableAssets = ref(preloadableAssetsRef)

    const currentlyCachedAssets = ref(null)
    const queueBeingProcessed = ref(false)

    const queue = ref([])
    const queueLengthBeforeProcessed = ref(0)
    const downloadProgressRaw = ref(0)

    const mc = useGlobalMessageChannel(); // { port1, port2 }

    // --- Auto Offline Ready toggle (persisted to localStorage) ---
    function getAutoOfflineReadyFromStorage() {
        const v = localStorage.getItem('autoOfflineReady');
        if (v === null) return true;
        return v === 'true';
    }

    const autoOfflineReady = ref(getAutoOfflineReadyFromStorage())

    // --- Helper: send a message to the service worker ---
    function sendToSW(msgType, extra = {}) {
        try {
            navigator.serviceWorker.ready.then((registration) => {
                if (registration && registration.active) {
                    registration.active.postMessage({
                        type: msgType,
                        selectedProjects: selectedProjects.value,
                        preloadableAssets: preloadableAssets.value,
                        languageVersion: langCode.value,
                        autoOfflineReady: autoOfflineReady.value,
                        ...extra
                    });
                }
            });
        } catch (ex) {
            console.log("Error sending " + msgType + " to SW", ex);
        }
    }

    // --- Watch selectedProjects AND preloadableAssets ---
    // immediate: true so that after a page refresh the SW is told to resume
    watch(
        [() => selectedProjects.value, () => preloadableAssets.value],
        ([projects, assets]) => {
            if (!assets?.length) return; // dictionary data not loaded yet
            sendToSW("NG_PROJECTS_CHANGED");

            if (currentlyCachedAssets.value == null) {
                getCachedAssets()
            } else {
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
            }
        },
        { immediate: true }
    )

    // --- Watch autoOfflineReady toggle ---
    watch(
        () => autoOfflineReady.value,
        (newVal) => {
            localStorage.setItem('autoOfflineReady', String(newVal));
            if (!preloadableAssets.value?.length) return;
            // Trigger full reconcile; the SW respects the autoOfflineReady flag
            // to decide whether to actually download or just promote/demote.
            sendToSW("NG_CACHE_ASSETS");
        }
    )

    function allNeededAssets() {
        const currentlyCachedAssetsAsSet = new Set(
            currentlyCachedAssets.value == null
                ? []
                : currentlyCachedAssets.value.filter(Boolean).map(i => i.path)
        )

        let result = (preloadableAssets.value || []).filter((asset) => {
            if (!(langCode.value in asset.refs)) {
                return false
            }

            if (!asset.refs[langCode.value]?.some(item => selectedProjects.value.includes(item))) {
                return false
            }

            if (currentlyCachedAssetsAsSet.has(asset.path)) {
                return false
            }

            return true
        });

        return result
    }

    async function getCachedAssets() {
        try {
            navigator.serviceWorker.ready.then((registration) => {
                if (registration && registration.active) {
                    registration.active.postMessage({
                        type: "GET_CACHED_ASSETS",
                    });
                }
            });
        } catch (ex) {
            console.log("Error getting cached assets", ex);
        }
    }

    let initialAssetsLoadingInterval = setInterval(() => {
        getCachedAssets()
    }, 1000)

    // Listen to messages from SW via global message channel
    // Use addEventListener (not onmessage) so multiple listeners can coexist
    function handleSWMessage(message) {
        switch (message.data.type) {
            case "CACHED_ASSETS":
                clearInterval(initialAssetsLoadingInterval)
                currentlyCachedAssets.value = message.data.assets.map(url =>
                    preloadableAssets.value?.find((asset => asset.path === url))
                );
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                break;
            case "DATA_ASSETS_CLEARED":
                currentlyCachedAssets.value = []
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                break;
            case "NG_CACHE_INITIATED":
                queueBeingProcessed.value = true;
                break;
            case "NG_CACHE_PROGRESS":
                downloadProgressRaw.value = ((message.data.processed || 0) / (message.data.total || 1)) * 100;
                if ((message.data.processed || 0) > 0 && (message.data.processed === message.data.total)) {
                    getCachedAssets();
                }
                break;
            case "NG_CACHE_COMPLETED":
                queueBeingProcessed.value = false;
                queueLengthBeforeProcessed.value = 0;
                downloadProgressRaw.value = 100;
                getCachedAssets();
                break;
            case "NG_CACHE_INCOMPLETE":
                queueBeingProcessed.value = false;
                getCachedAssets();
                break;
            case "NG_CACHE_STORAGE_FULL":
                queueBeingProcessed.value = false;
                console.error("SW reported storage full during caching");
                break;
            case "CACHE_ASSETS_PROGRESS":
                // legacy message
                downloadProgressRaw.value = message.data.progress || 0;
                currentlyCachedAssets.value = (message.data.cached || []).map(url =>
                    preloadableAssets.value?.find((asset => asset.path === url))
                );
                break;
            case "CACHE_ASSETS_DONE":
                queueBeingProcessed.value = false;
                queueLengthBeforeProcessed.value = 0;
                getCachedAssets();
                break;
            default:
                break;
        }
    }

    mc.port1.addEventListener('message', handleSWMessage);

    // Cleanup on scope disposal
    onScopeDispose(() => {
        mc.port1.removeEventListener('message', handleSWMessage);
        clearInterval(initialAssetsLoadingInterval);
    });

    const downloadProgress = computed(() => {
        return typeof downloadProgressRaw.value === 'number' ? downloadProgressRaw.value : 0;
    })

    const requiredDownloadSize = computed(() => {
        if (!queue?.value) {
            return 0
        }

        let size = 0
        queue.value.forEach(asset => {
            size += asset.size || 0
        })

        size = size / 1024 / 1024;
        return size
    });

    return {
        queue,
        autoOfflineReady,
        downloadProgress,
        currentlyCachedAssets,
        requiredDownloadSize,
        queueBeingProcessed,
    }
}
