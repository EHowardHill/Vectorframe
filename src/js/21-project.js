(function () {
    "use strict";

    var S = VF.S;

    VF.loadPrefs = function () {
        // Removed localStorage. We just sync UI with the active state.
        syncInputsFromState();
    };

    function syncInputsFromState() {
        $('#pref-w').val(S.canvas.w);
        $('#pref-h').val(S.canvas.h);
        $('#pref-end').val(S.tl.max);
        $('#pref-fps').val(S.tl.fps);

        $('#in-endframe').val(S.tl.max);
        $('#in-fps').val(S.tl.fps);

        // Sync Grain UI
        $('#tgl-grain').toggleClass('on', S.cfg.grain || false);
        $('#rng-grain').val(S.cfg.grainAmt || 10);
        $('#v-grain').val(S.cfg.grainAmt || 10);

        syncPresetDropdown();
    }

    VF.syncPrefsUI = syncInputsFromState;

    function syncPresetDropdown() {
        var combo = S.canvas.w + 'x' + S.canvas.h;
        var $preset = $('#pref-preset');
        if ($preset.find('option[value="' + combo + '"]').length > 0) {
            $preset.val(combo);
        } else {
            $preset.val('');
        }
    }

    function applyCanvas() {
        var w = Math.max(1, +$('#pref-w').val() || 640);
        var h = Math.max(1, +$('#pref-h').val() || 480);
        S.canvas.w = w;
        S.canvas.h = h;
        syncPresetDropdown();
        VF.resetView();
        VF.render();
    }

    function applyTiming() {
        var max = Math.max(1, +$('#pref-end').val() || 24);
        var fps = Math.max(1, Math.min(60, +$('#pref-fps').val() || 12));
        S.tl.max = max;
        S.tl.fps = fps;

        $('#in-endframe').val(max);
        $('#in-fps').val(fps);

        if (S.tl.frame >= S.tl.max) {
            S.tl.frame = S.tl.max - 1;
            VF.render();
        }
        VF.uiTimeline();
        if (S.tl.playing) { VF.togglePlay(); VF.togglePlay(); }
    }

    $('#pref-w, #pref-h').on('change', applyCanvas);

    $('#pref-preset').on('change', function () {
        var v = $(this).val();
        if (v) {
            var parts = v.split('x').map(Number);
            $('#pref-w').val(parts[0]);
            $('#pref-h').val(parts[1]);
            applyCanvas();
        }
    });

    $('#pref-end, #pref-fps').on('change', applyTiming);

    $('#in-endframe').on('change', function () {
        var max = Math.max(1, +this.value || 24);
        S.tl.max = max;
        $('#pref-end').val(max);
        if (S.tl.frame >= S.tl.max) { S.tl.frame = S.tl.max - 1; VF.render(); }
        VF.uiTimeline();
    });

    $('#in-fps').on('change', function () {
        var fps = Math.max(1, +this.value || 12);
        S.tl.fps = fps;
        $('#pref-fps').val(fps);
        if (S.tl.playing) { VF.togglePlay(); VF.togglePlay(); }
    });

    $('#pref-w, #pref-h, #pref-end, #pref-fps').on('keydown keyup keypress', function (e) {
        e.stopPropagation();
    });

})();