(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    VF.exportPNG = function () {
        var P = getP();
        var cvs = VF.cvs;
        var view = VF.view;

        VF.saveFrame(); VF.clearHandles();

        var oz = view.zoom;
        var oc = view.center.clone();

        var borderRect = VF.getBorderRect();
        var borderOutline = VF.getBorderOutline();

        // Respect transparent toggle. If they want a colored background, keep it visible!
        if (borderRect) {
            borderRect.visible = (VF.wsPrefs && !VF.wsPrefs.canvasBgTransparent);
        }
        if (borderOutline) borderOutline.visible = false;

        VF.onionLayerBg.visible = false;
        VF.onionLayerFg.visible = false;
        VF.fgLayer.visible = false;

        /* ── Hide reference layers during export ── */
        var hiddenRefLayers = [];
        S.layers.forEach(function (l) {
            if (l.reference && l.vis) {
                var pl = VF.pLayers[l.id];
                if (pl) {
                    pl.visible = false;
                    hiddenRefLayers.push(pl);
                }
            }
        });

        /* ── Hide wobble temp layers during single-frame export ── */
        var hiddenWobble = [];
        if (VF._wobbleTempLayers) {
            VF._wobbleTempLayers.forEach(function (tl) {
                if (tl.visible) {
                    tl.visible = false;
                    hiddenWobble.push(tl);
                }
            });
        }

        /* FIX: Re-show original layers that wobble may have hidden.
           The wobble effect hides `pl.visible = false` on layers with wobble enabled,
           replacing them with temp jittered layers. Since we hide the temp layers above,
           we must restore visibility on the originals so they render in the export. */
        var restoredOriginals = [];
        S.layers.forEach(function (l) {
            if (l.wobble && l.wobble.enabled && l.vis && l.type === 'vector') {
                var pl = VF.pLayers[l.id];
                if (pl && !pl.visible) {
                    pl.visible = true;
                    restoredOriginals.push(pl);
                }
            }
        });

        view.viewSize = new P.Size(S.canvas.w, S.canvas.h);
        view.zoom = 1;
        view.center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
        view.update();

        var ec = document.createElement('canvas');
        ec.width = S.canvas.w;
        ec.height = S.canvas.h;
        var ectx = ec.getContext('2d');
        ectx.drawImage(cvs, 0, 0, cvs.width, cvs.height, 0, 0, S.canvas.w, S.canvas.h);

        var url = ec.toDataURL('image/png');

        if (borderRect) borderRect.visible = true;
        if (borderOutline) borderOutline.visible = true;
        VF.onionLayerBg.visible = true;
        VF.onionLayerFg.visible = true;
        VF.fgLayer.visible = true;

        /* ── Restore reference layers ── */
        hiddenRefLayers.forEach(function (pl) { pl.visible = true; });
        hiddenWobble.forEach(function (tl) { tl.visible = true; });

        /* ── Re-hide originals that wobble should hide (will be fixed on next render()) ── */
        /* Actually, let render() handle the restore naturally */

        VF.fitCanvas();
        view.zoom = oz;
        view.center = oc;
        view.update();
        VF.render(); /* FIX: Trigger a full re-render to restore wobble state properly */

        // TAURI IPC EXPORT LOGIC
        const { invoke } = window.__TAURI__.core;
        const { save } = window.__TAURI__.dialog;

        save({
            title: 'Export Frame',
            defaultPath: 'frame_' + (S.tl.frame + 1) + '.png',
            filters: [{ name: 'Image', extensions: ['png'] }]
        }).then(function (filePath) {
            if (filePath) {
                invoke('export_png', { image: url, path: filePath })
                    .then(function () { VF.toast('Saved successfully!'); })
                    .catch(function (err) { VF.toast('Export failed: ' + err); });
            }
        }).catch(function (err) {
            console.error("Dialog error:", err);
        });
    };

})();
