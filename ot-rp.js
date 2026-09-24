/**
 * Wuu-Tavern: two independent chat status cards + inline image lightbox.
 * Read-only UI: all source-of-truth status data stays in the core runtime.
 * No page-wide MutationObserver, no global style changes.
 */
(function () {
    'use strict';
    var currentConversationId = null;
    var selectedByConversation = Object.create(null);
    var expandedByConversation = Object.create(null);

    var styleText = [
        '#wuuRpDock { flex:0 0 auto; padding:8px 14px; border-bottom:1px solid rgba(127,127,127,.15);',
        'background:var(--bg-primary,rgba(18,18,22,.92)); color:var(--text-primary,inherit); }',
        '#wuuRpDock[hidden],#wuuRpCards[hidden],#wuuImageLightbox[hidden],#wuuImageGallery[hidden] { display:none!important; }',
        '#wuuImageGallery{position:fixed;inset:0;z-index:2147483090;display:flex;align-items:center;justify-content:center;',
        'background:rgba(0,0,0,.82);padding:12px;box-sizing:border-box}',
        '#wuuImageGalleryBody{max-width:min(750px,98vw);width:100%;max-height:87dvh;overflow:auto;',
        'padding:16px;border-radius:16px;background:var(--bg-primary,#232323);color:var(--text-primary,white)}',
        '#wuuImageGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:10px;margin-top:10px}',
        '#wuuImageGrid button{border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;',
        'border-radius:10px;cursor:pointer;padding:5px;min-width:0;overflow:hidden}',
        '#wuuImageGrid img{display:block;max-width:100%;aspect-ratio:1;object-fit:contain}',
        '#wuuRpHead { display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:7px;font-size:12px; }',
        '#wuuRpToggle { flex:none;cursor:pointer;border:1px solid rgba(127,127,127,.25);border-radius:8px;',
        'background:transparent;color:inherit;padding:4px 10px; }',
        '#wuuRpCards { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px; }',
        '.wuu-rp-card { min-width:0;border:1px solid rgba(127,127,127,.2);border-radius:12px;',
        'background:rgba(127,127,127,.055);padding:8px 10px; }',
        '.wuu-rp-title { display:flex;align-items:center;justify-content:space-between;gap:8px;',
        'font-size:12px;font-weight:650;margin-bottom:5px; }',
        '.wuu-rp-title select { font:inherit;font-weight:450;max-width:65%;min-width:0;',
        'border-radius:8px;padding:3px;background:var(--bg-primary,#222);color:inherit;',
        'border:1px solid rgba(127,127,127,.22); }',
        '.wuu-rp-text { white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.5;',
        'max-height:clamp(65px,13vh,126px);overflow:auto;user-select:text; }',
        '.wuu-rp-empty { opacity:.55;font-style:italic; }',
        '#wuuImageLightbox { position:fixed;inset:0;z-index:2147483100;display:flex;',
        'align-items:center;justify-content:center;flex-direction:column;gap:8px;',
        'background:rgba(0,0,0,.9);padding:14px;box-sizing:border-box; }',
        '#wuuImageLightbox img { display:block;max-width:95vw;max-height:84dvh;object-fit:contain; }',
        '#wuuImageLightbox button { align-self:flex-end;color:white;cursor:pointer;',
        'background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.3);',
        'border-radius:10px;padding:7px 15px; }',
        '.msg-bubble img,.msg-attachment-image { max-width:100%;height:auto;cursor:zoom-in; }',
        '@media(max-width:570px) { #wuuRpDock { padding:6px 9px; }',
        '#wuuRpCards { gap:6px; } .wuu-rp-card { padding:7px; }',
        '.wuu-rp-title { flex-wrap:wrap; } .wuu-rp-title select { max-width:100%; }',
        '.wuu-rp-text { max-height:88px; } }'
    ].join('');

    function element(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text != null) el.textContent = text;
        return el;
    }

    function ensureDock() {
        var topbar = document.getElementById('chatTopBar');
        if (!topbar || !topbar.parentNode) return null;
        var dock = document.getElementById('wuuRpDock');
        if (dock) return dock;
        if (!document.getElementById('wuuRpStyle')) {
            var css = document.createElement('style');
            css.id = 'wuuRpStyle';
            css.textContent = styleText;
            document.head.appendChild(css);
        }
        dock = element('section');
        dock.id = 'wuuRpDock';
        dock.hidden = true;
        dock.setAttribute('aria-label', '当前角色与玩家状态');

        var head = element('div');
        head.id = 'wuuRpHead';
        head.appendChild(element('strong', '', '状态速览'));
        var toggle = element('button', '', '收起');
        toggle.id = 'wuuRpToggle';
        toggle.type = 'button';
        toggle.onclick = function() {
            var id = currentConversationId || '';
            expandedByConversation[id] = !isExpanded(id);
            refresh();
        };
        head.appendChild(toggle);
        dock.appendChild(head);
        var cards = element('div');
        cards.id = 'wuuRpCards';
        dock.appendChild(cards);
        topbar.parentNode.insertBefore(dock, topbar.nextSibling);
        return dock;
    }

    function isExpanded(id) { return expandedByConversation[id] !== false; }

    function renderStatusCard(label, value, roleChoices, selectedName, onChange) {
        var article = element('article','wuu-rp-card');
        var header = element('div','wuu-rp-title');
        header.appendChild(element('span','',label));
        if (roleChoices && roleChoices.length > 1) {
            var select = document.createElement('select');
            select.setAttribute('aria-label', '选择当前角色');
            roleChoices.forEach(function(name) {
                var option = element('option','',name);
                option.value = name;
                select.appendChild(option);
            });
            select.value = selectedName;
            select.onchange = function() { onChange(select.value); };
            header.appendChild(select);
        } else if (selectedName && roleChoices) {
            header.appendChild(element('span','',selectedName));
        }
        article.appendChild(header);
        var text = element('div','wuu-rp-text',value || '暂无状态');
        if (!value) text.classList.add('wuu-rp-empty');
        article.appendChild(text);
        return article;
    }

    function refresh() {
        var dock = ensureDock();
        if (!dock) return;
        var rt = window.OpenTavernStatusCenterRuntime;
        var p = rt && typeof rt.getPanels === 'function' ? rt.getPanels() : null;
        var id = p && p.conversationId ? String(p.conversationId) : '';
        currentConversationId = id;
        var cards = document.getElementById('wuuRpCards');
        var chat = document.getElementById('chatView');
        // Show when the conversation has at least one known scoped status.
        var hasStatus = !!(p && p.user && (
            p.user.content || (p.characters || []).some(function(x){ return x.content; })));
        dock.hidden = !id || !hasStatus || !!(chat && chat.classList.contains('hidden'));
        if (dock.hidden || !cards) return;
        var opened = isExpanded(id);
        cards.hidden = !opened;
        document.getElementById('wuuRpToggle').textContent = opened ? '收起' : '展开';
        if (!opened) return;

        var roles = p.characters || [];
        var names = roles.map(function(r){ return r.name; });
        var selected = selectedByConversation[id];
        if (!selected || names.indexOf(selected) < 0) {
            selected = roles.find(function(r){ return r.content; });
            selected = selected ? selected.name : (names[0] || '');
            selectedByConversation[id] = selected;
        }
        var actor = roles.find(function(r){ return r.name === selected; }) || { content:'', name: selected };
        cards.replaceChildren(
            renderStatusCard('角色状态',actor.content,names,selected,function(name){
                selectedByConversation[id] = name;
                refresh();
            }),
            renderStatusCard('玩家状态',p.user.content,null,p.user.name)
        );
    }

    function ensureLightbox() {
        var box = document.getElementById('wuuImageLightbox');
        if (box) return box;
        box = element('div');
        box.id = 'wuuImageLightbox';
        box.hidden = true;
        box.setAttribute('role','dialog');
        box.setAttribute('aria-modal','true');
        box.setAttribute('aria-label','聊天图片预览');
        var close = element('button','','关闭 ×');
        close.type = 'button';
        close.onclick = function() { box.hidden = true; document.body.style.overflow = ''; };
        var image = document.createElement('img');
        image.referrerPolicy = 'no-referrer';
        image.alt = '聊天图片';
        box.appendChild(close);
        box.appendChild(image);
        box.addEventListener('click',function(e) {
            if (e.target === box) close.click();
        });
        document.body.appendChild(box);
        return box;
    }

    function isSafeImageSource(src) {
        // No SVG/data-html/javascript; only explicit common image types + https.
        return /^https:\/\//i.test(src) ||
            /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+\/=]+$/i.test(src);
    }

    var gallery = null;
    function ensureGallery() {
        if (gallery) return gallery;
        gallery = element('div'); gallery.id='wuuImageGallery'; gallery.hidden=true;
        gallery.setAttribute('role','dialog'); gallery.setAttribute('aria-modal','true');
        gallery.setAttribute('aria-label','本对话图片库');
        var body=element('div');body.id='wuuImageGalleryBody';
        var head=element('div');
        head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:9px';
        head.appendChild(element('strong','','本对话已有图片'));
        var close=element('button','','关闭 ×');close.type='button';
        close.style.cssText='cursor:pointer;color:inherit;border:1px solid rgba(127,127,127,.3);border-radius:8px;background:transparent;padding:6px 12px';
        close.onclick=function(){gallery.hidden=true;};head.appendChild(close);
        body.appendChild(head);
        var tip=element('p','','点击图片即可复用到选中的消息，不会重新上传，也不会自动发送给模型。');
        tip.style.cssText='font-size:12px;opacity:.7;line-height:1.6;margin-top:7px';
        body.appendChild(tip);
        var grid=element('div');grid.id='wuuImageGrid';body.appendChild(grid);
        gallery.appendChild(body);
        gallery.addEventListener('click',function(e){if(e.target===gallery)gallery.hidden=true;});
        document.body.appendChild(gallery);
        return gallery;
    }
    window.addEventListener('wuu-chat-image-gallery',function(e){
        var runtime=window.WuuChatImageRuntime,detail=e&&e.detail||{};
        if(!runtime||!runtime.list||!runtime.attach||runtime.conversationId()!==detail.conversationId)return;
        var modal=ensureGallery(),grid=document.getElementById('wuuImageGrid');
        grid.replaceChildren();
        var images=runtime.list();
        if(!images.length) {
            var empty=element('p','','这场对话还没有可以复用的图片。');
            empty.style.cssText='font-size:13px;opacity:.7;padding:16px';grid.appendChild(empty);
        }
        images.forEach(function(item) {
            if(!isSafeImageSource(item.src))return;
            var button=element('button');button.type='button';
            var image=document.createElement('img');
            image.src=item.src;image.loading='lazy';image.referrerPolicy='no-referrer';
            image.alt=item.name||'已有图片';
            button.appendChild(image);
            var label=element('div','',item.name||'图片');
            label.style.cssText='font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px';
            button.appendChild(label);
            button.onclick=async function() {
                button.disabled=true;
                try {
                    var out=await runtime.attach(detail.conversationId,detail.targetIndex,item.messageId,item.index);
                    if(out&&out.ok)modal.hidden=true;
                    else window.alert(out&&out.error||'图片引用失败。');
                } finally {button.disabled=false;}
            };
            grid.appendChild(button);
        });
        modal.hidden=false;
    });

    document.addEventListener('click',function(e) {
        var img = e.target && e.target.closest &&
            e.target.closest('.msg-bubble img, .msg-attachments img');
        if (!img) return;
        var src = img.currentSrc || img.getAttribute('src') || '';
        if (!isSafeImageSource(src)) return;
        var box = ensureLightbox();
        box.querySelector('img').src = src;
        box.hidden = false;
        e.preventDefault();
    });
    document.addEventListener('keydown',function(e) {
        if (e.key !== 'Escape') return;
        var box = document.getElementById('wuuImageLightbox');
        if (box && !box.hidden) box.hidden = true;
        if (gallery && !gallery.hidden) gallery.hidden = true;
    });
    window.addEventListener('ot-status-center-updated',refresh);
    window.addEventListener('ot-chat-context-changed',refresh);
    window.addEventListener('load',refresh);
    document.addEventListener('visibilitychange',function(){ if (!document.hidden) refresh(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',refresh);
    else refresh();
})();
