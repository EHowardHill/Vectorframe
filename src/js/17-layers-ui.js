(function () {
    "use strict";

    var S = VF.S;

    VF.uiLayers = function () {
        var h = '';
        var sorted = [].concat(S.layers).sort(function (a, b) { return b.z - a.z; });
        sorted.forEach(function (l) {
            var s = l.id === S.activeId ? ' sel' : '';
            var vis = l.vis ? '◉' : '○';
            var ico = l.type === 'image' ? '🖼' : '✎';
            h += '<div class="layer-item' + s + '" data-id="' + l.id + '" draggable="true">' +
                '<button class="vbtn" data-id="' + l.id + '">' + vis + '</button>' +
                '<span style="font-size:11px;opacity:.6">' + ico + '</span>' +
                '<span class="lyr-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + l.name + '</span>' +
                '</div>';
        });
        $('#layers-list').html(h);

        // Select layer
        $('.layer-item').on('click', function (e) {
            if ($(e.target).hasClass('vbtn')) return;
            if ($(e.target).hasClass('lyr-name-input')) return;
            S.activeId = +$(this).data('id');
            VF.selSegments = [];
            VF.clearHandles();
            VF.uiLayers(); VF.render();
        });

        // Double-click to rename layer
        $('.layer-item .lyr-name').on('dblclick', function (e) {
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

        // Visibility
        $('.vbtn').on('click', function (e) {
            e.stopPropagation();
            var l = S.layers.find(function (x) { return x.id === +$(this).data('id'); }.bind(this));
            if (l) { l.vis = !l.vis; VF.uiLayers(); VF.render(); }
        });

        // Drag reorder
        var dId = null;
        $('.layer-item').on('dragstart', function (e) {
            dId = +$(this).data('id');
            e.originalEvent.dataTransfer.effectAllowed = 'move';
            $(this).css('opacity', '.5');
        });
        $('.layer-item').on('dragend', function () { $(this).css('opacity', '1'); });
        $('.layer-item').on('dragover', function (e) { e.preventDefault(); $(this).css('background', 'var(--bg-active)'); });
        $('.layer-item').on('dragleave', function () { $(this).css('background', ''); });
        $('.layer-item').on('drop', function (e) {
            e.preventDefault(); $(this).css('background', '');
            var tId = +$(this).data('id');
            if (dId && dId !== tId) {
                VF.saveHistory();
                var sorted2 = [].concat(S.layers).sort(function (a, b) { return b.z - a.z; });
                var srcIdx = sorted2.findIndex(function (x) { return x.id === dId; });
                var tgtIdx = sorted2.findIndex(function (x) { return x.id === tId; });

                if (srcIdx > -1 && tgtIdx > -1) {
                    var moved = sorted2.splice(srcIdx, 1)[0];
                    sorted2.splice(tgtIdx, 0, moved);
                    var len = sorted2.length;
                    sorted2.forEach(function (l, i) { l.z = len - 1 - i; });
                    VF.uiLayers(); VF.render(); VF.uiTimeline();
                }
            }
            dId = null;
        });

        // Sync opacity slider
        var al = VF.AL();
        if (al) {
            $('#rng-opacity').val(al.opacity * 100);
            $('#v-opacity').val(Math.round(al.opacity * 100));
        }
    };

})();
