/** Status Center UI. Core runtime lives inside index.html's main IIFE. */
(function () {
    'use strict';

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

        var modal = document.createElement('div');
        modal.id = 'otStatusModal';
        modal.style.cssText =
            'display:none;position:fixed;inset:0;z-index:2147483000;' +
            'background:rgba(0,0,0,.48);padding:16px;box-sizing:border-box;';

        modal.innerHTML =
            '<div style="background:var(--bg-primary,#f6f1e8);color:var(--text-primary,#2b241c);' +
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
                '<div style="display:flex;min-height:0;flex:1;overflow:hidden;">' +
                    '<div id="otStatusTableList" style="width:min(34%,260px);min-width:150px;' +
                    'border-right:1px solid rgba(127,127,127,.22);overflow:auto;padding:9px;"></div>' +
                    '<div style="min-width:0;flex:1;display:flex;flex-direction:column;">' +
                        '<div id="otStatusTitle" style="font-weight:700;padding:12px 14px 0;"></div>' +
                        '<div id="otStatusUpdated" style="font-size:11px;opacity:.58;padding:3px 14px 0;"></div>' +
                        '<pre id="otStatusDetail" style="flex:1;margin:0;padding:12px 14px 16px;overflow:auto;' +
                        'white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"></pre>' +
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
    }

    function showTable(tables, index) {
        var title = document.getElementById('otStatusTitle');
        var updated = document.getElementById('otStatusUpdated');
        var detail = document.getElementById('otStatusDetail');
        var list = document.getElementById('otStatusTableList');
        if (!title || !updated || !detail || !list) return;

        if (!tables.length) {
            title.textContent = '';
            updated.textContent = '';
            detail.textContent = '';
            return;
        }

        index = Math.max(0, Math.min(Number(index) || 0, tables.length - 1));
        var table = tables[index];
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
        if (preferredName) {
            for (var i = 0; i < tables.length; i++) {
                if (tables[i] && tables[i].name === preferredName) {
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
