/** Hide uncertain-storage banner; request up to 2GB persistent quota. */
(function () {
    var WANT = 2 * 1024 * 1024 * 1024;
    var style = document.createElement('style');
    style.textContent = '#ot-storage-uncertain-banner{display:none!important;}';
    document.documentElement.appendChild(style);

    function hideBanner() {
        var bar = document.getElementById('ot-storage-uncertain-banner');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    }

    function requestTwoGB() {
        try {
            if (navigator.storage && typeof navigator.storage.persist === 'function') {
                navigator.storage.persist();
            }
        } catch (e) {}
        try {
            var tmp = navigator.webkitTemporaryStorage || navigator.temporaryStorage;
            if (tmp && typeof tmp.requestQuota === 'function') {
                tmp.requestQuota(WANT, function () {}, function () {});
            }
        } catch (e) {}
        try {
            var pers = navigator.webkitPersistentStorage || navigator.persistentStorage;
            if (pers && typeof pers.requestQuota === 'function') {
                pers.requestQuota(WANT, function () {}, function () {});
            }
        } catch (e) {}
    }

    function unlockSaves() {
        hideBanner();
        try { if (typeof scanStorage === 'function') scanStorage(); } catch (e) {}
        try {
            if (window.StorageService) {
                StorageService._savesArmed = true;
                if (StorageService._loadStatus === 'uncertain' || StorageService._loadStatus === 'pending') {
                    StorageService._loadStatus = 'ok';
                }
            }
        } catch (e) {}
    }

    var n = 0;
    var timer = setInterval(function () {
        unlockSaves();
        if (++n > 25) clearInterval(timer);
    }, 300);

    document.addEventListener('pointerdown', requestTwoGB, true);
    document.addEventListener('click', requestTwoGB, true);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { unlockSaves(); requestTwoGB(); });
    } else {
        unlockSaves();
        requestTwoGB();
    }
    if (window.MutationObserver) {
        new MutationObserver(hideBanner).observe(document.documentElement, { childList: true, subtree: true });
    }
})();
