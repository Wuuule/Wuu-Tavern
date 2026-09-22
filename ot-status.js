/** OpenTavern Status Center. Persist tables; do not dump them on send. */
(function () {
    var SETTINGS_KEY = 'otStatusCenter';
    var MAX_TABLES = 50;
    var TABLE_RE = /<(?:StatusTable|OTTable|Ledger)\b([^>]*)>([\s\S]*?)<\/(?:StatusTable|OTTable|Ledger)>/gi;
    var OPEN_RE = /<(?:StatusTable|OTTable|Ledger)\b/i;
    var BOOK_MARKER = '[StatusTable:';
    var TOOL_LIST = 'status_list';
    var TOOL_GET = 'status_get';

    function defaults() {
        return { enabled: true, hide: true, modelLookup: true, writeCard: true, writeWorld: true };
    }
    function getCfg() {
        var base = defaults();
        try { var s = window.state && state.settings && state.settings[SETTINGS_KEY]; if (s && typeof s === 'object') Object.assign(base, s); } catch (e) {}
        return base;
    }
    function setCfg(patch) {
        if (!window.state) return;
        if (!state.settings) state.settings = {};
        state.settings[SETTINGS_KEY] = Object.assign(getCfg(), patch || {});
        if (typeof persistState === 'function') persistState(true);
    }
    function stripTables(text, allowPartial) {
        var src = text == null ? '' : String(text);
        if (!src) return src;
        src = src.replace(TABLE_RE, '');
        if (allowPartial) { var open = src.search(OPEN_RE); if (open >= 0) src = src.slice(0, open); }
        return src.replace(/\n{3,}/g, '\n\n').trimEnd();
    }
    function attrName(attrStr, tagFallback) {
        var raw = attrStr || '';
        var m = raw.match(/\bname\s*=\s*["']([^"']+)["']/i) || raw.match(/\bid\s*=\s*["']([^"']+)["']/i);
        if (m && m[1]) return String(m[1]).trim().slice(0, 40);
        return tagFallback || 'untitled';
    }
    function parseTables(text) {
        var src = text == null ? '' : String(text);
        var out = []; var re = new RegExp(TABLE_RE.source, 'gi'); var m;
        while ((m = re.exec(src))) {
            var full = m[0], attrs = m[1] || '', body = String(m[2] || '').trim();
            var tag = (full.match(/^<([A-Za-z]+)/) || [])[1] || 'OTTable';
            var name = attrName(attrs, tag === 'Ledger' ? 'Ledger' : '');
            if (!name) name = 'table-' + (out.length + 1);
            if (!body) continue;
            if (body.length > 8000) body = body.slice(0, 8000);
            out.push({ name: name, content: body });
        }
        return out;
    }
    function activeCharacter(conv) {
        if (!conv) return null;
        if (typeof isGroupChat === 'function' && isGroupChat(conv) && typeof getCurrentSpeakerCharacter === 'function') {
            return getCurrentSpeakerCharacter(conv) || conv.character || null;
        }
        return conv.character || null;
    }
    function listTables(character) {
        if (!character || !character.extensions) return [];
        return Array.isArray(character.extensions.otStatusTables) ? character.extensions.otStatusTables : [];
    }
    function ensureExt(character) {
        if (!character.extensions || typeof character.extensions !== 'object') character.extensions = {};
        if (!Array.isArray(character.extensions.otStatusTables)) character.extensions.otStatusTables = [];
        return character.extensions.otStatusTables;
    }
    function upsertTablesOnCard(character, tables) {
        if (!character || !tables.length) return false;
        var list = ensureExt(character);
        tables.forEach(function (table) {
            var idx = -1;
            for (var i = 0; i < list.length; i++) if (list[i] && list[i].name === table.name) { idx = i; break; }
            var row = { name: table.name, content: table.content, updated: Date.now() };
            if (idx >= 0) list[idx] = row; else list.push(row);
        });
        while (list.length > MAX_TABLES) list.shift();
        return true;
    }
    function ensureCharacterBook(character) {
        if (!character.character_book || typeof character.character_book !== 'object') character.character_book = { name: 'status-center', entries: [] };
        if (!Array.isArray(character.character_book.entries)) character.character_book.entries = [];
        return character.character_book;
    }
    function upsertBookEntries(character, tables) {
        if (!character || !tables.length) return false;
        var book = ensureCharacterBook(character);
        tables.forEach(function (table) {
            var comment = BOOK_MARKER + table.name + ']';
            var hit = null;
            book.entries.forEach(function (e) { if (e && e.comment === comment) hit = e; });
            if (!hit) {
                hit = { keys: [table.name], secondary_keys: [], comment: comment, content: '', constant: false, enabled: true, insertion_order: 10 };
                book.entries.push(hit);
            }
            hit.content = 'Status table [' + table.name + ']\n' + table.content;
            hit.constant = false;
            hit.enabled = true;
        });
        return true;
    }
    function applyTables(conv, fullContent) {
        var cfg = getCfg(); if (!cfg.enabled) return;
        var tables = parseTables(fullContent); if (!tables.length) return;
        var character = activeCharacter(conv);
        if (cfg.writeCard && character) {
            upsertTablesOnCard(character, tables);
            upsertBookEntries(character, tables);
        }
        conv.updated = Date.now();
        try { if (typeof persistState === 'function') persistState(true); } catch (e) {}
        refreshPanel();
    }
    function toolDefs() {
        return [
            { type: 'function', function: { name: TOOL_LIST, description: 'List status table names stored on the current character. Call this before writing if you need stored state. Returns names only.', parameters: { type: 'object', properties: {} } } },
            { type: 'function', function: { name: TOOL_GET, description: 'Read stored status tables by exact name. Call only for tables needed this turn.', parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] } } }
        ];
    }
    function runTool(name, args) {
        var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
        var tables = listTables(activeCharacter(conv));
        if (name === TOOL_LIST) {
            return JSON.stringify({ tables: tables.map(function (t) { return t.name; }) });
        }
        if (name === TOOL_GET) {
            var want = (args && args.names) || [];
            if (typeof want === 'string') want = [want];
            var found = [];
            want.forEach(function (n) {
                var hit = null;
                tables.forEach(function (t) { if (t.name === n) hit = t; });
                found.push(hit ? { name: hit.name, content: hit.content } : { name: n, missing: true });
            });
            return JSON.stringify({ tables: found });
        }
        return JSON.stringify({ error: 'unknown tool' });
    }
    function attachTools(payload) {
        var tools = Array.isArray(payload.tools) ? payload.tools.slice() : [];
        var have = {};
        tools.forEach(function (t) { if (t && t.function && t.function.name) have[t.function.name] = true; });
        toolDefs().forEach(function (t) { if (!have[t.function.name]) tools.push(t); });
        payload.tools = tools;
        if (!payload.tool_choice) payload.tool_choice = 'auto';
        return payload;
    }
    function looksLikeChatPayload(payload) {
        return payload && Array.isArray(payload.messages) && payload.messages.length && (payload.model || payload.stream === true || payload.max_tokens || payload.temperature != null);
    }
    function parseArgs(raw) {
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch (e) { return {}; }
    }
    function collectToolCalls(choice) {
        var msg = choice && choice.message;
        if (msg && Array.isArray(msg.tool_calls) && msg.tool_calls.length) return msg;
        return null;
    }
    async function completeWithTools(origFetch, input, init, payload, hops) {
        if (hops > 2) return origFetch(input, init);
        var res = await origFetch(input, Object.assign({}, init, { body: JSON.stringify(payload) }));
        var ctype = (res.headers.get('content-type') || '').toLowerCase();
        if (payload.stream || ctype.indexOf('text/event-stream') >= 0) return res;
        var data = await res.clone().json().catch(function () { return null; });
        var msg = data && data.choices && collectToolCalls(data.choices[0]);
        if (!msg) return res;
        payload.messages = payload.messages.concat([msg]);
        msg.tool_calls.forEach(function (call) {
            var fn = call.function || {};
            payload.messages.push({
                role: 'tool',
                tool_call_id: call.id,
                name: fn.name,
                content: runTool(fn.name, parseArgs(fn.arguments))
            });
        });
        return completeWithTools(origFetch, input, init, payload, hops + 1);
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
                        payload = attachTools(payload);
                        return completeWithTools(origFetch, input, init, payload, 0);
                    }
                }
            } catch (e) {}
            return origFetch.apply(this, arguments);
        };
        window.fetch.__otStatusWrapped = true;
    }
    function refreshPanel() {
        var listEl = document.getElementById('otStatusTableList'); if (!listEl) return;
        var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
        var tables = listTables(activeCharacter(conv));
        if (!tables.length) { listEl.textContent = 'No tables on this character.'; return; }
        listEl.innerHTML = tables.map(function (t) {
            return '<div style="margin:0 0 8px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;"><b>' + String(t.name).replace(/</g,'<') + '</b></div>';
        }).join('');
    }
    function installHooks() {
        interceptOutgoingChat();
        if (typeof formatMessage === 'function' && !formatMessage.__otStatusWrapped) {
            var origFormat = formatMessage;
            formatMessage = function (message, context) {
                var out = origFormat.apply(this, arguments);
                var cfg = getCfg(); if (!cfg.enabled || !cfg.hide) return out;
                var phase = context && (context.processingPhase || (context.forPrompt === true ? 'prompt' : 'display'));
                if (phase === 'prompt') return out;
                return stripTables(out, false);
            };
            formatMessage.__otStatusWrapped = true;
        }
        if (typeof finishAssistantMessage === 'function' && !finishAssistantMessage.__otStatusWrapped) {
            var origFinish = finishAssistantMessage;
            finishAssistantMessage = function (conv, fullContent) {
                var result = origFinish.apply(this, arguments);
                try { applyTables(conv, fullContent); } catch (err) { console.warn('[status-center]', err); }
                return result;
            };
            finishAssistantMessage.__otStatusWrapped = true;
        }
    }
    function injectPanel() {
        var host = document.getElementById('authorsNoteDialog');
        if (!host || document.getElementById('otStatusPanel')) return;
        var cfg = getCfg();
        var box = document.createElement('div');
        box.id = 'otStatusPanel';
        box.style.cssText = 'margin:10px 0 0;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:12px;';
        box.innerHTML = '<div style="font-weight:600">Status Center</div>' +
            '<label style="display:block"><input type="checkbox" id="otStEnabled"> Enable</label>' +
            '<label style="display:block"><input type="checkbox" id="otStHide"> Hide tags in bubble</label>' +
            '<label style="display:block"><input type="checkbox" id="otStLook"> Model looks up tables (no dump on send)</label>' +
            '<label style="display:block"><input type="checkbox" id="otStCard"> Write to character card</label>' +
            '<div id="otStatusTableList"></div>';
        host.appendChild(box);
        function bind(id, key) { var el = document.getElementById(id); if (!el) return; el.checked = !!cfg[key]; el.addEventListener('change', function () { var p={}; p[key]=!!el.checked; setCfg(p); }); }
        bind('otStEnabled','enabled'); bind('otStHide','hide'); bind('otStLook','modelLookup'); bind('otStCard','writeCard');
        refreshPanel();
    }
    function boot() { installHooks(); injectPanel(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    else setTimeout(boot, 0);
    window.addEventListener('load', function () { setTimeout(boot, 50); });
})();
