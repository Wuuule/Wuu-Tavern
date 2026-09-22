/** Wuu-Tavern Status Center: store tables off-bubble, inject for the model, never print. */
(function () {
    var SETTINGS_KEY = 'otStatusCenter';
    var MAX_TABLES = 50;
    var TABLE_RE = /<(?:StatusTable|OTTable|Ledger)\b([^>]*)>([\s\S]*?)<\/(?:StatusTable|OTTable|Ledger)>/gi;
    var OPEN_RE = /<(?:StatusTable|OTTable|Ledger)\b/i;
    var USER_ALIASES = ['{{user}}', '{{User}}', 'User', 'user', '\u5434\u6d5a\u798f'];

    function defaults() {
        return { enabled: true, hide: true, modelLookup: true, writeCard: true };
    }
    function getCfg() {
        var base = defaults();
        try {
            var s = window.state && state.settings && state.settings[SETTINGS_KEY];
            if (s && typeof s === 'object') Object.assign(base, s);
        } catch (e) {}
        return base;
    }
    function setCfg(patch) {
        if (!window.state) return;
        if (!state.settings) state.settings = {};
        state.settings[SETTINGS_KEY] = Object.assign(getCfg(), patch || {});
        if (typeof persistState === 'function') persistState(true);
    }
    function playerNames() {
        var names = USER_ALIASES.slice();
        try {
            if (state && state.settings && state.settings.userName) names.push(String(state.settings.userName));
            var personas = state.settings.userPersonas || [];
            personas.forEach(function (p) {
                if (p && p.userName) names.push(String(p.userName));
                if (p && p.title) names.push(String(p.title));
            });
        } catch (e) {}
        return names.filter(Boolean);
    }
    function isPlayerRow(line) {
        var first = String(line || '').split('|')[0].replace(/\s+/g, '');
        if (!first) return false;
        return playerNames().some(function (n) {
            return first === String(n).replace(/\s+/g, '') || first.indexOf(String(n).replace(/\s+/g, '')) === 0;
        });
    }
    function dropPlayerRows(body) {
        return String(body || '').split('\n').filter(function (line) { return !isPlayerRow(line); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    function attrName(attrStr, fallback) {
        var raw = attrStr || '';
        var m = raw.match(/\bname\s*=\s*["']([^"']+)["']/i) || raw.match(/\bid\s*=\s*["']([^"']+)["']/i);
        if (m && m[1]) return String(m[1]).trim().slice(0, 40);
        return fallback || 'untitled';
    }
    function parseTagged(text) {
        var src = text == null ? '' : String(text);
        var out = [];
        var re = new RegExp(TABLE_RE.source, 'gi');
        var m;
        while ((m = re.exec(src))) {
            var name = attrName(m[1], 'table-' + (out.length + 1));
            var body = dropPlayerRows(m[2]);
            if (body) out.push({ name: name, content: body.slice(0, 12000) });
        }
        return out;
    }
    function looksLikeTableLine(line) {
        var s = String(line || '').trim();
        if (!s || s.indexOf('|') < 0) return false;
        if (/^\u7b2c\s*\d+\s*\u5929/.test(s)) return true;
        if (/\u653b\u7565|\u670d\u4ece|\u89c1\u8fc7|\u79f0\u547c|\u65e7\u4ee4|\u9884\u7ea6|\u4eca\u65e5/.test(s)) return true;
        return s.split('|').length >= 3;
    }
    function parsePlainBlocks(text) {
        var src = String(text || '');
        var lines = src.split(/\n/);
        var buckets = { '\u65f6\u95f4\u8868': [], '\u5b8c\u6210\u8868': [], '\u72b6\u6001\u8868': [] };
        var mode = null;
        var started = false;
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (/^\u65f6\u95f4\u8868/.test(t)) { mode = '\u65f6\u95f4\u8868'; started = true; continue; }
            if (/^\u5b8c\u6210\u8868/.test(t)) { mode = '\u5b8c\u6210\u8868'; started = true; continue; }
            if (/^\u72b6\u6001\u8868/.test(t)) { mode = '\u72b6\u6001\u8868'; started = true; continue; }
            if (/^\[\u72b6\u6001[:\uff1a]/.test(t)) { started = true; continue; }
            if (!started && !looksLikeTableLine(t)) continue;
            started = true;
            if (!looksLikeTableLine(t)) continue;
            if (isPlayerRow(t)) continue;
            if (/\u4eca\u65e5|\u9884\u7ea6/.test(t)) mode = '\u65f6\u95f4\u8868';
            else if (/\u653b\u7565|\u670d\u4ece|\u89c1\u8fc7\d|\u79f0\u547c/.test(t)) mode = '\u72b6\u6001\u8868';
            else if (/^\u7b2c\s*\d+\s*\u5929/.test(t) && t.split('|').length >= 3 && !/\u4eca\u65e5|\u9884\u7ea6/.test(t)) mode = mode === '\u65f6\u95f4\u8868' ? '\u5b8c\u6210\u8868' : (mode || '\u5b8c\u6210\u8868');
            if (!mode) mode = '\u72b6\u6001\u8868';
            buckets[mode].push(t);
        }
        var out = [];
        Object.keys(buckets).forEach(function (name) {
            if (buckets[name].length) out.push({ name: name, content: buckets[name].join('\n') });
        });
        return out;
    }
    function parseTables(text) {
        var tagged = parseTagged(text);
        if (tagged.length) return tagged;
        return parsePlainBlocks(text);
    }
    function stripCutIndex(src) {
        var s = String(src || '');
        var idx = s.search(OPEN_RE);
        var m = s.search(/\n\s*(?:\u65f6\u95f4\u8868|\u5b8c\u6210\u8868|\u72b6\u6001\u8868)\s*[:\uff1a]?\s*\n/);
        var bar = s.search(/\n\s*\[\u72b6\u6001[:\uff1a][^\]]+\]\s*\n/);
        var candidates = [idx, m, bar].filter(function (n) { return n >= 0; });
        if (!candidates.length) {
            var lines = s.split('\n');
            for (var i = 0; i < lines.length; i++) {
                if (looksLikeTableLine(lines[i]) && (/\u4eca\u65e5|\u9884\u7ea6|\u653b\u7565|\u670d\u4ece/.test(lines[i]) || /^\u7b2c\s*\d+\s*\u5929/.test(lines[i].trim()))) {
                    return lines.slice(0, i).join('\n').length;
                }
            }
            return -1;
        }
        return Math.min.apply(null, candidates);
    }
    function stripTables(text, allowPartial) {
        var src = text == null ? '' : String(text);
        if (!src) return src;
        src = src.replace(TABLE_RE, '');
        if (allowPartial) {
            var open = src.search(OPEN_RE);
            if (open >= 0) src = src.slice(0, open);
        }
        var cut = stripCutIndex(src);
        if (cut >= 0) src = src.slice(0, cut);
        return src.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trimEnd();
    }
    function activeCharacter(conv) {
        if (!conv) return null;
        try { if (typeof isGroupChat === 'function' && isGroupChat(conv)) return null; } catch (e) {}
        if (conv.character) return conv.character;
        try { if (window.state && state.characters && conv.characterId) return state.characters[conv.characterId] || null; } catch (e2) {}
        return null;
    }
    function listTables(character) {
        if (!character) return [];
        if (!character.extensions || typeof character.extensions !== 'object') return [];
        return Array.isArray(character.extensions.otStatusTables) ? character.extensions.otStatusTables : [];
    }
    function upsertTablesOnCard(character, tables) {
        if (!character.extensions || typeof character.extensions !== 'object') character.extensions = {};
        if (!Array.isArray(character.extensions.otStatusTables)) character.extensions.otStatusTables = [];
        var store = character.extensions.otStatusTables;
        tables.forEach(function (table) {
            var hit = null;
            store.forEach(function (t) { if (t && t.name === table.name) hit = t; });
            if (!hit) {
                if (store.length >= MAX_TABLES) store.shift();
                hit = { name: table.name, content: '', updated: 0 };
                store.push(hit);
            }
            hit.content = table.content;
            hit.updated = Date.now();
        });
        return store;
    }
    function applyTables(conv, fullContent) {
        var cfg = getCfg();
        if (!cfg.enabled) return;
        var tables = parseTables(fullContent);
        if (!tables.length) return;
        var character = activeCharacter(conv);
        if (cfg.writeCard && character) upsertTablesOnCard(character, tables);
        try { if (conv) conv.updated = Date.now(); } catch (e) {}
        try { if (typeof persistState === 'function') persistState(true); } catch (e2) {}
        refreshPanel();
    }
    function statusSystemBlock() {
        var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
        var tables = listTables(activeCharacter(conv));
        if (!tables.length) return '\u3010\u72b6\u6001\u4e2d\u5fc3\u3011\u5f53\u524d\u65e0\u8868\u3002\u4e0d\u8981\u628a\u73a9\u5bb6\u672c\u4eba\u5199\u5165\u72b6\u6001\u8868\u3002\u8868\u53ea\u5199\u5728\u6807\u7b7e\u91cc\uff0c\u7981\u6b62\u5728\u6b63\u6587\u6253\u5370\u8868\u3002';
        var parts = ['\u3010\u72b6\u6001\u4e2d\u5fc3\u00b7\u53ea\u8bfb\u00b7\u7981\u6b62\u5728\u6b63\u6587\u590d\u8ff0\u6216\u6253\u5370\u3011'];
        tables.forEach(function (t) {
            parts.push('<StatusTable name="' + t.name + '">\n' + t.content + '\n</StatusTable>');
        });
        parts.push('\u6839\u636e\u4e0a\u8868\u63a5\u7eed\u65e5\u671f\u4e0e\u5173\u7cfb\u3002\u4e0d\u8981\u628a\u73a9\u5bb6\u5199\u5165\u72b6\u6001\u8868\u3002\u66f4\u65b0\u65f6\u4ecd\u7528\u6807\u7b7e\uff0c\u6b63\u6587\u91cc\u4e0d\u8981\u51fa\u73b0\u8868\u3002');
        var block = parts.join('\n');
        if (block.length > 6000) block = block.slice(0, 6000);
        return block;
    }
    function looksLikeChatPayload(payload) {
        return payload && Array.isArray(payload.messages) && payload.messages.length && (payload.model || payload.stream === true || payload.max_tokens || payload.temperature != null);
    }
    function interceptOutgoingChat() {
        if (window.fetch && window.fetch.__otStatusWrapped) return;
        var origFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                var cfg = getCfg();
                if (cfg.enabled && cfg.modelLookup !== false && init && typeof init.body === 'string') {
                    var payload = JSON.parse(init.body);
                    if (looksLikeChatPayload(payload)) {
                        var block = statusSystemBlock();
                        var msgs = payload.messages.slice();
                        msgs.splice(Math.min(1, msgs.length), 0, { role: 'system', content: block });
                        payload.messages = msgs;
                        init = Object.assign({}, init, { body: JSON.stringify(payload) });
                    }
                }
            } catch (e) {}
            return origFetch.call(this, input, init);
        };
        window.fetch.__otStatusWrapped = true;
    }
    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' })[c];
        });
    }
    function ensureModal() {
        var modal = document.getElementById('otStatusModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'otStatusModal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);align-items:stretch;justify-content:center;padding:16px;';
        modal.innerHTML =
            '<div style="background:#f6f1e8;color:#2b241c;width:min(720px,100%);max-height:86vh;margin:auto;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);">' +
            '<b>\u72b6\u6001\u4e2d\u5fc3</b><button type="button" id="otStatusClose" style="border:0;background:#eee;border-radius:8px;padding:4px 10px;">\u5173\u95ed</button></div>' +
            '<div style="display:flex;min-height:320px;flex:1;overflow:hidden;">' +
            '<div id="otStatusTableList" style="width:36%;border-right:1px solid rgba(0,0,0,.08);overflow:auto;padding:8px;"></div>' +
            '<pre id="otStatusDetail" style="flex:1;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;font-size:13px;line-height:1.55;"></pre>' +
            '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
        document.getElementById('otStatusClose').addEventListener('click', function () { modal.style.display = 'none'; });
        return modal;
    }
    function openModal() {
        ensureModal();
        document.getElementById('otStatusModal').style.display = 'flex';
        refreshPanel();
    }
    function refreshPanel() {
        ensureModal();
        var listEl = document.getElementById('otStatusTableList');
        var detail = document.getElementById('otStatusDetail');
        if (!listEl) return;
        var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
        var tables = listTables(activeCharacter(conv));
        if (!tables.length) {
            listEl.innerHTML = '<div style="opacity:.6;padding:8px;">\u8fd8\u6ca1\u6709\u8868\u3002\u6a21\u578b\u56de\u5b8c\u4e00\u8f6e\u540e\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc\uff0c\u4e0d\u4f1a\u5199\u8fdb\u804a\u5929\u6b63\u6587\u3002</div>';
            if (detail) detail.textContent = '';
            return;
        }
        listEl.innerHTML = tables.map(function (t, i) {
            return '<button type="button" data-ot-i="' + i + '" style="display:block;width:100%;text-align:left;margin:0 0 6px;padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:8px;background:#fff;">' + esc(t.name) + '</button>';
        }).join('');
        listEl.querySelectorAll('button[data-ot-i]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var t = tables[Number(btn.getAttribute('data-ot-i'))];
                if (detail && t) detail.textContent = t.content || '';
                listEl.querySelectorAll('button').forEach(function (b) { b.style.background = '#fff'; });
                btn.style.background = '#f0e4d4';
            });
        });
        if (detail && !detail.textContent && tables[0]) detail.textContent = tables[0].content || '';
    }
    function injectUnderNote() {
        if (document.getElementById('otStatusOpenBtn')) return;
        var hosts = [document.getElementById('authorsNoteDialog'), document.getElementById('authorsNoteRow'), document.querySelector('[data-i18n="authors_note"]')];
        var host = null;
        for (var i = 0; i < hosts.length; i++) if (hosts[i]) { host = hosts[i]; break; }
        if (!host) {
            var nodes = document.querySelectorAll('button,div,span');
            for (var j = 0; j < nodes.length; j++) {
                var tx = (nodes[j].textContent || '').trim();
                if (tx === '\u4f5c\u8005\u6ce8\u91ca' || tx === "Author's Note" || tx === 'Authors Note') {
                    host = nodes[j].parentElement || nodes[j];
                    break;
                }
            }
        }
        if (!host) return;
        var wrap = document.createElement('div');
        wrap.id = 'otStatusOpenBtn';
        wrap.style.cssText = 'margin:8px 0 0;';
        wrap.innerHTML = '<button type="button" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.12);background:#fff7ee;">\u72b6\u6001\u4e2d\u5fc3</button>';
        wrap.querySelector('button').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openModal();
        });
        host.appendChild(wrap);
    }
    function installHooks() {
        interceptOutgoingChat();
        if (typeof formatMessage === 'function' && !formatMessage.__otStatusWrapped) {
            var origFormat = formatMessage;
            formatMessage = function (message, context) {
                var out = origFormat.apply(this, arguments);
                var cfg = getCfg();
                if (!cfg.enabled || !cfg.hide) return out;
                var phase = context && (context.processingPhase || (context.forPrompt === true ? 'prompt' : 'display'));
                if (phase === 'prompt') return out;
                return stripTables(out, false);
            };
            formatMessage.__otStatusWrapped = true;
        }
        ['formatStreamingPlainHtml', 'renderStreamingContentFast'].forEach(function (fn) {
            if (typeof window[fn] === 'function' && !window[fn].__otStatusWrapped) {
                var orig = window[fn];
                window[fn] = function (a, b) {
                    var cfg = getCfg();
                    if (cfg.enabled && cfg.hide) {
                        if (typeof a === 'string') a = stripTables(a, true);
                        if (typeof b === 'string') b = stripTables(b, true);
                    }
                    return orig.apply(this, arguments);
                };
                window[fn].__otStatusWrapped = true;
            }
        });
        if (typeof finishAssistantMessage === 'function' && !finishAssistantMessage.__otStatusWrapped) {
            var origFinish = finishAssistantMessage;
            finishAssistantMessage = function (conv, fullContent) {
                try { applyTables(conv, fullContent); } catch (err) { console.warn('[status-center]', err); }
                var cfg = getCfg();
                if (cfg.enabled && cfg.hide && typeof fullContent === 'string') arguments[1] = stripTables(fullContent, false);
                return origFinish.apply(this, arguments);
            };
            finishAssistantMessage.__otStatusWrapped = true;
        }
    }
    function boot() { installHooks(); injectUnderNote(); ensureModal(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    else setTimeout(boot, 0);
    window.addEventListener('load', function () { setTimeout(boot, 80); });
    setInterval(function () { try { injectUnderNote(); } catch (e) {} }, 2000);
})();
