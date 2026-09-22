/** Generic Status Center. Not tied to any one character card. */
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
        s = s.replace(/\]\s*(第)/g, ']\n$1');
        s = s.split('[状态').join('\n[状态');
        return s;
    }
    function isHud(s) {
        s = String(s || '').trim();
        return /^\[状态/.test(s) || /烙印力|调教师阶|地点安保|与对象风评/.test(s);
    }
    function isTimeRow(s) {
        s = String(s || '').trim();
        if (!/^第\s*\d+\s*天/.test(s)) return false;
        return /今日|已发生|预约|时辰/.test(s) || (s.indexOf('|') >= 0 && /早|午|傍晚|夜/.test(s));
    }
    function isPersonRow(s) {
        s = String(s || '').trim();
        if (!s || isHud(s) || /^第\s*\d+\s*天/.test(s) || /^时间表|^完成表|^状态表/.test(s)) return false;
        if (s.indexOf('|') < 0) return false;
        var head = s.split('|')[0].replace(/\s+/g, '');
        if (!head || head.length > 16) return false;
        if (/今日|预约|烙印|调教师|地点安保|日期/.test(head)) return false;
        try { if (window.state && state.settings && state.settings.userName && head.indexOf(String(state.settings.userName).replace(/\s+/g,'')) === 0) return false; } catch (e) {}
        if (/^吴浚福|^{{user}}|^User$/i.test(head)) return false;
        return /服从|未调教|见过|初见|称呼|攻略|审视|未收徒|态度/.test(s) || s.split('|').length >= 3;
    }
    function looksStrip(s) {
        s = String(s || '').trim();
        if (!s) return false;
        if (isHud(s) || isTimeRow(s) || isPersonRow(s)) return true;
        if (/^时间表|^完成表|^状态表/.test(s)) return true;
        if (/^第\s*\d+\s*天/.test(s) && s.indexOf('|') >= 0) return true;
        return false;
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
        src.split('\n').forEach(function (raw) {
            var t = raw.trim();
            if (!t || t === '无') return;
            if (/^时间表/.test(t) || /^完成表/.test(t) || /^状态表/.test(t)) return;
            if (isHud(t)) return;
            if (isTimeRow(t)) { buckets['时间表'].push(t); return; }
            if (isPersonRow(t)) { buckets['状态表'].push(t); return; }
            if (/^第\s*\d+\s*天/.test(t) && t.indexOf('|') >= 0) { buckets['完成表'].push(t); return; }
        });
        Object.keys(buckets).forEach(function (k) { if (buckets[k].length) out.push({ name: k, content: buckets[k].join('\n') }); });
        return out;
    }
    function stripTables(text) {
        var src = explode(String(text || '')).replace(TABLE_RE, '');
        var lines = src.split('\n').filter(function (l) {
            var t = l.trim();
            if (!t) return true;
            if (t === '无') return false;
            return !looksStrip(t);
        });
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
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
        try { var conv = window.state && state.activeConversation; if (conv) conv.otStatusTables = upsert(conv.otStatusTables || [], tables); } catch (e) {}
        var now = Date.now();
        if (now - lastPersist > 4000) { lastPersist = now; try { if (typeof persistState === 'function') persistState(true); } catch (e2) {} }
        refreshPanel();
    }
    function listTables() {
        var out = {}, conv;
        try { conv = window.state && state.activeConversation; } catch (e) {}
        [].concat((conv && conv.otStatusTables) || [], STORE.default || []).forEach(function (t) { if (t && t.name) out[t.name] = t; });
        return Object.keys(out).map(function (k) { return out[k]; });
    }
    function scrubEl(el) {
        if (!el || el.getAttribute('data-ot-done') === '1') return;
        var text = explode(el.innerHTML || el.innerText || '');
        var tables = parseTables(text);
        if (tables.length) save(tables);
        var clean = stripTables(text);
        if (clean.length < text.length) { busy = true; el.innerText = clean; busy = false; }
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
