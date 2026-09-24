/**
 * Browser storage helper. IMPORTANT: it must never override storage hydration
 * or suppress the app's recovery warning. A quota request is not a guarantee.
 */
(function () {
    'use strict';
    var REQUESTED_QUOTA = 2 * 1024 * 1024 * 1024;
    var requested = false;

    async function requestPersistenceOnce() {
        if (requested) return;
        requested = true;
        try {
            if (navigator.storage) {
                var alreadyPersistent = typeof navigator.storage.persisted === 'function'
                    ? await navigator.storage.persisted()
                    : false;
                if (!alreadyPersistent && typeof navigator.storage.persist === 'function') {
                    // Some browsers decline this request; keep the app's real status.
                    await navigator.storage.persist();
                }
            }
        } catch (err) {
            console.warn('[Wuu-Tavern] Persistent storage request failed', err);
        }

        // Legacy Chromium API: best effort, never claims the quota was granted.
        try {
            var legacy = navigator.webkitTemporaryStorage;
            if (legacy && typeof legacy.requestQuota === 'function') {
                legacy.requestQuota(REQUESTED_QUOTA, function () {}, function (err) {
                    console.warn('[Wuu-Tavern] Optional quota request declined', err);
                });
            }
        } catch (err) {
            console.warn('[Wuu-Tavern] Legacy quota request unavailable', err);
        }
    }

    // Wait for an intentional user interaction. No polling or global DOM writes.
    document.addEventListener('pointerdown', requestPersistenceOnce, { once: true, capture: true });
})();
