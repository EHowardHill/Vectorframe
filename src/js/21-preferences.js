(function () {
    "use strict";

    var S = VF.S;

    VF.loadPrefs = function () {
        try {
            var saved = localStorage.getItem('vf_prefs');
            if (saved) {
                var p = JSON.parse(saved);
                if (p.w) S.canvas.w = p.w;
                if (p.h) S.canvas.h = p.h;
                if (p.max) S.tl.max = p.max;
                if (p.fps) S.tl.fps = p.fps;
            }
        } catch (e) { }
    };

    VF.savePrefs = function () {
        var p = { w: S.canvas.w, h: S.canvas.h, max: S.tl.max, fps: S.tl.fps };
        localStorage.setItem('vf_prefs', JSON.stringify(p));
    };

    $('#btn-prefs').on('click', function () {
        $('#pref-w').val(S.canvas.w); $('#pref-h').val(S.canvas.h);
        $('#pref-end').val(S.tl.max); $('#pref-fps').val(S.tl.fps);
        $('#modal-prefs').show();
    });

    $('#pref-cancel').on('click', function () { $('#modal-prefs').hide(); });

    $('#pref-apply').on('click', function () {
        S.canvas.w = +$('#pref-w').val() || 640;
        S.canvas.h = +$('#pref-h').val() || 480;
        S.tl.max = Math.max(1, +$('#pref-end').val() || 24);
        S.tl.fps = Math.max(1, +$('#pref-fps').val() || 12);
        $('#in-endframe').val(S.tl.max); $('#in-fps').val(S.tl.fps);
        if (S.tl.frame >= S.tl.max) S.tl.frame = S.tl.max - 1;

        VF.savePrefs();

        VF.resetView(); VF.render(); VF.uiTimeline();
        $('#modal-prefs').hide();
    });

    $('#pref-preset').on('change', function () {
        var v = $(this).val();
        if (v) { var parts = v.split('x').map(Number); $('#pref-w').val(parts[0]); $('#pref-h').val(parts[1]); }
    });

})();
