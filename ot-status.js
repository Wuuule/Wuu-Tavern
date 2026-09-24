/** Status Center UI. Core runtime lives inside index.html's main IIFE. */
(function () {
    'use strict';
    var selectedTableName = '';
    var historyOpen = false;

    function runtime() {
        return window.OpenTavernStatusCenterRuntime || null;
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[c];
        });
    }

    function formatUpdated(ts) {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleString();
        } catch (_) {
            return '';
        }
    }

    function getTables() {
        var rt = runtime();
        if (!rt || typeof rt.listTables !== 'function') return [];
        try {
            var tables = rt.listTables();
            return Array.isArray(tables) ? tables : [];
        } catch (err) {
            console.warn('[Status Center UI] listTables failed', err);
            return [];
        }
    }

    function ensureModal() {
        if (document.getElementById('otStatusModal')) return;

        // Namespaced responsive rules; do not alter OpenTavern's other modals.
        if (!document.getElementById('otStatusResponsiveStyle')) {
            var style = document.createElement('style');
            style.id = 'otStatusResponsiveStyle';
            style.textContent = '@media(max-width:640px){' +
                '#otStatusModal{padding:8px!important;}' +
                '#otStatusShell{width:100%!important;height:calc(100dvh - 16px)!important;margin:0!important;}' +
                '#otStatusLayout{flex-direction:column!important;}' +
                '#otStatusTableList{display:flex!important;flex:none!important;width:100%!important;' +
                    'min-width:0!important;max-height:104px!important;gap:6px!important;' +
                    'border-right:0!important;border-bottom:1px solid rgba(127,127,127,.22)!important;}' +
                '#otStatusTableList button{display:inline-block!important;width:auto!important;flex:none!important;}' +
                '}';
            document.head.appendChild(style);
        }

        var modal = document.createElement('div');
        modal.id = 'otStatusModal';
        modal.style.cssText =
            'display:none;position:fixed;inset:0;z-index:2147483000;' +
            'background:rgba(0,0,0,.48);padding:16px;box-sizing:border-box;';

        modal.innerHTML =
            '<div id="otStatusShell" style="background:var(--bg-primary,#f6f1e8);color:var(--text-primary,#2b241c);' +
            'width:min(860px,100%);height:min(78vh,720px);margin:7vh auto 0;border-radius:16px;' +
            'display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 70px rgba(0,0,0,.28);">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;' +
                'padding:12px 16px;border-bottom:1px solid rgba(127,127,127,.22);">' +
                    '<div>' +
                        '<div style="font-weight:700;">状态中心</div>' +
                        '<div id="otStatusMeta" style="font-size:11px;opacity:.62;margin-top:2px;"></div>' +
                    '</div>' +
                    '<button type="button" id="otStatusClose" style="border:1px solid rgba(127,127,127,.22);' +
                    'background:transparent;color:inherit;border-radius:8px;padding:5px 11px;cursor:pointer;">关闭</button>' +
                '</div>' +
                '<div id="otStatusLayout" style="display:flex;min-height:0;flex:1;overflow:hidden;">' +
                    '<div id="otStatusTableList" style="width:min(34%,260px);min-width:150px;' +
                    'border-right:1px solid rgba(127,127,127,.22);overflow:auto;padding:9px;"></div>' +
                    '<div style="min-width:0;flex:1;display:flex;flex-direction:column;">' +
                        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding-right:12px;">' +
                            '<div id="otStatusTitle" style="font-weight:700;padding:12px 14px 0;"></div>' +
                            '<button type="button" id="otStatusHistoryToggle" style="display:none;cursor:pointer;' +
                                'border:1px solid rgba(127,127,127,.23);border-radius:9px;padding:5px 10px;' +
                                'background:transparent;color:inherit;font-size:12px;">历史版本</button>' +
                        '</div>' +
                        '<div id="otStatusUpdated" style="font-size:11px;opacity:.58;padding:3px 14px 0;"></div>' +
                        '<pre id="otStatusDetail" style="flex:1;margin:0;padding:12px 14px 16px;overflow:auto;' +
                        'white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"></pre>' +
                        '<div id="otStatusHistoryPane" style="display:none;flex:1;overflow:auto;padding:10px 14px 16px;"></div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });
        document.getElementById('otStatusClose').onclick = function () {
            modal.style.display = 'none';
        };
        document.getElementById('otStatusHistoryToggle').onclick = function () {
            if (!selectedTableName) return;
            setHistoryVisible(!historyOpen);
            if (historyOpen) renderHistoryPanel(selectedTableName);
        };
        // Optional panels are loaded separately: fire once the lazy modal exists.
        window.dispatchEvent(new CustomEvent('ot-status-modal-created'));
    }

    function getHistory(name) {
        var rt = runtime();
        if (!rt || typeof rt.listTableHistory !== 'function') return [];
        try {
            var result = rt.listTableHistory(name);
            return Array.isArray(result) ? result : [];
        } catch (err) {
            console.warn('[Status Center UI] Cannot read revisions', err);
            return [];
        }
    }

    function setHistoryVisible(visible) {
        historyOpen = !!visible;
        var detail = document.getElementById('otStatusDetail');
        var pane = document.getElementById('otStatusHistoryPane');
        var button = document.getElementById('otStatusHistoryToggle');
        if (detail) detail.style.display = historyOpen ? 'none' : 'block';
        if (pane) pane.style.display = historyOpen ? 'block' : 'none';
        if (button) button.textContent = historyOpen ? '返回当前表' : '历史版本';
    }

    // Build revision cards using textContent, never interpolating table data as HTML.
    function renderHistoryPanel(tableName) {
        var pane = document.getElementById('otStatusHistoryPane');
        if (!pane) return;
        pane.replaceChildren();
        var versions = getHistory(tableName);
        if (!versions.length) {
            pane.textContent = '暂无可恢复的历史版本。';
            return;
        }
        versions.forEach(function(entry) {
            var card = document.createElement('section');
            card.style.cssText = 'margin-bottom:10px;padding:10px;border-radius:10px;' +
                'border:1px solid rgba(127,127,127,.22);';
            var header = document.createElement('div');
            header.style.cssText = 'font-size:12px;opacity:.8;margin-bottom:9px;';
            header.textContent = 'rev ' + entry.revision + ' · ' +
                formatUpdated(entry.capturedAt || entry.updated) +
                (entry.source === 'manual-rollback' ? ' · 恢复前备份' : '');
            card.appendChild(header);

            var previewButton = document.createElement('button');
            previewButton.type = 'button';
            previewButton.textContent = '预览内容';
            previewButton.style.cssText = 'margin-right:8px;padding:5px 9px;border-radius:8px;' +
                'cursor:pointer;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;';
            var preview = document.createElement('pre');
            preview.style.cssText = 'display:none;white-space:pre-wrap;overflow-wrap:anywhere;' +
                'font:12px/1.6 ui-monospace,monospace;max-height:260px;overflow:auto;margin:10px 0 0;';
            preview.textContent = entry.content;
            previewButton.onclick = function() {
                preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
            };
            card.appendChild(previewButton);

            var restoreButton = document.createElement('button');
            restoreButton.type = 'button';
            restoreButton.textContent = '恢复此版本';
            restoreButton.style.cssText = 'padding:5px 9px;border-radius:8px;cursor:pointer;' +
                'border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;';
            restoreButton.onclick = async function() {
                var rt = runtime();
                if (!rt || typeof rt.restoreRevision !== 'function') return;
                if (!window.confirm('将当前对话「' + tableName + '」恢复到 rev ' +
                    entry.revision + '？当前版本会自动保留在历史中。')) return;
                restoreButton.disabled = true;
                try {
                    var result = await rt.restoreRevision(tableName, entry.revision);
                    refreshPanel(tableName);
                    if (!result || !result.ok) {
                        window.alert(result && result.error ? result.error : '恢复失败，未确认保存。');
                    }
                } catch (err) {
                    console.error('[Status Center UI] Restore failed', err);
                    window.alert('恢复失败。请检查浏览器存储后重试。');
                } finally {
                    restoreButton.disabled = false;
                }
            };
            card.appendChild(restoreButton);
            card.appendChild(preview);
            pane.appendChild(card);
        });
    }

    function showTable(tables, index) {
        var title = document.getElementById('otStatusTitle');
        var updated = document.getElementById('otStatusUpdated');
        var detail = document.getElementById('otStatusDetail');
        var list = document.getElementById('otStatusTableList');
        if (!title || !updated || !detail || !list) return;

        if (!tables.length) {
            selectedTableName = '';
            setHistoryVisible(false);
            var emptyToggle = document.getElementById('otStatusHistoryToggle');
            if (emptyToggle) emptyToggle.style.display = 'none';
            title.textContent = '';
            updated.textContent = '';
            detail.textContent = '';
            return;
        }

        index = Math.max(0, Math.min(Number(index) || 0, tables.length - 1));
        var table = tables[index];
        selectedTableName = table.name || '';
        setHistoryVisible(false);
        var toggle = document.getElementById('otStatusHistoryToggle');
        if (toggle) toggle.style.display = getHistory(selectedTableName).length ? 'inline-flex' : 'none';
        title.textContent = table.name || '';
        updated.textContent = table.updated
            ? ('更新：' + formatUpdated(table.updated) + ' · rev ' + (Number(table.revision) || 0))
            : '';
        detail.textContent = table.content || '';

        list.querySelectorAll('button[data-status-index]').forEach(function (button) {
            var active = Number(button.getAttribute('data-status-index')) === index;
            button.style.background = active ? 'rgba(127,127,127,.16)' : 'transparent';
            button.style.fontWeight = active ? '700' : '500';
        });
    }

    function refreshPanel(preferredName) {
        ensureModal();

        var list = document.getElementById('otStatusTableList');
        var meta = document.getElementById('otStatusMeta');
        if (!list || !meta) return;

        var rt = runtime();
        var tables = getTables();
        var convId = '';
        try {
            convId = rt && typeof rt.getCurrentConversationId === 'function'
                ? (rt.getCurrentConversationId() || '')
                : '';
        } catch (_) {}

        meta.textContent = tables.length
            ? (tables.length + ' 张表' + (convId ? ' · 当前对话' : ''))
            : '当前对话还没有状态表';

        if (!tables.length) {
            list.innerHTML =
                '<div style="opacity:.65;padding:10px 8px;line-height:1.6;">' +
                '还没有表。<br>模型完成下一轮后会自动创建 Scene Anchor；' +
                '角色卡或世界书定义了状态规则时，也会在这里创建对应表。</div>';
            showTable([], 0);
            return;
        }

        list.innerHTML = tables.map(function (table, i) {
            var name = esc(table.name || ('Table ' + (i + 1)));
            return '<button type="button" data-status-index="' + i + '" style="' +
                'display:block;width:100%;text-align:left;color:inherit;cursor:pointer;' +
                'margin:0 0 6px;padding:9px 10px;border:1px solid rgba(127,127,127,.18);' +
                'border-radius:9px;background:transparent;">' + name + '</button>';
        }).join('');

        list.querySelectorAll('button[data-status-index]').forEach(function (button) {
            button.onclick = function () {
                showTable(tables, Number(button.getAttribute('data-status-index')));
            };
        });

        var selected = 0;
        if (preferredName || selectedTableName) {
            var targetName = preferredName || selectedTableName;
            for (var i = 0; i < tables.length; i++) {
                if (tables[i] && tables[i].name === targetName) {
                    selected = i;
                    break;
                }
            }
        }
        showTable(tables, selected);
    }

    function injectFab() {
        if (document.getElementById('otStatusFab')) return;

        var button = document.createElement('button');
        button.id = 'otStatusFab';
        button.type = 'button';
        button.textContent = '状态中心';
        button.style.cssText =
            'position:fixed;right:12px;bottom:96px;z-index:2147482999;' +
            'padding:8px 13px;border-radius:999px;border:1px solid rgba(127,127,127,.28);' +
            'background:var(--bg-primary,#fff7ee);color:var(--text-primary,#2b241c);' +
            'font-size:13px;font-weight:650;box-shadow:0 4px 18px rgba(0,0,0,.12);cursor:pointer;';

        button.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            ensureModal();
            refreshPanel();
            document.getElementById('otStatusModal').style.display = 'block';
        };
        document.body.appendChild(button);
    }

    function boot() {
        injectFab();
        ensureModal();
        refreshPanel();
    }

    window.addEventListener('ot-status-center-updated', function () {
        var modal = document.getElementById('otStatusModal');
        if (modal && modal.style.display !== 'none') refreshPanel();
    });

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) injectFab();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
    window.addEventListener('load', function () {
        injectFab();
        refreshPanel();
    });
})();
