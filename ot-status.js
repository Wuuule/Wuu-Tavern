/** Status Center. Observe chat only; never reenter. */
(function () {
    var MAX = 50;
    var STORE = {};
    var busy = false;
    var lastPersist = 0;
    var TABLE_RE = /<(?:StatusTable|OTTable|Ledger)\b([^>]*)>([\s\S]*?)<\/(?:StatusTable|OTTable|Ledger)>/gi;
    function explode(text) {
        var s = String(text || '');
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<\/p>/gi, '\n');
        s = s.replace(/<\/div>/gi, '\n');
        s = s.replace(/<[^>]+>/g, '');
        s = s.split('第').join('\n第');
        s = s.split('沈秋 |').join('\n沈秋 |');
        s = s.split('蔡丽 |').join('\n蔡丽 |');
        return s;
    }
    function looksLine(s) {
        s = String(s || '').trim();
        if (!s || s.indexOf('|') < 0) return false;
        if (/^第\s*\d+\s*天/.test(s)) return true;
        if (/已发生|预约|攻略|服从|未调教|未评定|见过|称呼|旧令|今日/.test(s)) return true;
        return s.split('|').length >= 3;
    }
    function parseTables(text) {
        var src = explode(text);
        var out = [];
        var re = new RegExp(TABLE_RE.source, 'gi');
        var m;
        while ((m = re.exec(src))) {
            var name = ((m[1] || '').match(/\bname\s*=\s*["']([^"']+)["']/i) || [])[1] || ('table-' + (out.length + 1));
            var body = String(m[2] || '').trim();
            if (body) out.push({ name: name, content: body.slice(0, 12000) });
        }
        if (out.length) return out;
        var buckets = { '时间表': [], '完成表': [], '状态表': [] };
        var mode = null;
        var seen = false;
        src.split('\n').forEach(function (raw) {
            var t = raw.trim();
            if (/^时间表/.test(t)) { mode = '时间表'; seen = true; return; }
            if (/^完成表/.test(t)) { mode = '完成表'; seen = true; return; }
            if (/^状态表/.test(t)) { mode = '状态表'; seen = true; return; }
            if (t === '无' || !looksLine(t)) return;
            seen = true;
            if (/已发生|今日|预约|坠入|虚空/.test(t) && buckets['时间表'].length === 0) mode = '时间表';
            else if (/服从|未调教|攻略|见过|称呼/.test(t) || t.split('|').length >= 4) mode = '状态表';
            else if (/^第\s*\d+\s*天/.test(t) && buckets['时间表'].length) mode = '完成表';
            if (!mode) mode = '状态表';
            if (mode === '状态表' && /吴浚福|^\{\{user\}\}/.test(t)) return;
            buckets[mode].push(t);
        });
        Object.keys(buckets).forEach(function (k) { if (buckets[k].length) out.push({ name: k, content: buckets[k].join('\n') }); });
        return seen ? out : [];
    }
    function stripTables(text) {
        var src = explode(String(text || '')).replace(TABLE_RE, '');
        var lines = src.split('\n');
        var cut = -1;
        var i;
        for (i = 0; i < lines.length; i++) { if (looksLine(lines[i])) { cut = i; break; } }
        if (cut < 0) return src.replace(/\n{3,}/g, '\n\n').trimEnd();
        var all = true;
        for (i = cut; i < lines.length; i++) {
            var u = lines[i].trim();
            if (!u || u === '无') continue;
            if (!looksLine(u) && !/^时间表|^完成表|^状态表|^\[状态/.test(u)) { all = false; break; }
        }
        if (all) src = lines.slice(0, cut).join('\n');
        return src.replace(/\n{3,}/g, '\n\n').trimEnd();
    }
    function upsert(store, tables) {
        store = Array.isArray(store) ? store : [];
        tables.forEach(function (table) {
            var hit = null;
            store.forEach(function (t) { if (t && t.name === table.name) hit = t; });
            if (!hit) { if (store.length >= MAX) store.shift(); hit = { name: table.name, content: '', updated: 0 }; store.push(hit); }
            hit.content = table.content; hit.updated = Date.now();
        });
        return store;
    }
    function save(tables) {
        if (!tables.length) return;
        STORE.default = upsert(STORE.default || [], tables);
        try {
            var conv = window.state && state.activeConversation;
            if (conv) conv.otStatusTables = upsert(conv.otStatusTables || [], tables);
        } catch (e) {}
        var now = Date.now();
        if (now - lastPersist > 4000) {
            lastPersist = now;
            try { if (typeof persistState === 'function') persistState(true); } catch (e2) {}
        }
        refreshPanel();
    }
    function listTables() {
        var out = {}, conv;
        try { conv = window.state && state.activeConversation; } catch (e) {}
        [].concat((conv && conv.otStatusTables) || [], STORE.default || []).forEach(function (t) { if (t && t.name) out[t.name] = t; });
        return Object.keys(out).map(function (k) { return out[k]; });
    }
    function hasMarker(text) {
        var s = String(text || '');
        return s.indexOf('|') >= 0 && (s.indexOf('第') >= 0 || s.indexOf('StatusTable') >= 0 || s.indexOf('服从') >= 0);
    }
    function scrubEl(el) {
        if (!el || el.getAttribute('data-ot-done') === '1') return;
        var text = explode(el.innerHTML || el.innerText || '');
        if (!hasMarker(text)) return;
        var tables = parseTables(text);
        if (tables.length) save(tables);
        var clean = stripTables(text);
        if (clean !== text && clean.length < text.length) {
            busy = true;
            el.innerText = clean;
            busy = false;
        }
        el.setAttribute('data-ot-done', '1');
    }
    function scrubAll() {
        if (busy) return;
        var root = document.getElementById('messagesContainer');
        if (!root) return;
        root.querySelectorAll('.msg-assistant .msg-bubble').forEach(scrubEl);
    }
    function watch() {
        if (window.__otStatusObs) return;
        var root = document.getElementById('messagesContainer') || document.getElementById('chat');
        if (!root) return;
        var obs = new MutationObserver(function () { if (!busy) setTimeout(scrubAll, 0); });
        obs.observe(root, { childList: true, subtree: true });
        window.__otStatusObs = obs;
        scrubAll();
    }
    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) { return ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' })[c]; });
    }
    function ensureModal() {
        if (document.getElementById('otStatusModal')) return;
        var modal = document.createElement('div');
        modal.id = 'otStatusModal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);padding:16px;';
        modal.innerHTML = '<div style="background:#f6f1e8;color:#2b241c;width:min(720px,100%);max-height:86vh;margin:8vh auto 0;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;"><div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);"><b>状态中心</b><button type="button" id="otStatusClose" style="border:0;background:#eee;border-radius:8px;padding:4px 10px;">关闭</button></div><div style="display:flex;min-height:280px;flex:1;overflow:hidden;"><div id="otStatusTableList" style="width:36%;border-right:1px solid rgba(0,0,0,.08);overflow:auto;padding:8px;"></div><pre id="otStatusDetail" style="flex:1;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;font-size:13px;"></pre></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
        document.getElementById('otStatusClose').onclick = function () { modal.style.display = 'none'; };
    }
    function refreshPanel() {
        ensureModal();
        var listEl = document.getElementById('otStatusTableList');
        var detail = document.getElementById('otStatusDetail');
        if (!listEl) return;
        var tables = listTables();
        if (!tables.length) { listEl.innerHTML = '<div style="opacity:.6;padding:8px;">还没有表。</div>'; if (detail) detail.textContent = ''; return; }
        listEl.innerHTML = tables.map(function (t, i) { return '<button type="button" data-i="' + i + '" style="display:block;width:100%;text-align:left;margin:0 0 6px;padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:8px;background:#fff;">' + esc(t.name) + '</button>'; }).join('');
        listEl.querySelectorAll('button[data-i]').forEach(function (btn) {
            btn.onclick = function () {
                var t = tables[Number(btn.getAttribute('data-i'))];
                if (detail && t) detail.textContent = t.content || '';
                listEl.querySelectorAll('button').forEach(function (b) { b.style.background = '#fff'; });
                btn.style.background = '#f0e4d4';
            };
        });
        if (detail && tables[0]) detail.textContent = tables[0].content || '';
    }
    function injectFab() {
        if (document.getElementById('otStatusFab')) return;
        var btn = document.createElement('button');
        btn.id = 'otStatusFab'; btn.type = 'button'; btn.textContent = '状态中心';
        btn.style.cssText = 'position:fixed;right:12px;bottom:96px;z-index:2147483000;padding:8px 12px;border-radius:999px;border:1px solid rgba(0,0,0,.12);background:#fff7ee;color:#2b241c;font-size:13px;';
        btn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); ensureModal(); document.getElementById('otStatusModal').style.display = 'block'; refreshPanel(); };
        document.body.appendChild(btn);
    }
    function boot() {
        injectFab(); ensureModal(); watch();
        setInterval(function () { injectFab(); if (!window.__otStatusObs) watch(); }, 2000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    window.addEventListener('load', function () { setTimeout(boot, 80); });
})();
