(function () {
    "use strict";

    var S = VF.S;
    var P;
    function getP() { if (!P) P = VF.P; return P; }

    var currentLayerId = null;

    /* ═══════════════════════════════════════════════════
       DEFAULT LAYER SETTINGS
       ═══════════════════════════════════════════════════ */

    VF.defaultLayerSettings = function () {
        return {
            blendMode: 'normal',
            locked: false,
            reference: false,
            colorTag: 'none',
            wobble: {
                enabled: false,
                offset: 3,
                scale: 1.0,
                stroke: true,
                fill: true,
                perFrame: true
            }
        };
    };

    /** Ensure a layer has all settings fields (safe for old projects). */
    VF.ensureLayerSettings = function (l) {
        var def = VF.defaultLayerSettings();
        if (l.blendMode === undefined) l.blendMode = def.blendMode;
        if (l.locked === undefined) l.locked = def.locked;
        if (l.reference === undefined) l.reference = def.reference;
        if (l.colorTag === undefined) l.colorTag = def.colorTag;
        if (!l.wobble) l.wobble = JSON.parse(JSON.stringify(def.wobble));
        else {
            for (var k in def.wobble) {
                if (l.wobble[k] === undefined) l.wobble[k] = def.wobble[k];
            }
        }
    };

    /* ═══════════════════════════════════════════════════
       LOCK HELPER
       ═══════════════════════════════════════════════════ */

    VF.isLocked = function () {
        var l = VF.AL();
        return l && l.locked;
    };

    /* ═══════════════════════════════════════════════════
       OPEN MODAL
       ═══════════════════════════════════════════════════ */

    VF.openLayerSettings = function (layerId) {
        var l = S.layers.find(function (x) { return x.id === layerId; });
        if (!l) return;

        VF.ensureLayerSettings(l);
        currentLayerId = layerId;

        /* Populate fields */
        $('#ls-name').val(l.name);
        $('#ls-layer-name-display').text(l.name);
        $('#ls-blend').val(l.blendMode);
        $('#ls-locked').prop('checked', l.locked);
        $('#ls-reference').prop('checked', l.reference);

        /* Color tags */
        $('.ls-tag').removeClass('active');
        $('.ls-tag[data-color="' + (l.colorTag || 'none') + '"]').addClass('active');

        /* Wobble */
        var w = l.wobble;
        $('#ls-wobble-on').prop('checked', w.enabled);
        $('#ls-wobble-offset').val(w.offset);
        $('#ls-wobble-scale').val(w.scale);
        $('#ls-wobble-scale-val').text(w.scale.toFixed(1) + '×');
        $('#ls-wobble-stroke').prop('checked', w.stroke);
        $('#ls-wobble-fill').prop('checked', w.fill);
        $('input[name="ls-wobble-seed"][value="' +
            (w.perFrame ? 'perFrame' : 'fixed') + '"]').prop('checked', true);

        toggleWobbleDetails(w.enabled);
        $('#modal-layer-settings').show();
        $('#ls-name').focus().select();
    };

    function toggleWobbleDetails(on) {
        var $d = $('#ls-wobble-details');
        $d.css('opacity', on ? 1 : 0.35);
        $d.find('input, select').prop('disabled', !on);
    }

    /* ═══════════════════════════════════════════════════
       APPLY SETTINGS
       ═══════════════════════════════════════════════════ */

    function applySettings() {
        var l = S.layers.find(function (x) { return x.id === currentLayerId; });
        if (!l) return;

        VF.saveHistory();

        l.name = $('#ls-name').val().trim() || l.name;
        l.blendMode = $('#ls-blend').val();
        l.locked = $('#ls-locked').is(':checked');
        l.reference = $('#ls-reference').is(':checked');

        var activeTag = $('.ls-tag.active');
        l.colorTag = activeTag.length ? activeTag.data('color') : 'none';

        l.wobble = {
            enabled: $('#ls-wobble-on').is(':checked'),
            offset: Math.max(0, parseFloat($('#ls-wobble-offset').val()) || 3),
            scale: Math.max(0.1, parseFloat($('#ls-wobble-scale').val()) || 1),
            stroke: $('#ls-wobble-stroke').is(':checked'),
            fill: $('#ls-wobble-fill').is(':checked'),
            perFrame: $('input[name="ls-wobble-seed"]:checked').val() === 'perFrame'
        };

        /* Invalidate raster cache when wobble or blend changes */
        if (l.cache) l.cache = {};

        $('#modal-layer-settings').hide();
        VF.uiLayers();
        VF.uiTimeline();
        VF.render();
    }

    /* ═══════════════════════════════════════════════════
       MODAL EVENT BINDINGS
       ═══════════════════════════════════════════════════ */

    $(document).ready(function () {
        $('#ls-apply').on('click', applySettings);
        $('#ls-cancel').on('click', function () { $('#modal-layer-settings').hide(); });

        /* Close on overlay click */
        $('#modal-layer-settings').on('click', function (e) {
            if (e.target === this) $(this).hide();
        });

        /* Keyboard in modal */
        $('#modal-layer-settings').on('keydown', 'input, select', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); applySettings(); }
            if (e.key === 'Escape') { e.preventDefault(); $('#modal-layer-settings').hide(); }
            e.stopPropagation();
        });

        /* Wobble enable toggle */
        $('#ls-wobble-on').on('change', function () {
            toggleWobbleDetails($(this).is(':checked'));
        });

        /* Scale slider live label */
        $('#ls-wobble-scale').on('input', function () {
            $('#ls-wobble-scale-val').text(parseFloat(this.value).toFixed(1) + '×');
        });

        /* Color tag radio-button behavior */
        $(document).on('click', '.ls-tag', function () {
            $('.ls-tag').removeClass('active');
            $(this).addClass('active');
        });

        /* Settings gear in layer panel header */
        $('#btn-lyrsettings').on('click', function () {
            VF.openLayerSettings(S.activeId);
        });
    });

    /* ═══════════════════════════════════════════════════
       WOBBLE RENDERING ENGINE
       Called from VF.render() after all frames are loaded.
       Creates temporary Paper.js layers with jittered paths
       that overlay the originals without modifying saved data.
       ═══════════════════════════════════════════════════ */

    VF._wobbleTempLayers = [];

    VF.applyWobbleEffects = function (sorted, frame) {
        var P = getP();

        /* Clean up previous wobble layers */
        VF._wobbleTempLayers.forEach(function (tl) {
            tl.removeChildren();
            tl.remove();
        });
        VF._wobbleTempLayers = [];

        sorted.forEach(function (l) {
            VF.ensureLayerSettings(l);
            if (!l.wobble.enabled || !l.vis) return;
            if (l.type !== 'vector') return;

            /* During editing (not playing / not exporting) skip the
               active layer — the user needs clean paths to work with.
               They'll see a badge in the layers panel instead. */
            if (l.id === S.activeId && !S.tl.playing && !VF._exporting) return;

            var pl = VF.pLayers[l.id];
            if (!pl) return;

            /* Get the frame vector data */
            var res = VF.getResolvedFrame(l, frame);
            if (!res || !res.data || !Array.isArray(res.data) || res.data.length === 0) return;

            /* ── Temporarily reset camera for clean deserialization ── */
            var oldZoom = VF.view.zoom;
            var oldCenter = VF.view.center.clone();
            VF.view.zoom = 1;
            VF.view.center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
            VF.view.update();

            var wobblePL = new P.Layer();
            wobblePL.name = '_Wobble_' + l.id;
            VF._wobbleTempLayers.push(wobblePL);

            wobblePL.activate();
            VF.desPL(wobblePL, res.data);

            /* ── Restore camera ── */
            VF.view.zoom = oldZoom;
            VF.view.center = oldCenter;
            VF.view.update();

            /* ── Generate seed ── */
            var seed;
            if (l.wobble.perFrame) {
                seed = frame * 7919 + l.id * 104729;
            } else {
                seed = l.id * 104729 + 42;
            }
            var rand = VF.seededRandom(seed);
            var effectiveOffset = (l.wobble.offset || 3) * (l.wobble.scale || 1);

            /* ── Jitter every segment in the temp layer ── */
            function jitterItem(item) {
                if (item.className === 'Raster') return;

                if (item.segments) {
                    var hasStroke = item.strokeColor != null;
                    var hasFill = item.fillColor != null;
                    var shouldJitter =
                        (hasStroke && l.wobble.stroke) ||
                        (hasFill && l.wobble.fill);

                    if (!shouldJitter) {
                        /* Advance PRNG even if we skip, to keep jitter
                           stable for paths that follow */
                        item.segments.forEach(function () { rand(); rand(); });
                        return;
                    }

                    item.segments.forEach(function (seg) {
                        var dx = (rand() - 0.5) * 2 * effectiveOffset;
                        var dy = (rand() - 0.5) * 2 * effectiveOffset;
                        seg.point = seg.point.add(new P.Point(dx, dy));
                    });
                }

                if (item.children) {
                    item.children.slice().forEach(function (child) {
                        jitterItem(child);
                    });
                }
            }

            wobblePL.children.forEach(function (c) { jitterItem(c); });

            /* ── Position in stack ── */
            wobblePL.insertAbove(pl);
            wobblePL.opacity = l.opacity;
            if (l.blendMode && l.blendMode !== 'normal') {
                wobblePL.blendMode = l.blendMode;
            }

            /* Hide the original so only the wobbled version shows */
            pl.visible = false;
        });

        /* Restore active layer */
        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();
    };

    /* ═══════════════════════════════════════════════════
       BLEND MODE APPLICATION
       Called from VF.render() during the layer loop.
       ═══════════════════════════════════════════════════ */

    VF.applyBlendMode = function (l, pl) {
        VF.ensureLayerSettings(l);
        pl.blendMode = l.blendMode || 'normal';
    };

})();
