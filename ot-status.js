/**
 * OpenTavern Status Center — generic overlay, not bound to any scenario.
 */
(function () {
    var SETTINGS_KEY = 'otStatusCenter';
    var MAX_TABLES = 50;
    var TABLE_RE = /<(?:StatusTable|OTTable|Ledger)\b([^>]*)>([\s\S]*?)<\/(?:StatusTable|OTTable|Ledger)>/gi;
    var OPEN_RE = /<(?:StatusTable|OTTable|Ledger)\b/i;
    var BOOK_MARKER = '【状态表:';

    function defaults() {
        return { enabled: true, hide: true, writeCard: true, writeWorld: true, writeNoteIndex: false };
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
    function stripTables(text, allowPartial) {
        var src = text == null ? '' : String(text);
        if (!src) return src;
        src = src.replace(TABLE_RE, '');
        if (allowPartial) {
            var open = src.search(OPEN_RE);
            if (open >= 0) src = src.slice(0, open);
        }
        return src.replace(/\n{3,}/g, '\n\n').trimEnd();
    }
    function attrName(attrStr, tagFallback) {
        var raw = attrStr || '';
        var m = raw.match(/\bname\s*=\s*["']([^"']+)["']/i) || raw.match(/\bid\s*=\s*["']([^"']+)["']/i);
        if (m && m[1]) return String(m[1]).trim().slice(0, 40);
        return tagFallback || '未命名';
    }
    function parseTables(text) {
        var src = text == null ? '' : String(text);
        var out = [];
        var re = new RegExp(TABLE_RE.source, 'gi');
        var m;
        while ((m = re.exec(src))) {
            var full = m[0];
            var attrs = m[1] || '';
            var body = String(m[2] || '').trim();
            var tag = (full.match(/^<([A-Za-z]+)/) || [])[1] || 'OTTable';
            var name = attrName(attrs, tag === 'Ledger' ? 'Ledger' : '');
            if (!name) name = '表' + (out.length + 1);
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
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].name === table.name) { idx = i; break; }
            }
            var row = { name: table.name, content: table.content, updated: Date.now() };
            if (idx >= 0) list[idx] = row; else list.push(row);
        });
        while (list.length > MAX_TABLES) list.shift();
        return true;
    }
    function ensureCharacterBook(character) {
        if (!character.character_book || typeof character.character_book !== 'object') {
            character.character_book = { name: 'status-center', entries: [] };
        }
        if (!Array.isArray(character.character_book.entries)) character.character_book.entries = [];
        return character.character_book;
    }
    function upsertBookEntries(character, tables) {
        if (!character || !tables.length) return false;
        var book = ensureCharacterBook(character);
        tables.forEach(function (table) {
            var comment = BOOK_MARKER + table.name + '】';
            var hit = null;
            book.entries.forEach(function (e) { if (e && e.comment === comment) hit = e; });
            if (!hit) {
                hit = { keys: [table.name, comment], secondary_keys: [], comment: comment, content: '', constant: true, enabled: true, insertion_order: 10, extensions: { position: 1 } };
                book.entries.push(hit);
            }
            hit.content = '状态表「' + table.name + '」\n' + table.content;
            hit.constant = true; hit.enabled = true; hit.disable = false;
        });
        return true;
    }
    function upsertWorldBookMirror(conv, tables) {
        if (!conv || !tables.length || typeof createNewWorldBook !== 'function' || !window.state) return false;
        if (!state.worldBooks) state.worldBooks = {};
        var BOOK_NAME = 'OT状态中心';
        var found = null;
        Object.keys(state.worldBooks).forEach(function (id) {
            var wb = state.worldBooks[id];
            if (wb && wb.name === BOOK_NAME) found = wb;
        });
        if (!found) found = createNewWorldBook(BOOK_NAME);
        if (!found) return false;
        if (!Array.isArray(conv.worldBookIds)) conv.worldBookIds = [];
        if (conv.worldBookIds.indexOf(found.id) < 0) conv.worldBookIds.unshift(found.id);
        if (!found.entries || typeof found.entries !== 'object') found.entries = {};
        tables.forEach(function (table) {
            var comment = BOOK_MARKER + table.name + '】';
            var hit = null;
            Object.keys(found.entries).forEach(function (uid) {
                var e = found.entries[uid];
                if (e && e.comment === comment) hit = e;
            });
            if (!hit && typeof createDefaultWIEntry === 'function') {
                hit = createDefaultWIEntry();
                found.entries[hit.uid] = hit;
            } else if (!hit) {
                var uid = Date.now();
                hit = { uid: uid, comment: comment, key: [table.name], content: '', constant: true };
                found.entries[uid] = hit;
            }
            hit.comment = comment; hit.key = [table.name];
            hit.content = '状态表「' + table.name + '」\n' + table.content;
            hit.constant = true; hit.disable = false;
            if (typeof WI_POS !== 'undefined') hit.position = WI_POS.AFTER_CHAR;
        });
        return true;
    }
    function writeNoteIndex(conv, tables) {
        if (!conv || !tables.length) return false;
        var names = tables.map(function (t) { return t.name; }).join('、');
        var note = (typeof getChatAuthorsNote === 'function' && getChatAuthorsNote(conv))
            || (typeof defaultAuthorsNote === 'function' ? defaultAuthorsNote() : { text: '', enabled: true, depth: 4, position: 'after', role: 'system', interval: 1 });
        var start = '【状态中心】';
        var end = '【状态中心结束】';
        var block = start + '\n状态中心已更新：' + names + '\n' + end;
        var raw = note.text || '';
        if (raw.indexOf(start) >= 0 && raw.indexOf(end) >= 0) note.text = raw.replace(new RegExp(start + '[\\s\\S]*?' + end), block);
        else note.text = raw ? raw + '\n\n' + block : block;
        note.enabled = note.enabled !== false;
        conv.authorsNote = note;
        return true;
    }
    function syncCharacterRegistry(character) {
        if (!character || !window.state || !state.characters) return;
        var id = character.id || character.name;
        if (!id) return;
        var stored = state.characters[id];
        if (stored && stored !== character) {
            stored.extensions = character.extensions;
            stored.character_book = character.character_book;
        }
    }
    function applyTables(conv, fullContent) {
        var cfg = getCfg();
        if (!cfg.enabled) return;
        var tables = parseTables(fullContent);
        if (!tables.length) return;
        var character = activeCharacter(conv);
        var changed = false;
        if (cfg.writeCard && character) {
            if (upsertTablesOnCard(character, tables)) changed = true;
            if (upsertBookEntries(character, tables)) changed = true;
            syncCharacterRegistry(character);
        }
        if (cfg.writeWorld && upsertWorldBookMirror(conv, tables)) changed = true;
        if (cfg.writeNoteIndex && writeNoteIndex(conv, tables)) changed = true;
        if (!changed) return;
        conv.updated = Date.now();
        if (conv._wiCache) conv._wiCache = null;
        try { if (typeof persistState === 'function') persistState(true); } catch (e) {}
        refreshPanel();
    }
    function listTables(character) {
        if (!character || !character.extensions) return [];
        return Array.isArray(character.extensions.otStatusTables) ? character.extensions.otStatusTables : [];
    }
    function escapeMini(s) {
        return String(s == null ? '' : s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
    }
    function refreshPanel() {
        var listEl = document.getElementById('otStatusTableList');
        if (!listEl) return;
        var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
        var tables = listTables(activeCharacter(conv));
        if (!tables.length) {
            listEl.textContent = '当前角色还没有状态表。模型输出 <StatusTable name="表名">内容</StatusTable> 后会出现在这里，最多 50 张。';
            return;
        }
        listEl.innerHTML = tables.map(function (t) {
            var preview = String(t.content || '').replace(/\s+/g, ' ').slice(0, 80);
            return '<div style="margin:0 0 8px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;">' +
                '<div style="font-weight:600;">' + escapeMini(t.name) + '</div>' +
                '<div style="opacity:.75;word-break:break-all;">' + escapeMini(preview) + '</div></div>';
        }).join('');
    }
    function installHooks() {
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
        if (typeof formatStreamingPlainHtml === 'function' && !formatStreamingPlainHtml.__otStatusWrapped) {
            var origStream = formatStreamingPlainHtml;
            formatStreamingPlainHtml = function (text) {
                var cfg = getCfg();
                if (cfg.enabled && cfg.hide) text = stripTables(text, true);
                return origStream.call(this, text);
            };
            formatStreamingPlainHtml.__otStatusWrapped = true;
        }
        if (typeof renderStreamingContentFast === 'function' && !renderStreamingContentFast.__otStatusWrapped) {
            var origFast = renderStreamingContentFast;
            renderStreamingContentFast = function (el, text) {
                var cfg = getCfg();
                if (cfg.enabled && cfg.hide) text = stripTables(text, true);
                return origFast.call(this, el, text);
            };
            renderStreamingContentFast.__otStatusWrapped = true;
        }
        if (typeof finishAssistantMessage === 'function' && !finishAssistantMessage.__otStatusWrapped) {
            var origFinish = finishAssistantMessage;
            finishAssistantMessage = function (conv, fullContent) {
                var result = origFinish.apply(this, arguments);
                try { applyTables(conv, fullContent); } catch (err) { console.warn('[OT状态中心]', err); }
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
        box.style.cssText = 'margin:10px 0 0;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:12px;line-height:1.6;';
        box.innerHTML =
            '<div style="font-weight:600;margin-bottom:6px;">状态中心（通用）</div>' +
            '<label style="display:block;"><input type="checkbox" id="otStEnabled"> 启用</label>' +
            '<label style="display:block;"><input type="checkbox" id="otStHide"> 气泡隐藏状态表</label>' +
            '<label style="display:block;"><input type="checkbox" id="otStCard"> 写入当前角色卡（最多50张，导出跟卡）</label>' +
            '<label style="display:block;"><input type="checkbox" id="otStWorld"> 同步世界书 OT状态中心</label>' +
            '<label style="display:block;"><input type="checkbox" id="otStNote"> 作者注释只记表名</label>' +
            '<div style="opacity:.7;margin:6px 0;">模型输出 <StatusTable name="表名">内容</StatusTable></div>' +
            '<div id="otStatusTableList"></div>';
        host.appendChild(box);
        function bind(id, key) {
            var el = document.getElementById(id);
            if (!el) return;
            el.checked = !!cfg[key];
            el.addEventListener('change', function () {
                var p = {}; p[key] = !!el.checked; setCfg(p);
            });
        }
        bind('otStEnabled', 'enabled');
        bind('otStHide', 'hide');
        bind('otStCard', 'writeCard');
        bind('otStWorld', 'writeWorld');
        bind('otStNote', 'writeNoteIndex');
        refreshPanel();
        if (document.getElementById('authorsNoteBtn')) {
            document.getElementById('authorsNoteBtn').addEventListener('click', function () { setTimeout(refreshPanel, 0); });
        }
    }
    function boot() { installHooks(); injectPanel(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    else setTimeout(boot, 0);
    window.addEventListener('load', function () { setTimeout(boot, 50); });
})();
