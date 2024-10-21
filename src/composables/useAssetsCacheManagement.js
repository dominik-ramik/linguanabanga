import { ref, computed, watch, onMounted } from 'vue'

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

    onMounted(() => {
        getCachedAssets()
    })

    watch(
        () => selectedProjects.value,
        () => {
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
                // Halt processing of the queue is done in download loop by checking on processQueue.value
            }
        }
    )

    const parallelism = 10

    async function downloadQuequedAssets() {
        queueLengthBeforeProcessed.value = queue.value.length

        while (queue.value.length > 0 && processQueue.value) {
            queueBeingProcessed.value = true;

            let tasks = []
            for (let i = 0; i < parallelism; i++) {
                if (queue.value.length > 0) {
                    tasks.push(enqueue(queue.value))
                }
            }
            await Promise.allSettled(tasks)
        }

        queueBeingProcessed.value = false
        processQueue.value = false
        queueLengthBeforeProcessed.value = 0
        setTimeout(() => {
            getCachedAssets()
        }, 200);

        function enqueue(queue) {
            const asset = queue.pop()
            return download(asset)
        }

        function download(asset) {
            const url = window.location.origin + asset.path

            return fetch(url).then((response) => {
                if (response.ok) {
                    response.blob().then(() => { });
                    currentlyCachedAssets.value.push(asset)
                } else {
                    console.error(
                        `Failed to fetch ${url}: ${response.statusText}`,
                        response
                    );
                }
            }).catch((error) => console.log("Fetch error", error))
        }
    }
    function allNeededAssets() {

        const currentlyCachedAssetsAsSet = new Set(currentlyCachedAssets.value.map(i => i.path))

        let result = preloadableAssets.value.filter((asset) => {
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
            navigator.serviceWorker.controller.postMessage({
                type: "GET_CACHED_ASSETS",
            });
        } catch (ex) {
            console.log("Error getting cached assets", ex);
        }
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
        getCachedAssets()
    });

    //Listen to messages
    messageChannel.value.port1.onmessage = function (message) {
        // Process message
        switch (message.data.type) {
            case "CACHED_ASSETS":
                console.time("Preparing cached info")
                currentlyCachedAssets.value = message.data.assets.map(url =>
                    preloadableAssets.value.find((asset => asset.path === url))
                );
                queue.value = allNeededAssets()
                console.timeEnd("Preparing cached info")
                queueLengthBeforeProcessed.value = queue.value.length
                break;
            case "DATA_ASSETS_CLEARED":
                currentlyCachedAssets.value = []
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                break;
            default:
                console.log(message.data);
                break;
        }
    };

    const downloadProgress = computed(() => {
        return 100 - 100 * (queue.value.length / queueLengthBeforeProcessed.value)
    })

    const requiredDownloadSize = computed(() => {
        if (!queue?.value) {
            return 0
        }

        let size = 0

        queue.value.forEach(asset => {
            size += asset.size
        })

        size = size / 1024 / 1024;
        return size
    });

    return {
        queue,
        processQueue,
        downloadProgress,
        currentlyCachedAssets,
        requiredDownloadSize,
    }
}
