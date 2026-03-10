(function () {
    "use strict";

    VF.importImg = function () { $('#file-import').trigger('click'); };

    $('#file-import').on('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function (ev) {
            var l = VF.addLayer(f.name.replace(/\.\w+$/, ''), 'image');
            l.imgData = ev.target.result;
            l.frames[0] = [];
            VF.render();
            VF.uiTimeline();
        };
        rd.readAsDataURL(f);
        $(this).val('');
    });

})();
