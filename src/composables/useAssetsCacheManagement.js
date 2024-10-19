import { ref, computed, watch } from 'vue'

export function useAssetsCacheManagement(langCodeRef, selectedProjectsRef, preloadableAssetsRef, messageChannelRef) {

    const langCode = ref(langCodeRef)
    const selectedProjects = ref(selectedProjectsRef)
    const preloadableAssets = ref(preloadableAssetsRef)
    const messageChannel = ref(messageChannelRef)

    const currentlyCachedAssets = ref(null)

    const processQueue = ref(false)
    const queueBeingProcessed = ref(false)

    const queue = ref([])
    const queueLengthBeforeProcessed = ref(0)

    watch(
        () => selectedProjects.value,
        () => {
            if (currentlyCachedAssets.value == null) {
                getCachedAssets()
            }

            queue.value = allNeededAssets()
            queueLengthBeforeProcessed.value = queue.value.length
        }
    )

    watch(
        () => processQueue.value,
        (newValue) => {
            if (newValue == true) {
                if (queue.value.length > 0 && !queueBeingProcessed.value) {
                    // Initiate processing of the queue
                    downloadQuequedAssets()
                }
            }
            else {
                // Halt processing of the queue
            }
        }
    )

    async function downloadQuequedAssets() {
        queueLengthBeforeProcessed.value = queue.value.length

        while (queue.value.length > 0 && processQueue.value) {
            const asset = queue.value.pop()
            const url = window.location.origin + asset.path

            queueBeingProcessed.value = true;

            await fetch(url).then((response) => {
                if (response.ok) {
                    response.blob().then(() => { });
                    currentlyCachedAssets.value.push(asset)
                } else {
                    console.error(
                        `Failed to fetch ${url}: ${response.statusText}`,
                        response
                    );
                }
            });
        }

        queueBeingProcessed.value = false
        processQueue.value = false
        queueLengthBeforeProcessed.value = 0
        getCachedAssets()
    }

    function allNeededAssets() {
        console.log("### Called needed assets")

        let result = preloadableAssets.value.filter((asset) => {
            if (!(langCode.value in asset.refs)) {
                return false
            }

            if (!asset.refs[langCode.value]?.some(item => selectedProjects.value.includes(item))) {
                return false
            }

            if (currentlyCachedAssets.value.find(cached => cached.path == asset.path)) {
                return false
            }

            return true
        });

        console.log("### Finished calling needed assets")

        return result
    }

    async function getCachedAssets() {
        try {
            navigator.serviceWorker.controller.postMessage({
                type: "GET_CACHED_ASSETS",
            });
        } catch (ex) {
            console.log("Error getting cached assets", ex);
        }
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
        //Listen to messages
        messageChannel.value.port1.onmessage = function (message) {
            // Process message
            switch (message.data.type) {
                case "CACHED_ASSETS":
                    currentlyCachedAssets.value = message.data.assets.map(url =>
                        preloadableAssets.value.find((asset => asset.path == url))
                    );
                    queue.value = allNeededAssets()
                    queueLengthBeforeProcessed.value = queue.value.length
                    break;
                default:
                    console.log(message.data);
                    break;
            }
        };

        getCachedAssets()
    });

    const downloadProgress = computed(() => {
        return 100 - 100 * (queue.value.length / queueLengthBeforeProcessed.value)
    })

    return {
        queue,
        processQueue,
        downloadProgress,
        currentlyCachedAssets,
    }
}
