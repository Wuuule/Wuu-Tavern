/**
 * Wuu-Tavern ledger hooks
 * - Hide <Ledger> in the bubble (kept in stored message / next-turn prompt)
 * - After each assistant reply, write ledger into this chat's Author's Note
 *   and a Constant world-book entry named 【当前账本】
 */
(function () {
    var MARK_START = '【账本·自动写入】';
    var MARK_END = '【账本结束】';
    var BOOK_NAME = 'Wuu账本';
    var ENTRY_COMMENT = '【当前账本】';
    var SETTINGS_KEY = 'wuuLedger';

    function defaults() {
        return { hide: true, writeNote: true, writeWorld: true, enabled: true };
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

    function stripLedger(text, allowPartial) {
        var src = text == null ? '' : String(text);
        if (!src) return src;
        src = src.replace(/<Ledger\b[^>]*>[\s\S]*?<\/Ledger>/gi, '');
        if (allowPartial) {
            var open = src.search(/<Ledger\b/i);
            if (open >= 0) src = src.slice(0, open);
        }
        return src.replace(/\n{3,}/g, '\n\n').trimEnd();
    }

    function extractLedger(text) {
        var src = text == null ? '' : String(text);
        var m = src.match(/<Ledger\b[^>]*>([\s\S]*?)<\/Ledger>/i);
        if (!m) return '';
        var body = String(m[1] || '').trim();
        if (body.length < 8) return '';
        if (!/第\s*\d+\s*天/.test(body) && !/\bD\d+\b/.test(body) && !/日\s*[:：]/.test(body)) return '';
        if (body.length > 4000) body = body.slice(0, 4000);
        return body;
    }

    function wrapAuthorsNote(existing, ledgerBody) {
        var block = MARK_START + '\n' + ledgerBody + '\n' + MARK_END;
        var raw = existing == null ? '' : String(existing);
        if (raw.indexOf(MARK_START) >= 0 && raw.indexOf(MARK_END) >= 0) {
            return raw.replace(
                new RegExp(MARK_START.replace(/[【】]/g, '\\$&') + '[\\s\\S]*?' + MARK_END.replace(/[【】]/g, '\\$&')),
                block
            );
        }
        if (raw.indexOf(MARK_START) >= 0) {
            return raw.replace(new RegExp(MARK_START.replace(/[【】]/g, '\\$&') + '[\\s\\S]*$'), block);
        }
        raw = raw.replace(/\s+$/, '');
        return raw ? (raw + '\n\n' + block) : block;
    }

    function ensureWorldBook(conv) {
        if (!window.state) return null;
        if (!state.worldBooks) state.worldBooks = {};
        if (!Array.isArray(state.worldBookOrder)) state.worldBookOrder = [];
        var found = null;
        Object.keys(state.worldBooks).forEach(function (id) {
            var wb = state.worldBooks[id];
            if (wb && wb.name === BOOK_NAME) found = wb;
        });
        if (!found && typeof createNewWorldBook === 'function') {
            found = createNewWorldBook(BOOK_NAME);
        }
        if (!found) return null;
        if (conv) {
            if (!Array.isArray(conv.worldBookIds)) conv.worldBookIds = [];
            if (conv.worldBookIds.indexOf(found.id) < 0) conv.worldBookIds.unshift(found.id);
        }
        return found;
    }

    function upsertLedgerEntry(book, ledgerBody) {
        if (!book) return false;
        if (!book.entries || typeof book.entries !== 'object') book.entries = {};
        var hit = null;
        Object.keys(book.entries).forEach(function (uid) {
            var e = book.entries[uid];
            if (e && e.comment === ENTRY_COMMENT) hit = e;
        });
        if (!hit && typeof createDefaultWIEntry === 'function') {
            hit = createDefaultWIEntry();
            hit.comment = ENTRY_COMMENT;
            book.entries[hit.uid] = hit;
        } else if (!hit) {
            var uid = Date.now();
            hit = { uid: uid, comment: ENTRY_COMMENT, key: [], content: '', constant: true };
            book.entries[uid] = hit;
        }
        hit.comment = ENTRY_COMMENT;
        hit.content = MARK_START + '\n' + ledgerBody + '\n' + MARK_END +
            '\n进度以本条目和作者注释为准。旧令只记录，不自动开演。禁止把本表打印进正文。';
        hit.constant = true;
        hit.disable = false;
        hit.order = 5;
        if (typeof WI_POS !== 'undefined') hit.position = WI_POS.AFTER_CHAR;
        return true;
    }

    function writeLedger(conv, fullContent) {
        var cfg = getCfg();
        if (!cfg.enabled) return;
        if (!conv || !fullContent) return;
        var body = extractLedger(fullContent);
        if (!body) return;
        var changed = false;
        if (cfg.writeNote) {
            var note = (typeof getChatAuthorsNote === 'function' && getChatAuthorsNote(conv))
                || (typeof defaultAuthorsNote === 'function' ? defaultAuthorsNote() : { text: '', enabled: true, depth: 4, position: 'after', role: 'system', interval: 1 });
            note.text = wrapAuthorsNote(note.text || '', body);
            note.enabled = note.enabled !== false;
            conv.authorsNote = note;
            changed = true;
        }
        if (cfg.writeWorld) {
            var book = ensureWorldBook(conv);
            if (upsertLedgerEntry(book, body)) changed = true;
        }
        if (changed) {
            conv.updated = Date.now();
            if (conv._wiCache) conv._wiCache = null;
            try {
                if (typeof renderAuthorsNoteStatus === 'function') renderAuthorsNoteStatus();
            } catch (e) {}
            try {
                if (typeof persistState === 'function') persistState(true);
            } catch (e) {}
        }
    }

    function installHooks() {
        if (typeof formatMessage === 'function' && !formatMessage.__wuuWrapped) {
            var origFormat = formatMessage;
            formatMessage = function (message, context) {
                var out = origFormat.apply(this, arguments);
                var cfg = getCfg();
                if (!cfg.enabled || !cfg.hide) return out;
                var phase = context && (context.processingPhase || (context.forPrompt === true ? 'prompt' : 'display'));
                if (phase === 'prompt') return out;
                return stripLedger(out, false);
            };
            formatMessage.__wuuWrapped = true;
        }

        if (typeof formatStreamingPlainHtml === 'function' && !formatStreamingPlainHtml.__wuuWrapped) {
            var origStream = formatStreamingPlainHtml;
            formatStreamingPlainHtml = function (text) {
                var cfg = getCfg();
                if (cfg.enabled && cfg.hide) text = stripLedger(text, true);
                return origStream.call(this, text);
            };
            formatStreamingPlainHtml.__wuuWrapped = true;
        }

        if (typeof renderStreamingContentFast === 'function' && !renderStreamingContentFast.__wuuWrapped) {
            var origFast = renderStreamingContentFast;
            renderStreamingContentFast = function (el, text) {
                var cfg = getCfg();
                if (cfg.enabled && cfg.hide) text = stripLedger(text, true);
                return origFast.call(this, el, text);
            };
            renderStreamingContentFast.__wuuWrapped = true;
        }

        if (typeof finishAssistantMessage === 'function' && !finishAssistantMessage.__wuuWrapped) {
            var origFinish = finishAssistantMessage;
            finishAssistantMessage = function (conv, fullContent) {
                var result = origFinish.apply(this, arguments);
                try { writeLedger(conv, fullContent); } catch (err) { console.warn('[Wuu账本]', err); }
                return result;
            };
            finishAssistantMessage.__wuuWrapped = true;
        }
    }

    function injectToggle() {
        var host = document.getElementById('authorsNoteDialog');
        if (!host || document.getElementById('wuuLedgerPanel')) return;
        var cfg = getCfg();
        var box = document.createElement('div');
        box.id = 'wuuLedgerPanel';
        box.style.cssText = 'margin:10px 0 0;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:12px;line-height:1.6;';
        box.innerHTML =
            '<div style="font-weight:600;margin-bottom:6px;">Wuu 账本（本站增强）</div>' +
            '<label style="display:block;"><input type="checkbox" id="wuuLedEnabled"> 启用自动账本</label>' +
            '<label style="display:block;"><input type="checkbox" id="wuuLedHide"> 气泡里隐藏 &lt;Ledger&gt;</label>' +
            '<label style="display:block;"><input type="checkbox" id="wuuLedNote"> 写入本对话作者注释</label>' +
            '<label style="display:block;"><input type="checkbox" id="wuuLedWorld"> 写入世界书「Wuu账本 / 【当前账本】」</label>' +
            '<div style="opacity:.7;margin-top:4px;">模型仍须在回复末尾输出 &lt;Ledger&gt;。存储正文保留该块，只是界面不显示。</div>';
        host.appendChild(box);
        function bind(id, key) {
            var el = document.getElementById(id);
            if (!el) return;
            el.checked = !!cfg[key];
            el.addEventListener('change', function () {
                var p = {};
                p[key] = !!el.checked;
                setCfg(p);
            });
        }
        bind('wuuLedEnabled', 'enabled');
        bind('wuuLedHide', 'hide');
        bind('wuuLedNote', 'writeNote');
        bind('wuuLedWorld', 'writeWorld');
    }

    function boot() {
        installHooks();
        injectToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    } else {
        setTimeout(boot, 0);
    }
    window.addEventListener('load', function () { setTimeout(boot, 50); });
})();
