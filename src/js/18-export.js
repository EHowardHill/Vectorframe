(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    VF.exportPNG = function () {
        var P = getP();
        var cvs = VF.cvs;
        var view = VF.view;

        VF.saveFrame(true); VF.clearHandles();

        var oz = view.zoom;
        var oc = view.center.clone();

        var borderRect = VF.getBorderRect();
        var borderOutline = VF.getBorderOutline();

        if (borderRect) borderRect.visible = false;
        if (borderOutline) borderOutline.visible = false;
        VF.onionLayerBg.visible = false;
        VF.onionLayerFg.visible = false;
        VF.fgLayer.visible = false;

        view.viewSize = new P.Size(S.canvas.w, S.canvas.h);
        view.zoom = 1;
        view.center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
        view.update();

        var ec = document.createElement('canvas');
        ec.width = S.canvas.w;
        ec.height = S.canvas.h;
        var ectx = ec.getContext('2d');
        ectx.drawImage(cvs, 0, 0, cvs.width, cvs.height, 0, 0, S.canvas.w, S.canvas.h);

        // Extract base64 data URL
        var url = ec.toDataURL('image/png');

        if (borderRect) borderRect.visible = true;
        if (borderOutline) borderOutline.visible = true;
        VF.onionLayerBg.visible = true;
        VF.onionLayerFg.visible = true;
        VF.fgLayer.visible = true;

        VF.fitCanvas();
        view.zoom = oz;
        view.center = oc;
        view.update();

        // TAURI IPC EXPORT LOGIC
        const { invoke } = window.__TAURI__.core;
        const { save } = window.__TAURI__.dialog;

        save({
            title: 'Export Frame',
            defaultPath: 'frame_' + (S.tl.frame + 1) + '.png',
            filters: [{ name: 'Image', extensions: ['png'] }]
        }).then(function (filePath) {
            if (filePath) {
                // Pass to the Rust backend
                invoke('export_png', { image: url, path: filePath })
                    .then(function () { VF.toast('Saved successfully!'); })
                    .catch(function (err) { VF.toast('Export failed: ' + err); });
            }
        }).catch(function (err) {
            console.error("Dialog error:", err);
        });
    };

})();