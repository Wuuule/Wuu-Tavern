/** Wuu-Tavern Status Center — tables live here, not in the chat bubble. */
(function () {
    var SETTINGS_KEY = 'otStatusCenter';
    var MAX_TABLES = 50;
    var TABLE_RE = /<(?:StatusTable|OTTable|Ledger)\b([^>]*)>([\s\S]*?)<\/(?:StatusTable|OTTable|Ledger)>/gi;
    var OPEN_RE = /<(?:StatusTable|OTTable|Ledger)\b/i;
    var HEAD_RE = /(?:^|\n)\s*(时间表|完成表|状态表)\s*[:：]?\s*(?:\n|$)/;
    var PLAYER = ['{{user}}', '{{User}}', 'User', 'user', '吴浚福'];

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
    function playerNames() {
        var names = PLAYER.slice();
        try {
            if (state && state.settings && state.settings.userName) names.push(String(state.settings.userName));
            (state.settings.userPersonas || []).forEach(function (p) {
                if (p && p.userName) names.push(String(p.userName));
            });
        } catch (e) {}
        return names.filter(Boolean);
    }
    function isPlayerRow(line) {
        var first = String(line || '').split('|')[0].replace(/\s+/g, '');
        if (!first) return false;
        return playerNames().some(function (n) {
            var x = String(n).replace(/\s+/g, '');
            return first === x || first.indexOf(x) === 0;
        });
    }
    function attrName(attrStr, fallback) {
        var raw = attrStr || '';
        var m = raw.match(/\bname\s*=\s*["']([^"']+)["']/i) || raw.match(/\bid\s*=\s*["']([^"']+)["']/i);
        if (m && m[1]) return String(m[1]).trim().slice(0, 40);
        return fallback || 'untitled';
    }
    function looksLikeTableLine(line) {
        var s = String(line || '').trim();
        if (!s || s.indexOf('|') < 0) return false;
        if (/^第\s*\d+\s*天/.test(s)) return true;
        if (/攻略|服从|见过|称呼|旧令|预约|今日/.test(s)) return true;
        return s.split('|').length >= 3;
    }
    function parseTagged(text) {
        var src = String(text || '');
        var out = [];
        var re = new RegExp(TABLE_RE.source, 'gi');
        var m;
        while ((m = re.exec(src))) {
            var name = attrName(m[1], 'table-' + (out.length + 1));
            var body = String(m[2] || '').split('\n').filter(function (l) { return !isPlayerRow(l); }).join('\n').trim();
            if (body) out.push({ name: name, content: body.slice(0, 12000) });
        }
        return out;
    }
    function parsePlainBlocks(text) {
        var lines = String(text || '').split('\n');
        var buckets = { '时间表': [], '完成表': [], '状态表': [] };
        var mode = null;
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (/^时间表/.test(t)) { mode = '时间表'; continue; }
            if (/^完成表/.test(t)) { mode = '完成表'; continue; }
            if (/^状态表/.test(t)) { mode = '状态表'; continue; }
            if (/^\[状态[:：]/.test(t)) continue;
            if (!looksLikeTableLine(t) || isPlayerRow(t)) continue;
            if (/今日|预约/.test(t)) mode = '时间表';
            else if (/攻略|服从|见过|称呼/.test(t)) mode = '状态表';
            else if (/^第\s*\d+\s*天/.test(t) && t.split('|').length >= 3 && !/今日|预约/.test(t)) {
                mode = mode === '时间表' ? '完成表' : (mode || '完成表');
            }
            if (!mode) mode = '状态表';
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
        return tagged.length ? tagged : parsePlainBlocks(text);
    }
    function stripTables(text, allowPartial) {
        var src = text == null ? '' : String(text);
        if (!src) return src;
        src = src.replace(TABLE_RE, '');
        if (allowPartial) {
            var open = src.search(OPEN_RE);
            if (open >= 0) src = src.slice(0, open);
        }
        var head = src.search(HEAD_RE);
        if (head >= 0) src = src.slice(0, head);
        var lines = src.split('\n');
        var cut = -1;
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (looksLikeTableLine(t) && /今日|预约|攻略|服从|见过\d|称呼|旧令/.test(t)) {
                cut = i;
                break;
            }
        }
        if (cut >= 0) {
            var allTable = true;
            for (var j = cut; j < lines.length; j++) {
                var u = lines[j].trim();
                if (!u) continue;
                if (!looksLikeTableLine(u) && !/^时间表|^完成表|^状态表|^\[状态/.test(u)) {
                    allTable = false;
                    break;
                }
            }
            if (allTable) src = lines.slice(0, cut).join('\n');
        }
        return src.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trimEnd();
    }
    function activeCharacter(conv) {
        if (!conv) return null;
        if (conv.character) return conv.character;
        try {
            if (window.state && state.characters && conv.characterId) return state.characters[conv.characterId] || null;
        } catch (e) {}
        return null;
    }
    function listTables(character) {
        if (!character || !character.extensions || !Array.isArray(character.extensions.otStatusTables)) return [];
        return character.extensions.otStatusTables;
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
    function sanitizeConv(conv, raw) {
        if (!conv || !Array.isArray(conv.messages)) return;
        var clean = stripTables(raw, false);
        for (var i = conv.messages.length - 1; i >= 0; i--) {
            var m = conv.messages[i];
            if (!m) continue;
            if (m.role === 'assistant' || m.is_user === false) {
                if (typeof m.content === 'string') m.content = stripTables(m.content, false);
                if (clean && m.content && m.content.length > clean.length + 20) m.content = clean;
                break;
            }
        }
    }
    function applyTables(conv, fullContent) {
        var cfg = getCfg();
        if (!cfg.enabled) return;
        var tables = parseTables(fullContent);
        var character = activeCharacter(conv);
        if (tables.length && cfg.writeCard && character) upsertTablesOnCard(character, tables);
        sanitizeConv(conv, fullContent);
        try { if (conv) conv.updated = Date.now(); } catch (e) {}
        try { if (typeof persistState === 'function') persistState(true); } catch (e2) {}
        refreshPanel();
    }
    function statusSystemBlock() {
        var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
        var tables = listTables(activeCharacter(conv));
        var parts = ['【状态中心·只读·禁止在正文复述或打印】玩家本人不要写入状态表。更新只用末尾隐藏标签，正文里不要出现表。'];
        if (!tables.length) {
            parts.push('当前还没有表。');
        } else {
            tables.forEach(function (t) {
                parts.push('<StatusTable name="' + t.name + '">\n' + t.content + '\n</StatusTable>');
            });
        }
        var block = parts.join('\n');
        if (block.length > 8000) block = block.slice(0, 8000);
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
                        var msgs = payload.messages.slice();
                        msgs.splice(Math.min(1, msgs.length), 0, { role: 'system', content: statusSystemBlock() });
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
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);padding:16px;';
        modal.innerHTML =
            '<div style="background:#f6f1e8;color:#2b241c;width:min(720px,100%);max-height:86vh;margin:8vh auto 0;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);">' +
            '<b>状态中心</b><button type="button" id="otStatusClose" style="border:0;background:#eee;border-radius:8px;padding:4px 10px;">关闭</button></div>' +
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
        document.getElementById('otStatusModal').style.display = 'block';
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
            listEl.innerHTML = '<div style="opacity:.6;padding:8px;">还没有表。模型回完一轮后出现在这里，不会写进聊天正文。</div>';
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
        if (detail && tables[0]) detail.textContent = tables[0].content || '';
    }
    function injectFab() {
        if (document.getElementById('otStatusFab')) return;
        var btn = document.createElement('button');
        btn.id = 'otStatusFab';
        btn.type = 'button';
        btn.textContent = '状态中心';
        btn.style.cssText = 'position:fixed;right:12px;bottom:96px;z-index:2147483000;padding:8px 12px;border-radius:999px;border:1px solid rgba(0,0,0,.12);background:#fff7ee;color:#2b241c;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.12);';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openModal();
        });
        document.body.appendChild(btn);
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
                        if (typeof a === 'string') arguments[0] = stripTables(a, true);
                        if (typeof b === 'string') arguments[1] = stripTables(b, true);
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
    function boot() {
        installHooks();
        injectFab();
        ensureModal();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    else setTimeout(boot, 0);
    window.addEventListener('load', function () { setTimeout(boot, 80); });
    setInterval(function () { try { injectFab(); } catch (e) {} }, 2500);
})();
