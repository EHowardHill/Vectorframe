(function () {
    "use strict";

    var S = VF.S;

    $('#left-tools .tb[data-tool]').on('click', function () { VF.setTool($(this).data('tool')); });
    $('#btn-resetview').on('click', VF.resetView);

    $('#tgl-pressure').on('click', function () {
        S.cfg.pressure = !S.cfg.pressure;
        $(this).toggleClass('on', S.cfg.pressure);
    });

    $('#tgl-stroke').on('click', function () {
        S.cfg.autoStroke = !S.cfg.autoStroke;
        $(this).toggleClass('on', S.cfg.autoStroke);
    });
    $('#tgl-fill').on('click', function () {
        S.cfg.autoFill = !S.cfg.autoFill;
        $(this).toggleClass('on', S.cfg.autoFill);
        if (S.cfg.autoFill) { S.cfg.autoStroke = true; $('#tgl-stroke').addClass('on'); }
    });
    $('#tgl-onion').on('click', function () {
        S.cfg.onion = !S.cfg.onion;
        $(this).toggleClass('on', S.cfg.onion);
        VF.render();
    });

    // Brush Size & Smooth Bindings
    $('#rng-smooth').on('input', function () { S.cfg.smooth = +$(this).val(); $('#v-smooth').val(this.value); });
    $('#v-smooth').on('change input', function () {
        var val = Math.max(1, Math.min(5, +$(this).val() || 1));
        S.cfg.smooth = val; $('#rng-smooth').val(val);
    });

    $('#rng-brush').on('input', function () { S.cfg.brushSize = +$(this).val(); $('#v-brush').val(this.value); });
    $('#v-brush').on('change input', function () {
        var val = Math.max(1, Math.min(60, +$(this).val() || 1));
        S.cfg.brushSize = val; $('#rng-brush').val(val);
    });

    // Layer Opacity Bindings
    $('#rng-opacity').on('input', function () {
        var l = VF.AL(); if (!l) return;
        l.opacity = +this.value / 100;
        var pl = VF.pLayers[l.id]; if (pl) pl.opacity = l.opacity;
        $('#v-opacity').val(this.value);
    });
    $('#v-opacity').on('change input', function () {
        var l = VF.AL(); if (!l) return;
        var val = Math.max(0, Math.min(100, +$(this).val() || 0));
        l.opacity = val / 100;
        var pl = VF.pLayers[l.id]; if (pl) pl.opacity = l.opacity;
        $('#rng-opacity').val(val);
    });

    $('#clr-stroke').on('input', function () { S.cfg.strokeCol = this.value; $('#sw-stroke').css('background', this.value); });
    $('#clr-fill').on('input', function () { S.cfg.fillCol = this.value; $('#sw-fill').css('background', this.value); });
    $('#sel-tex').on('change', function () { S.cfg.tex = this.value; });

    function pickScreenColor(targetInputId) {
        if (!window.EyeDropper) {
            VF.toast("EyeDropper API is not supported in this browser.");
            return;
        }
        const eyeDropper = new EyeDropper();
        eyeDropper.open().then(result => {
            $(targetInputId).val(result.sRGBHex).trigger('input');
        }).catch(e => {
            console.log("Eyedropper canceled:", e);
        });
    }

    $('#btn-pick-stroke').on('click', function () { pickScreenColor('#clr-stroke'); });
    $('#btn-pick-fill').on('click', function () { pickScreenColor('#clr-fill'); });

    // Z-Order: Bring to Front / Push to Back
    $('#btn-zfront').on('click', function () {
        var items = VF.getSelectedItems();
        if (items.length === 0) { VF.toast('Select items first'); return; }
        VF.saveHistory();
        items.forEach(function (item) { item.bringToFront(); });
        VF.saveFrame();
        VF.toast('Brought to front');
    });
    $('#btn-zback').on('click', function () {
        var items = VF.getSelectedItems();
        if (items.length === 0) { VF.toast('Select items first'); return; }
        VF.saveHistory();
        items.reverse().forEach(function (item) { item.sendToBack(); });
        VF.saveFrame();
        VF.toast('Pushed to back');
    });

    $('#btn-play').on('click', function () { VF.togglePlay(); });
    $('#btn-next').on('click', function () { VF.goFrame(S.tl.frame + 1); });
    $('#btn-prev').on('click', function () { VF.goFrame(S.tl.frame - 1); });

    $('#in-endframe').on('change', function () {
        S.tl.max = Math.max(1, +this.value || 24);
        if (S.tl.frame >= S.tl.max) { S.tl.frame = S.tl.max - 1; VF.render(); }
        VF.uiTimeline();
    });
    $('#in-fps').on('change', function () {
        S.tl.fps = Math.max(1, +this.value || 12);
        if (S.tl.playing) { VF.togglePlay(); VF.togglePlay(); }
    });

    $('#btn-newlyr').on('click', function () { VF.addLayer(); VF.render(); });
    $('#btn-duplyr').on('click', function () { VF.dupLayer(S.activeId); });
    $('#btn-dellyr').on('click', function () { VF.delLayer(S.activeId); });
    $('#btn-imglyr').on('click', VF.importImg);
    $('#btn-export-png').on('click', VF.exportPNG);

    // ◆ Duplicate Keyframe
    $('#btn-add-dup').on('click', function () {
        VF.saveHistory();
        var l = VF.AL(); if (!l) return;

        var res = VF.getResolvedFrame(l, S.tl.frame);
        if (res && res.keyFrame !== S.tl.frame) {
            l.frames[S.tl.frame] = JSON.parse(JSON.stringify(res.data));
        } else if (!res) {
            l.frames[S.tl.frame] = [];
        }
        VF.render(); VF.uiTimeline();
    });

    // ◇ Blank Keyframe
    $('#btn-add-blank').on('click', function () {
        VF.saveHistory();
        var l = VF.AL(); if (!l) return;
        l.frames[S.tl.frame] = [];
        if (VF.pLayers[l.id]) VF.pLayers[l.id].removeChildren();
        VF.render(); VF.uiTimeline();
    });

    // × Delete Keyframe
    $('#btn-del-node').on('click', function () {
        VF.saveHistory();
        var l = VF.AL(); if (!l) return;
        if (l.frames[S.tl.frame] !== undefined) {
            delete l.frames[S.tl.frame];
            if (VF.pLayers[l.id]) VF.pLayers[l.id].removeChildren();
            VF.render(); VF.uiTimeline();
        }
    });

    $('#chk-onion-isolate').on('change', function () {
        S.cfg.onionIsolate = $(this).is(':checked');
        VF.render();
    });

    /* ═══════════════════════════════════════════════════
       INLINE ONION SKIN CONTROLS  (ribbon-based)
       ═══════════════════════════════════════════════════ */

    function renderOnionUI() {
        var h = '';
        S.onions.forEach(function (sk, i) {
            h += '<div class="onion-rule-row" data-idx="' + i + '">' +
                '<select class="on-rel onion-sel">' +
                '<option value="true"' + (sk.rel ? ' selected' : '') + '>Relative</option>' +
                '<option value="false"' + (!sk.rel ? ' selected' : '') + '>Absolute</option>' +
                '</select>' +
                '<input type="number" class="on-val sm-in" value="' + sk.val + '">' +
                '<input type="range" class="on-op" min="1" max="100" value="' + sk.op + '">' +
                '<span class="on-op-label">' + sk.op + '%</span>' +
                '<select class="on-top onion-sel">' +
                '<option value="false"' + (!sk.top ? ' selected' : '') + '>Below</option>' +
                '<option value="true"' + (sk.top ? ' selected' : '') + '>Above</option>' +
                '</select>' +
                '<button class="tb on-del" style="width:18px;height:18px;font-size:12px;color:var(--warning);flex-shrink:0">×</button>' +
                '</div>';
        });

        if (S.onions.length === 0) {
            h = '<div style="font-size:10px;color:var(--text-dim);padding:8px 4px">No onion rules. Click "+ Add Rule" to add.</div>';
        }

        $('#onion-ribbon-list').html(h);

        /* Bind events using closest() for reliable index lookup */
        $('.on-rel').on('change', function () {
            S.onions[$(this).closest('.onion-rule-row').data('idx')].rel = $(this).val() === 'true';
            VF.render();
        });
        $('.on-val').on('input', function () {
            S.onions[$(this).closest('.onion-rule-row').data('idx')].val = +$(this).val();
            VF.render();
        });
        $('.on-op').on('input', function () {
            var val = +$(this).val();
            var idx = $(this).closest('.onion-rule-row').data('idx');
            S.onions[idx].op = val;
            $(this).siblings('.on-op-label').text(val + '%');
            VF.render();
        });
        $('.on-top').on('change', function () {
            S.onions[$(this).closest('.onion-rule-row').data('idx')].top = $(this).val() === 'true';
            VF.render();
        });
        $('.on-del').on('click', function () {
            S.onions.splice($(this).closest('.onion-rule-row').data('idx'), 1);
            renderOnionUI();
            VF.render();
        });
    }

    /* Expose for use by init / project-load */
    VF.renderOnionUI = renderOnionUI;

    $('#btn-add-onion').on('click', function () {
        S.onions.push({ rel: true, val: -1, op: 20, top: false });
        renderOnionUI();
        VF.render();
    });

    /* Initial render of onion rules into the ribbon */
    renderOnionUI();

    // Ribbon Tab Switching
    $('.ribbon-tab').on('click', function () {
        $('.ribbon-tab').removeClass('active');
        $(this).addClass('active');
        $('.ribbon-panel').removeClass('active');
        $('#' + $(this).data('tab')).addClass('active');
        VF.fitCanvas();
    });

})();