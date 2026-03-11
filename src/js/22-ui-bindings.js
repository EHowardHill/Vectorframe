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
        if (VF.hasSelection && VF.hasSelection()) {
            VF.applyPropertyToSelection('enableStroke', S.cfg.autoStroke);
        }
    });
    $('#tgl-fill').on('click', function () {
        S.cfg.autoFill = !S.cfg.autoFill;
        $(this).toggleClass('on', S.cfg.autoFill);
        if (S.cfg.autoFill) { S.cfg.autoStroke = true; $('#tgl-stroke').addClass('on'); }
        if (VF.hasSelection && VF.hasSelection()) {
            VF.applyPropertyToSelection('enableFill', S.cfg.autoFill);
        }
    });
    $('#tgl-onion').on('click', function () {
        S.cfg.onion = !S.cfg.onion;
        $(this).toggleClass('on', S.cfg.onion);
        VF.render();
    });

    // Grain Bindings
    $('#tgl-grain').on('click', function () {
        S.cfg.grain = !S.cfg.grain;
        $(this).toggleClass('on', S.cfg.grain);
        VF.render();
    });
    $('#rng-grain').on('input', function () {
        S.cfg.grainAmt = +$(this).val();
        $('#v-grain').val(this.value);
        VF.render();
    });
    $('#v-grain').on('change input', function () {
        var val = Math.max(1, Math.min(100, +$(this).val() || 1));
        S.cfg.grainAmt = val;
        $('#rng-grain').val(val);
        VF.render();
    });

    // ── Brush Size (Selection-aware) ──
    $('#rng-brush').on('input', function () {
        S.cfg.brushSize = +$(this).val();
        $('#v-brush').val(this.value);
        if (VF.hasSelection && VF.hasSelection()) {
            VF.applyPropertyToSelection('brushSize', S.cfg.brushSize);
        }
    });
    $('#v-brush').on('change input', function () {
        var val = Math.max(1, Math.min(60, +$(this).val() || 1));
        S.cfg.brushSize = val; $('#rng-brush').val(val);
        if (VF.hasSelection && VF.hasSelection()) {
            VF.applyPropertyToSelection('brushSize', val);
        }
    });

    // Smooth Bindings (new-stroke only — no selection apply)
    $('#rng-smooth').on('input', function () { S.cfg.smooth = +$(this).val(); $('#v-smooth').val(this.value); });
    $('#v-smooth').on('change input', function () {
        var val = Math.max(1, Math.min(5, +$(this).val() || 1));
        S.cfg.smooth = val; $('#rng-smooth').val(val);
    });

    // Layer Opacity Bindings
    // FIX: Call VF.render() so opacity changes are immediately visible
    //       (the old code only set pl.opacity but didn't trigger a redraw
    //        for vector layers that might be using wobble, blend modes, etc.)
    $('#rng-opacity').on('input', function () {
        var l = VF.AL(); if (!l) return;
        l.opacity = +this.value / 100;
        var pl = VF.pLayers[l.id];
        if (pl) {
            if (l.type === 'image') {
                pl.opacity = 1;
                pl.children.forEach(function (c) { c.opacity = l.opacity; });
            } else {
                pl.opacity = l.opacity;
            }
        }
        $('#v-opacity').val(this.value);
        VF.view.update();
    });

    $('#v-opacity').on('change input', function () {
        var l = VF.AL(); if (!l) return;
        var val = Math.max(0, Math.min(100, +$(this).val() || 0));
        l.opacity = val / 100;
        var pl = VF.pLayers[l.id];
        if (pl) {
            if (l.type === 'image') {
                pl.opacity = 1;
                pl.children.forEach(function (c) { c.opacity = l.opacity; });
            } else {
                pl.opacity = l.opacity;
            }
        }
        $('#rng-opacity').val(val);
        VF.view.update();
    });

    // ── Stroke Color (Selection-aware) ──
    $('#clr-stroke').on('input', function () {
        S.cfg.strokeCol = this.value;
        $('#sw-stroke').css('background', this.value);
        if (VF.hasSelection && VF.hasSelection()) {
            VF.applyPropertyToSelection('strokeColor', this.value);
        }
    });

    // ── Fill Color (Selection-aware) ──
    $('#clr-fill').on('input', function () {
        S.cfg.fillCol = this.value;
        $('#sw-fill').css('background', this.value);
        if (VF.hasSelection && VF.hasSelection()) {
            VF.applyPropertyToSelection('fillColor', this.value);
        }
    });

    // ── Texture (Selection-aware) ──
    $('#sel-tex').on('change', function () {
        S.cfg.tex = this.value;
        if (VF.hasSelection && VF.hasSelection()) {
            VF.applyPropertyToSelection('texture', this.value);
        }
    });

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
        if (VF.isLocked && VF.isLocked()) { VF.toast('Layer is locked'); return; }
        VF.saveHistory();
        items.forEach(function (item) { item.bringToFront(); });
        VF.saveFrame();
        VF.toast('Brought to front');
    });
    $('#btn-zback').on('click', function () {
        var items = VF.getSelectedItems();
        if (items.length === 0) { VF.toast('Select items first'); return; }
        if (VF.isLocked && VF.isLocked()) { VF.toast('Layer is locked'); return; }
        VF.saveHistory();
        items.reverse().forEach(function (item) { item.sendToBack(); });
        VF.saveFrame();
        VF.toast('Pushed to back');
    });

    $('#btn-play').on('click', function () { VF.togglePlay(); });
    $('#btn-next').on('click', function () { VF.goFrame(S.tl.frame + 1); });
    $('#btn-prev').on('click', function () { VF.goFrame(S.tl.frame - 1); });

    $('#btn-newlyr').on('click', function () { VF.addLayer(); VF.render(); });
    $('#btn-duplyr').on('click', function () { VF.dupLayer(S.activeId); });
    $('#btn-dellyr').on('click', function () { VF.delLayer(S.activeId); });
    $('#btn-imglyr').on('click', VF.importImg);
    $('#btn-export-png').on('click', VF.exportPNG);

    // ◆ Duplicate Keyframe
    $('#btn-add-dup').on('click', function () {
        var l = VF.AL(); if (!l) return;

        /* FIX: Check if layer is locked before creating keyframes */
        if (l.locked) { VF.toast('Layer is locked'); return; }

        VF.saveHistory();

        // 1. Save current frame and get the artwork we want to duplicate
        VF.saveFrame();
        var res = VF.getResolvedFrame(l, S.tl.frame);
        var dataToCopy = res && res.data ? JSON.parse(JSON.stringify(res.data)) : [];

        VF.selSegments = [];
        VF.clearHandles();

        // 2. Advance the frame (extend the project timeline if we are at the very end)
        if (S.tl.frame >= S.tl.max - 1) {
            S.tl.max++;
            $('#pref-end').val(S.tl.max);
            $('#in-endframe').val(S.tl.max);
        }
        S.tl.frame++;

        // 3. Assign the duplicated data to the new frame
        l.frames[S.tl.frame] = dataToCopy;
        if (l.cache) delete l.cache[S.tl.frame];

        // 4. Rerender the canvas and timeline
        VF.render();
        VF.uiTimeline();
    });

    // ◇ Blank Keyframe
    $('#btn-add-blank').on('click', function () {
        var l = VF.AL(); if (!l) return;

        /* FIX: Check if layer is locked before creating keyframes */
        if (l.locked) { VF.toast('Layer is locked'); return; }

        VF.saveHistory();

        // 1. Save the current frame's drawing data before moving the playhead
        VF.saveFrame();
        VF.selSegments = [];
        VF.clearHandles();

        // 2. Advance the frame (extend the project timeline if we are at the very end)
        if (S.tl.frame >= S.tl.max - 1) {
            S.tl.max++;
            $('#pref-end').val(S.tl.max);
            $('#in-endframe').val(S.tl.max);
        }
        S.tl.frame++;

        // 3. Create the empty keyframe at the new position
        l.frames[S.tl.frame] = [];
        if (l.cache) delete l.cache[S.tl.frame];
        if (VF.pLayers[l.id]) VF.pLayers[l.id].removeChildren();

        // 4. Rerender the canvas and timeline
        VF.render();
        VF.uiTimeline();
    });

    // × Delete Keyframe
    $('#btn-del-node').on('click', function () {
        var l = VF.AL(); if (!l) return;

        /* FIX: Check if layer is locked before deleting keyframes */
        if (l.locked) { VF.toast('Layer is locked'); return; }

        VF.saveHistory();
        if (l.frames[S.tl.frame] !== undefined) {
            delete l.frames[S.tl.frame];
            if (l.cache) delete l.cache[S.tl.frame];
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

    VF.renderOnionUI = renderOnionUI;

    $('#btn-add-onion').on('click', function () {
        S.onions.push({ rel: true, val: -1, op: 20, top: false });
        renderOnionUI();
        VF.render();
    });

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
