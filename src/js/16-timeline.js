(function () {
    "use strict";

    var S = VF.S;
    VF._isDraggingTimeline = false;

    VF.uiFrameDisp = function () {
        $('#frame-disp').text((S.tl.frame + 1) + ' / ' + S.tl.max);
    };

    VF.goFrame = function (f) {
        VF.saveFrame(true);
        VF.selSegments = [];
        VF.clearHandles();
        S.tl.frame = Math.max(0, Math.min(f, S.tl.max - 1));
        VF.render(); VF.uiTimeline();

        if (!S.tl.playing && window.VF.playFrameAudio) {
            VF.playFrameAudio(S.tl.frame);
        }
    };

    var playInt = null;
    VF.togglePlay = function () {
        if (S.tl.playing) {
            clearInterval(playInt); S.tl.playing = false;
            $('#btn-play').text('▶');
            if (window.VF.stopAudio) VF.stopAudio();
        } else {
            S.tl.playing = true; $('#btn-play').text('⏸');
            if (window.VF.startAudioPlayback) VF.startAudioPlayback(S.tl.frame);

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
        if (VF._isDraggingTimeline) return;

        var max = S.tl.max, cur = S.tl.frame;
        var audioFrames = (VF.audio && VF.audio.waveformData) ? VF.audio.waveformData.length : 0;
        var displayMax = Math.max(max, audioFrames);

        var rh = '';
        for (var i = 0; i < displayMax; i++) {
            var lb = (i % 5 === 0) ? (i + 1) : ((i + 1) % 2 === 0 ? '·' : '');
            var isOOB = i >= max ? ' opacity: 0.4;' : '';
            rh += '<div class="tl-rc" data-f="' + i + '" style="' + isOOB + '">' + lb + '</div>';
        }
        $('#tl-ruler').html(rh);

        var lh = '<div class="tl-audio-label"><i class="fa-solid fa-music"></i> Audio</div>';
        [].concat(S.layers).sort(function (a, b) { return b.z - a.z; }).forEach(function (l) {
            var icon = l.type === 'image' ? '🖼 ' : '';
            lh += '<div class="tl-llbl">' + icon + l.name + '</div>';
        });
        $('#tl-labels').html(lh);

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
                    content = '<div class="tl-dot keyframe" data-f="' + i + '" data-l="' + l.id + '"></div>';
                } else if (activeKey !== null) {
                    content = '<div class="tl-exposure"></div>';
                }

                cells += '<div class="tl-cell' + cc + '" data-f="' + i + '" data-l="' + l.id + '" style="position:relative">' + content + '</div>';
            }
            rows += '<div class="tl-row" data-l="' + l.id + '">' + cells + '</div>';
        });
        $('#tl-rows').html(rows);

        $('#tl-grid').css('min-width', (displayMax * 18) + 'px');
        VF.uiPlayhead();
    };

    var ctxL = null, ctxF = null;
    function showCtx(x, y, l, f) {
        ctxL = l; ctxF = f;
        $('#dot-ctx').css({ left: x, top: y, display: 'block' });
    }

    // ═══════════════════════════════════════════════════
    //  CUSTOM POINTER-BASED DRAG ENGINE
    // ═══════════════════════════════════════════════════
    $(document).ready(function () {
        var $tlRows = $('#tl-rows');
        var $tlRuler = $('#tl-ruler');
        var $dotCtx = $('#dot-ctx');

        // Blank cell clicks trigger navigation
        $tlRows.on('click', '.tl-cell', function (e) {
            if (e.button !== 0 || $(e.target).hasClass('tl-dot')) return;
            VF.goFrame(+$(this).data('f'));
        });

        $tlRuler.on('click', '.tl-rc', function (e) {
            if (e.button !== 0) return;
            VF.goFrame(+$(this).data('f'));
        });

        // Context Menu
        $tlRows.on('contextmenu', '.tl-cell', function (e) {
            e.preventDefault(); e.stopPropagation();
            S.tl.frame = +$(this).data('f');
            VF.render(); VF.uiPlayhead();
            showCtx(e.clientX, e.clientY, +$(this).data('l'), +$(this).data('f'));
        });

        $(document).on('click', function () { $dotCtx.hide(); });

        $dotCtx.on('click', '.ctx-i', function () {
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
            $dotCtx.hide();
        });

        // ── Drag Core ──
        var tlDrag = null;

        $tlRows.on('pointerdown', '.tl-dot.keyframe', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation(); // Block the click event from navigating the cell immediately

            var $cell = $(this).closest('.tl-cell');
            tlDrag = {
                f: +$cell.data('f'),
                l: +$cell.data('l'),
                el: $(this),
                startX: e.clientX,
                startY: e.clientY,
                isDragging: false,
                ghost: null,
                targetCell: null
            };
        });

        $(window).on('pointermove', function (e) {
            if (!tlDrag) return;

            if (!tlDrag.isDragging) {
                var dist = Math.abs(e.clientX - tlDrag.startX) + Math.abs(e.clientY - tlDrag.startY);
                if (dist > 4) {
                    tlDrag.isDragging = true;
                    VF._isDraggingTimeline = true;

                    tlDrag.ghost = tlDrag.el.clone().css({
                        position: 'fixed',
                        pointerEvents: 'none',
                        zIndex: 9999,
                        opacity: 0.9,
                        transform: 'rotate(45deg) scale(1.3)'
                    }).appendTo('body');

                    tlDrag.el.css('opacity', '0.2');
                }
            }

            if (tlDrag.isDragging) {
                tlDrag.ghost.css({ left: e.clientX - 4, top: e.clientY - 4 });

                $('.tl-cell').css('background', '');

                tlDrag.ghost.hide();
                var target = document.elementFromPoint(e.clientX, e.clientY);
                tlDrag.ghost.show();

                var $targetCell = $(target).closest('.tl-cell');
                if ($targetCell.length) {
                    var tf = +$targetCell.data('f');
                    var tl = +$targetCell.data('l');
                    if (tf !== tlDrag.f || tl !== tlDrag.l) {
                        $targetCell.css('background', 'var(--bg-active)');
                        tlDrag.targetCell = { f: tf, l: tl };
                    } else {
                        tlDrag.targetCell = null;
                    }
                } else {
                    tlDrag.targetCell = null;
                }
            }
        });

        $(window).on('pointerup', function (e) {
            if (!tlDrag) return;

            if (!tlDrag.isDragging) {
                // If the user just clicked the dot without dragging, jump to that frame
                VF.goFrame(tlDrag.f);
            } else {
                if (tlDrag.targetCell) {
                    var tf = tlDrag.targetCell.f;
                    var tl = tlDrag.targetCell.l;

                    VF.saveHistory();

                    var srcLayer = S.layers.find(function (x) { return x.id === tlDrag.l; });
                    var tgtLayer = S.layers.find(function (x) { return x.id === tl; });

                    if (srcLayer && tgtLayer) {
                        var keyData = srcLayer.frames[tlDrag.f];
                        delete srcLayer.frames[tlDrag.f];
                        if (srcLayer.cache) delete srcLayer.cache[tlDrag.f];

                        tgtLayer.frames[tf] = keyData;
                        if (tgtLayer.cache) delete tgtLayer.cache[tf];

                        S.tl.frame = tf;
                    }
                }

                $('.tl-cell').css('background', '');
                tlDrag.el.css('opacity', '1');
                if (tlDrag.ghost) tlDrag.ghost.remove();

                VF._isDraggingTimeline = false;
                VF.uiTimeline();
                VF.render();
            }

            tlDrag = null;
        });
    });

})();