/** Status Center: IIFE-safe. Capture/hide via DOM observer because OT helpers are not global. */
(function () {
    var MAX = 50;
    var STORE = {};
    var TABLE_RE = /<(?:StatusTable|OTTable|Ledger)\b([^>]*)>([\s\S]*?)<\/(?:StatusTable|OTTable|Ledger)>/gi;
    var PLAYER = ['{{user}}', 'User', 'user', '吴浚福'];
    function playerNames() {
        var n = PLAYER.slice();
        try {
            if (window.state && state.settings) {
                if (state.settings.userName) n.push(String(state.settings.userName));
                (state.settings.userPersonas || []).forEach(function (p) { if (p && p.userName) n.push(String(p.userName)); });
            }
        } catch (e) {}
        return n;
    }
    function isPlayerRow(line) {
        var head = String(line || '').split(/[|—–]/)[0].replace(/\s+/g, '').replace(/（.*$/, '');
        return playerNames().some(function (x) { x = String(x).replace(/\s+/g, ''); return head === x || head.indexOf(x) === 0; });
    }
    function looksLine(s) {
        s = String(s || '').trim();
        if (!s) return false;
        if (s.indexOf('|') >= 0 && (/^第\s*\d+\s*天/.test(s) || /已发生|预约|攻略|服从|未调教|未评定|见过|称呼|旧令|今日/.test(s) || s.split('|').length >= 3)) return true;
        if (/^第\s*\d+\s*天/.test(s) && /[—–]/.test(s)) return true;
        if (/（/.test(s) && /）/.test(s) && /[—–]/.test(s)) return true;
        return false;
    }
    function parseTables(text) {
        var src = String(text || ''), out = [], m, re = new RegExp(TABLE_RE.source, 'gi');
        while ((m = re.exec(src))) {
            var name = ((m[1] || '').match(/\bname\s*=\s*["']([^"']+)["']/i) || [])[1] || ('table-' + (out.length + 1));
            var body = String(m[2] || '').trim();
            if (body) out.push({ name: name, content: body.slice(0, 12000) });
        }
        if (out.length) return out;
        var buckets = { '时间表': [], '完成表': [], '状态表': [] }, mode = null, seen = false;
        src.split('\n').forEach(function (raw) {
            var t = raw.trim();
            if (/^时间表/.test(t)) { mode = '时间表'; seen = true; return; }
            if (/^完成表/.test(t)) { mode = '完成表'; seen = true; return; }
            if (/^状态表/.test(t)) { mode = '状态表'; seen = true; return; }
            if (!looksLine(t)) return;
            seen = true;
            if (/已发生|今日|预约|坠入|虚空/.test(t) && buckets['时间表'].length === 0) mode = '时间表';
            else if (/未评定|落地|办结|完成/.test(t) && !/服从|未调教/.test(t)) mode = '完成表';
            else if (/服从|未调教|攻略|见过|称呼|隐藏：/.test(t) || (t.split('|').length >= 4)) mode = '状态表';
            else if (/^第\s*\d+\s*天/.test(t) && buckets['时间表'].length) mode = '完成表';
            if (!mode) mode = '状态表';
            if (mode === '状态表' && isPlayerRow(t)) return;
            buckets[mode].push(t);
        });
        Object.keys(buckets).forEach(function (k) { if (buckets[k].length) out.push({ name: k, content: buckets[k].join('\n') }); });
        return seen ? out : [];
    }
    function stripTables(text) {
        var src = String(text || '').replace(TABLE_RE, '');
        var lines = src.split('\n'), cut = -1;
        for (var i = 0; i < lines.length; i++) if (looksLine(lines[i])) { cut = i; break; }
        if (cut < 0) return src.replace(/\n{3,}/g, '\n\n').trimEnd();
        var all = true;
        for (var j = cut; j < lines.length; j++) {
            var u = lines[j].trim(); if (!u) continue;
            if (!looksLine(u) && !/^时间表|^完成表|^状态表|^\[状态/.test(u)) { all = false; break; }
        }
        if (all) src = lines.slice(0, cut).join('\n');
        return src.replace(/\n{3,}/g, '\n\n').trimEnd();
    }
    function upsert(store, tables) {
        store = Array.isArray(store) ? store : [];
        tables.forEach(function (table) {
            var hit = null; store.forEach(function (t) { if (t && t.name === table.name) hit = t; });
            if (!hit) { if (store.length >= MAX) store.shift(); hit = { name: table.name, content: '', updated: 0 }; store.push(hit); }
            hit.content = table.content; hit.updated = Date.now();
        });
        return store;
    }
    function save(tables) {
        if (!tables.length) return;
        STORE.default = upsert(STORE.default || [], tables);
        try {
            var conv = window.state && (state.activeConversation || null);
            if (conv) conv.otStatusTables = upsert(conv.otStatusTables || [], tables);
            var ch = conv && conv.character;
            if (ch) { if (!ch.extensions) ch.extensions = {}; ch.extensions.otStatusTables = upsert(ch.extensions.otStatusTables || [], tables); }
        } catch (e) {}
        try { if (typeof persistState === 'function') persistState(true); } catch (e2) {}
        refreshPanel();
    }
    function listTables() {
        var out = {}, conv, ch;
        try { conv = window.state && state.activeConversation; ch = conv && conv.character; } catch (e) {}
        [].concat((ch && ch.extensions && ch.extensions.otStatusTables) || [], (conv && conv.otStatusTables) || [], STORE.default || []).forEach(function (t) { if (t && t.name) out[t.name] = t; });
        return Object.keys(out).map(function (k) { return out[k]; });
    }
    function injectFetch() {
        if (!window.fetch || window.fetch.__otStatusWrapped) return;
        var orig = window.fetch;
        window.fetch = function (input, init) {
            try {
                if (init && typeof init.body === 'string') {
                    var payload = JSON.parse(init.body);
                    if (payload && Array.isArray(payload.messages)) {
                        var tables = listTables();
                        var parts = ['【状态中心·只读·禁止打印到正文】不要输出时间表/完成表/状态表，不要用「第1天·早 |」把表写进故事。更新只用末尾隐藏标签。'];
                        if (!tables.length) parts.push('当前无表。');
                        tables.forEach(function (t) { parts.push('<StatusTable name="' + t.name + '">\n' + t.content + '\n</StatusTable>'); });
                        var msgs = payload.messages.slice();
                        msgs.splice(Math.min(1, msgs.length), 0, { role: 'system', content: parts.join('\n').slice(0, 8000) });
                        payload.messages = msgs;
                        init = Object.assign({}, init, { body: JSON.stringify(payload) });
                    }
                }
            } catch (e) {}
            return orig.call(this, input, init);
        };
        window.fetch.__otStatusWrapped = true;
    }
    function scrubEl(el) {
        if (!el || el.nodeType !== 1) return;
        var text = el.innerText || el.textContent || '';
        if (!text || text.length < 8) return;
        var tables = parseTables(text);
        if (tables.length) save(tables);
        var clean = stripTables(text);
        if (clean !== text && clean.length < text.length) el.innerText = clean;
    }
    function scrubAll() { document.querySelectorAll('.msg-assistant .msg-bubble, .msg-assistant').forEach(scrubEl); }
    function watch() {
        if (window.__otStatusObs) return;
        var obs = new MutationObserver(function () { scrubAll(); });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.__otStatusObs = obs;
        scrubAll();
    }
    function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' })[c]; }); }
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
        if (!tables.length) { listEl.innerHTML = '<div style="opacity:.6;padding:8px;">还没有表。新回复里的表会被收到这里。</div>'; if (detail) detail.textContent = ''; return; }
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
        btn.onclick = function (e) { e.preventDefault(); ensureModal(); document.getElementById('otStatusModal').style.display = 'block'; refreshPanel(); };
        document.body.appendChild(btn);
    }
    function boot() { injectFetch(); injectFab(); ensureModal(); watch(); setInterval(function () { injectFab(); injectFetch(); scrubAll(); }, 1500); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    window.addEventListener('load', function () { setTimeout(boot, 50); });
})();
