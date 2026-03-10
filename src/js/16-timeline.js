(function () {
    "use strict";

    var S = VF.S;

    VF.uiFrameDisp = function () {
        $('#frame-disp').text((S.tl.frame + 1) + ' / ' + S.tl.max);
    };

    VF.goFrame = function (f) {
        VF.saveFrame(true);
        VF.selSegments = [];
        VF.clearHandles();
        S.tl.frame = Math.max(0, Math.min(f, S.tl.max - 1));
        VF.render(); VF.uiTimeline();
    };

    var playInt = null;
    VF.togglePlay = function () {
        if (S.tl.playing) {
            clearInterval(playInt); S.tl.playing = false;
            $('#btn-play').text('▶');
        } else {
            S.tl.playing = true; $('#btn-play').text('⏸');
            playInt = setInterval(function () {
                var n = S.tl.frame + 1;
                if (n >= S.tl.max) n = 0;
                VF.goFrame(n);

                var nextN = n + 1 >= S.tl.max ? 0 : n + 1;
                requestIdleCallback(function () {
                    S.layers.forEach(function (layer) {
                        if (layer.id !== S.activeId && layer.type === 'vector' && layer.vis) {
                            var res = VF.getResolvedFrame(layer, nextN);
                            if (res && (!layer.cache || !layer.cache[res.keyFrame])) {
                                VF.loadFrame(layer.id, nextN);
                            }
                        }
                    });
                });
            }, 1000 / S.tl.fps);
        }
    };

    VF.uiPlayhead = function () {
        $('#tl-playhead').css('left', (S.tl.frame * 18 + 9) + 'px');
    };

    VF.uiTimeline = function () {
        var max = S.tl.max, cur = S.tl.frame;

        // Ruler
        var rh = '';
        for (var i = 0; i < max; i++) {
            var lb = (i % 5 === 0) ? (i + 1) : ((i + 1) % 2 === 0 ? '·' : '');
            rh += '<div class="tl-rc" data-f="' + i + '">' + lb + '</div>';
        }
        $('#tl-ruler').html(rh);

        // Layer labels
        var lh = '';
        [].concat(S.layers).sort(function (a, b) { return b.z - a.z; }).forEach(function (l) {
            var icon = l.type === 'image' ? '🖼 ' : '';
            lh += '<div class="tl-llbl">' + icon + l.name + '</div>';
        });
        $('#tl-labels').html(lh);

        // Rows
        var rows = '';
        [].concat(S.layers).sort(function (a, b) { return b.z - a.z; }).forEach(function (l) {
            var cells = '';
            var activeKey = null;

            for (var i = 0; i < max; i++) {
                var cc = i === cur ? ' cur' : '';
                var isKey = l.frames[i] !== undefined;

                if (isKey) activeKey = i;

                var content = '';
                if (isKey) {
                    content = '<div class="tl-dot keyframe" draggable="true" data-f="' + i + '" data-l="' + l.id + '"></div>';
                } else if (activeKey !== null) {
                    content = '<div class="tl-exposure"></div>';
                }

                cells += '<div class="tl-cell' + cc + '" data-f="' + i + '" data-l="' + l.id + '" style="position:relative">' + content + '</div>';
            }
            rows += '<div class="tl-row" data-l="' + l.id + '">' + cells + '</div>';
        });
        $('#tl-rows').html(rows);
        $('#tl-grid').css('min-width', (max * 18) + 'px');
        VF.uiPlayhead();

        // Bind events
        $('.tl-cell').on('click', function () { VF.goFrame(+$(this).data('f')); });
        $('.tl-rc').on('click', function () { VF.goFrame(+$(this).data('f')); });

        $('.tl-cell').on('contextmenu', function (e) {
            e.preventDefault(); e.stopPropagation();
            S.tl.frame = +$(this).data('f');
            VF.render(); VF.uiPlayhead();
            showCtx(e.clientX, e.clientY, +$(this).data('l'), +$(this).data('f'));
        });

        bindDotDrag();
    };

    function bindDotDrag() {
        var dd = null;
        $(document).off('.dotdrag');

        $('.tl-dot.keyframe').on('dragstart.dotdrag', function (e) {
            dd = { f: +$(this).data('f'), l: +$(this).data('l') };
            e.originalEvent.dataTransfer.effectAllowed = 'move';
            setTimeout(function () { $(this).css('opacity', '0.4'); }.bind(this), 0);
        });

        $('.tl-dot.keyframe').on('dragend.dotdrag', function () {
            $(this).css('opacity', '1');
        });

        $('.tl-cell').on('dragover.dotdrag', function (e) {
            e.preventDefault();
            $(this).css('background', 'var(--bg-active)');
        });

        $('.tl-cell').on('dragleave.dotdrag', function () {
            $(this).css('background', '');
        });

        $('.tl-cell').on('drop.dotdrag', function (e) {
            e.preventDefault();
            $(this).css('background', '');

            if (!dd) return;
            var tf = +$(this).data('f');
            var tl = +$(this).data('l');

            if (dd.l !== tl || dd.f !== tf) {
                VF.saveHistory();

                var srcLayer = S.layers.find(function (x) { return x.id === dd.l; });
                var tgtLayer = S.layers.find(function (x) { return x.id === tl; });

                if (srcLayer && tgtLayer) {
                    var keyData = srcLayer.frames[dd.f];
                    delete srcLayer.frames[dd.f];
                    if (srcLayer.cache) delete srcLayer.cache[dd.f];

                    tgtLayer.frames[tf] = keyData;
                    if (tgtLayer.cache) delete tgtLayer.cache[tf];

                    S.tl.frame = tf;
                    VF.render();
                    VF.uiTimeline();
                }
            }
            dd = null;
        });
    }

    // Dot context menu
    var ctxL = null, ctxF = null;
    function showCtx(x, y, l, f) {
        ctxL = l; ctxF = f;
        $('#dot-ctx').css({ left: x, top: y, display: 'block' });
    }
    $(document).on('click', function () { $('#dot-ctx').hide(); });

    $('#dot-ctx .ctx-i').on('click', function () {
        var act = $(this).data('act');
        var layer = S.layers.find(function (x) { return x.id === ctxL; });
        if (!layer) return;

        var res = VF.getResolvedFrame(layer, ctxF);
        if (!layer.cache) layer.cache = {};

        if (act === 'copy-frame') {
            S.clip = res && res.data ? JSON.parse(JSON.stringify(res.data)) : null;
            VF.toast(S.clip ? 'Keyframe copied' : 'Blank frame copied');
        } else {
            VF.saveHistory();

            if (act === 'toggle-loop') {
                if (res && res.data) res.data._loop = !res.data._loop;
            }
            else if (act === 'delete-keyframe') {
                if (layer.frames[ctxF] !== undefined) {
                    delete layer.frames[ctxF];
                    delete layer.cache[ctxF];
                    if (VF.pLayers[layer.id]) VF.pLayers[layer.id].removeChildren();
                }
            }
            else if (act === 'clear-exposure') {
                layer.frames[ctxF] = [];
                delete layer.cache[ctxF];
                if (VF.pLayers[layer.id]) VF.pLayers[layer.id].removeChildren();
            }
            else if (act === 'paste-frame') {
                layer.frames[ctxF] = S.clip ? JSON.parse(JSON.stringify(S.clip)) : [];
                delete layer.cache[ctxF];
            }
            else if (act === 'insert-frame') {
                layer.cache = {};
                for (var i = S.tl.max - 1; i > ctxF; i--) {
                    if (layer.frames[i - 1] !== undefined) {
                        layer.frames[i] = layer.frames[i - 1];
                    } else {
                        delete layer.frames[i];
                    }
                }
                delete layer.frames[ctxF];
            }
            else if (act === 'remove-frame') {
                layer.cache = {};
                for (var i2 = ctxF; i2 < S.tl.max - 1; i2++) {
                    if (layer.frames[i2 + 1] !== undefined) {
                        layer.frames[i2] = layer.frames[i2 + 1];
                    } else {
                        delete layer.frames[i2];
                    }
                }
                delete layer.frames[S.tl.max - 1];
            }
        }

        VF.render();
        VF.uiTimeline();
        $('#dot-ctx').hide();
    });

})();
