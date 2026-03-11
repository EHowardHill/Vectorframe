(function () {
    "use strict";

    var S = VF.S;

    var TAG_COLORS = {
        none: 'transparent',
        red: '#ef4444',
        orange: '#f97316',
        yellow: '#eab308',
        green: '#22c55e',
        blue: '#3b82f6',
        purple: '#a855f7',
        pink: '#ec4899'
    };

    VF.TAG_COLORS = TAG_COLORS;
    VF._isDraggingLayer = false; // Freeze flag

    VF.uiLayers = function () {
        if (VF._isDraggingLayer) return;

        var h = '';
        var sorted = [].concat(S.layers).sort(function (a, b) { return b.z - a.z; });
        sorted.forEach(function (l) {
            if (VF.ensureLayerSettings) VF.ensureLayerSettings(l);

            var s = l.id === S.activeId ? ' sel' : '';
            var vis = l.vis ? '◉' : '○';
            var ico = l.type === 'image' ? '🖼' : '✎';

            var tagColor = TAG_COLORS[l.colorTag] || 'transparent';
            var borderStyle = tagColor !== 'transparent'
                ? 'border-left:3px solid ' + tagColor + ';'
                : 'border-left:3px solid transparent;';

            var badges = '';
            if (l.locked) badges += '<span class="lyr-badge lyr-badge-lock" title="Locked">🔒</span>';
            if (l.reference) badges += '<span class="lyr-badge lyr-badge-ref" title="Reference">📐</span>';
            if (l.wobble && l.wobble.enabled) badges += '<span class="lyr-badge lyr-badge-wobble" title="Wobble active">〰</span>';
            if (l.blendMode && l.blendMode !== 'normal') {
                badges += '<span class="lyr-badge lyr-badge-blend" title="Blend: ' + l.blendMode + '">' +
                    l.blendMode.charAt(0).toUpperCase() + '</span>';
            }

            // Notice we removed draggable="true" here
            h += '<div class="layer-item' + s + '" data-id="' + l.id + '" style="' + borderStyle + '">' +
                '<button class="vbtn" data-id="' + l.id + '">' + vis + '</button>' +
                '<span style="font-size:11px;opacity:.6">' + ico + '</span>' +
                '<span class="lyr-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + l.name + '</span>' +
                '<span class="lyr-badges">' + badges + '</span>' +
                '<button class="vbtn lyr-settings-btn" data-id="' + l.id + '" title="Layer Settings">⚙</button>' +
                '</div>';
        });
        $('#layers-list').html(h);

        var al = VF.AL();
        if (al) {
            $('#rng-opacity').val(al.opacity * 100);
            $('#v-opacity').val(Math.round(al.opacity * 100));
        }

        var lockEl = document.getElementById('lock-indicator');
        if (lockEl) {
            if (al && al.locked) lockEl.classList.add('visible');
            else lockEl.classList.remove('visible');
        }
    };

    $(document).ready(function () {
        var $list = $('#layers-list');

        // Double-click to rename layer
        $list.on('dblclick', '.lyr-name', function (e) {
            e.stopPropagation();
            var $span = $(this);
            var id = +$span.closest('.layer-item').data('id');
            var layer = S.layers.find(function (l) { return l.id === id; });
            if (!layer) return;

            var $input = $('<input class="lyr-name-input" type="text">')
                .val(layer.name)
                .css({
                    flex: 1, background: 'var(--bg-dark)', border: '1px solid var(--accent)',
                    color: 'var(--text-primary)', fontSize: '11px', padding: '0 4px',
                    borderRadius: '3px', outline: 'none', width: '100%'
                });
            $span.replaceWith($input);
            $input.focus().select();

            function commit() {
                var val = $input.val().trim();
                if (val) layer.name = val;
                VF.uiLayers();
                VF.uiTimeline();
            }
            $input.on('blur', commit);
            $input.on('keydown', function (ev) {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                if (ev.key === 'Escape') { ev.preventDefault(); VF.uiLayers(); VF.uiTimeline(); }
                ev.stopPropagation();
            });
            $input.on('keyup keypress', function (ev) { ev.stopPropagation(); });
        });

        // Settings gear button
        $list.on('click', '.lyr-settings-btn', function (e) {
            e.stopPropagation();
            VF.openLayerSettings(+$(this).data('id'));
        });

        // Visibility toggle
        $list.on('click', '.vbtn:not(.lyr-settings-btn)', function (e) {
            e.stopPropagation();
            var l = S.layers.find(function (x) { return x.id === +$(this).data('id'); }.bind(this));
            if (l) { l.vis = !l.vis; VF.uiLayers(); VF.render(); }
        });

        // ═══════════════════════════════════════════════════
        //  CUSTOM POINTER-BASED DRAG ENGINE
        // ═══════════════════════════════════════════════════
        var layerDrag = null;

        $list.on('pointerdown', '.layer-item', function (e) {
            // Ignore right-clicks, or clicks directly on the buttons/inputs
            if (e.button !== 0 || $(e.target).closest('.vbtn, .lyr-name-input, .lyr-settings-btn').length) return;

            e.preventDefault(); // Stop native drag / text selection

            layerDrag = {
                id: +$(this).data('id'),
                el: $(this),
                startX: e.clientX,
                startY: e.clientY,
                isDragging: false,
                ghost: null,
                targetId: null
            };
        });

        $(window).on('pointermove', function (e) {
            if (!layerDrag) return;

            // 1. Detect drag threshold (5px)
            if (!layerDrag.isDragging) {
                var dist = Math.abs(e.clientX - layerDrag.startX) + Math.abs(e.clientY - layerDrag.startY);
                if (dist > 5) {
                    layerDrag.isDragging = true;
                    VF._isDraggingLayer = true;

                    // Create physical floating ghost
                    layerDrag.ghost = layerDrag.el.clone().css({
                        position: 'fixed',
                        top: layerDrag.el.offset().top,
                        left: layerDrag.el.offset().left,
                        width: layerDrag.el.outerWidth(),
                        opacity: 0.8,
                        pointerEvents: 'none',
                        zIndex: 9999,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        background: 'var(--bg-panel)'
                    }).appendTo('body');

                    layerDrag.el.css('opacity', '0.3');
                }
            }

            // 2. Handle active drag
            if (layerDrag.isDragging) {
                // Pin ghost to pointer
                layerDrag.ghost.css({
                    top: e.clientY - (layerDrag.ghost.outerHeight() / 2),
                    left: e.clientX - 20
                });

                $('.layer-item').css('background', ''); // Clear visual states

                // Hide ghost momentarily to "see" what's directly underneath the pointer
                layerDrag.ghost.hide();
                var target = document.elementFromPoint(e.clientX, e.clientY);
                layerDrag.ghost.show();

                var $targetItem = $(target).closest('.layer-item');
                if ($targetItem.length && $targetItem.data('id') !== layerDrag.id) {
                    $targetItem.css('background', 'var(--bg-active)'); // Highlight target
                    layerDrag.targetId = +$targetItem.data('id');
                } else {
                    layerDrag.targetId = null;
                }
            }
        });

        $(window).on('pointerup', function (e) {
            if (!layerDrag) return;

            if (!layerDrag.isDragging) {
                // It was just a click! Perform layer selection.
                S.activeId = layerDrag.id;
                VF.selSegments = [];
                VF.clearHandles();
                VF.uiLayers();
                VF.render();
            } else {
                // It was a drag. Perform the layer reorder.
                if (layerDrag.targetId && layerDrag.targetId !== layerDrag.id) {
                    VF.saveHistory();
                    var sorted2 = [].concat(S.layers).sort(function (a, b) { return b.z - a.z; });
                    var srcIdx = sorted2.findIndex(function (x) { return x.id === layerDrag.id; });
                    var tgtIdx = sorted2.findIndex(function (x) { return x.id === layerDrag.targetId; });

                    if (srcIdx > -1 && tgtIdx > -1) {
                        var moved = sorted2.splice(srcIdx, 1)[0];
                        sorted2.splice(tgtIdx, 0, moved);
                        var len = sorted2.length;
                        sorted2.forEach(function (l, i) { l.z = len - 1 - i; });
                    }
                }

                // Cleanup UI
                layerDrag.el.css('opacity', '1');
                $('.layer-item').css('background', '');
                if (layerDrag.ghost) layerDrag.ghost.remove();

                VF._isDraggingLayer = false;
                VF.uiLayers();
                VF.render();
                VF.uiTimeline();
            }
            layerDrag = null;
        });
    });

})();