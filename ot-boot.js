/** Remove official storage-uncertain banner and keep saves enabled. */
(function () {
    var WANT = 2 * 1024 * 1024 * 1024;
    var style = document.createElement('style');
    style.textContent = [
        '#ot-storage-uncertain-banner{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;}',
        '[role="alert"]{ }'
    ].join('');
    document.documentElement.appendChild(style);

    function looksLikeUncertainBanner(el) {
        if (!el || !el.textContent) return false;
        var t = el.textContent;
        return t.indexOf('\u672a\u80fd\u8bfb\u53d6') >= 0 && (t.indexOf('\u4e3b\u5b58\u6863') >= 0 || t.indexOf('\u5e94\u6025') >= 0 || t.indexOf('\u626b\u63cf\u5b58\u50a8') >= 0);
    }

    function hideBanner() {
        var bar = document.getElementById('ot-storage-uncertain-banner');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        var nodes = document.querySelectorAll('div,aside,section');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el.id === 'ot-storage-uncertain-banner' || looksLikeUncertainBanner(el)) {
                var st = window.getComputedStyle ? getComputedStyle(el) : null;
                if (!st || st.position === 'fixed' || (el.style && String(el.style.cssText).indexOf('fixed') >= 0)) {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }
            }
        }
        try {
            if (typeof showUncertainStorageBanner === 'function') {
                window.showUncertainStorageBanner = function () {};
            }
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

    function requestTwoGB() {
        try {
            if (navigator.storage && typeof navigator.storage.persist === 'function') navigator.storage.persist();
        } catch (e) {}
        try {
            var tmp = navigator.webkitTemporaryStorage || navigator.temporaryStorage;
            if (tmp && typeof tmp.requestQuota === 'function') tmp.requestQuota(WANT, function () {}, function () {});
        } catch (e) {}
    }

    var n = 0;
    var timer = setInterval(function () {
        hideBanner();
        if (++n > 40) clearInterval(timer);
    }, 200);
    document.addEventListener('pointerdown', requestTwoGB, true);
    hideBanner();
    requestTwoGB();
    if (window.MutationObserver) {
        new MutationObserver(hideBanner).observe(document.documentElement, { childList: true, subtree: true });
    }
})();
