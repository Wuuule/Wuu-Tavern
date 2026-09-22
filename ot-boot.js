/** Hide storage-uncertain banner after official app boots. */
(function () {
    var WANT = 2 * 1024 * 1024 * 1024;
    function hide() {
        var bar = document.getElementById('ot-storage-uncertain-banner');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        try { window.showUncertainStorageBanner = function () {}; } catch (e) {}
        try {
            if (window.StorageService) {
                StorageService._savesArmed = true;
                if (StorageService._loadStatus === 'uncertain' || StorageService._loadStatus === 'pending') {
                    StorageService._loadStatus = 'ok';
                }
            }
        } catch (e) {}
    }
    function requestTwoGB() {
        try {
            if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
        } catch (e) {}
        try {
            var tmp = navigator.webkitTemporaryStorage;
            if (tmp && tmp.requestQuota) tmp.requestQuota(WANT, function () {}, function () {});
        } catch (e) {}
    }
    var n = 0;
    var t = setInterval(function () { hide(); if (++n > 30) clearInterval(t); }, 300);
    document.addEventListener('pointerdown', requestTwoGB, true);
    hide();
})();
