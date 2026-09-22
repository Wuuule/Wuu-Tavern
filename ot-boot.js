/** Hide official uncertain-storage banner; arm saves; request persistent quota. */
(function () {
    var style = document.createElement('style');
    style.textContent = '#ot-storage-uncertain-banner{display:none!important;}';
    document.documentElement.appendChild(style);

    function hideBanner() {
        var bar = document.getElementById('ot-storage-uncertain-banner');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    }

    function requestMaxQuota() {
        try {
            if (navigator.storage && typeof navigator.storage.persist === 'function') {
                navigator.storage.persist();
            }
        } catch (e) {}
    }

    function unlockSaves() {
        hideBanner();
        try {
            if (typeof scanStorage === 'function') scanStorage();
        } catch (e) {}
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

    document.addEventListener('pointerdown', requestMaxQuota, true);
    document.addEventListener('click', requestMaxQuota, true);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { unlockSaves(); requestMaxQuota(); });
    } else {
        unlockSaves();
    }
    if (window.MutationObserver) {
        new MutationObserver(hideBanner).observe(document.documentElement, { childList: true, subtree: true });
    }
})();
