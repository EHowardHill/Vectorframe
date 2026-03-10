(function () {
    "use strict";

    var S = VF.S;

    var cvs = document.getElementById('main-canvas');
    paper.setup(cvs);

    // --- GLOBAL POINTER TRACKING ---
    cvs.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'pen') VF.currentPressure = e.pressure !== 0 ? e.pressure : 1.0;
        else VF.currentPressure = 1.0;
    });
    cvs.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'pen') VF.currentPressure = e.pressure !== 0 ? e.pressure : 1.0;
        else VF.currentPressure = 1.0;
    });

    var P = paper;
    var view = P.view;

    // Expose Paper.js references globally
    VF.cvs = cvs;
    VF.P = P;
    VF.view = view;

    // Create dedicated system layers that won't be serialized
    var bgLayer = new P.Layer(); bgLayer.name = 'SystemBackground';
    var onionLayerBg = new P.Layer(); onionLayerBg.name = 'OnionBackground';
    var onionLayerFg = new P.Layer(); onionLayerFg.name = 'OnionForeground';
    var fgLayer = new P.Layer(); fgLayer.name = 'SystemForeground';

    VF.bgLayer = bgLayer;
    VF.onionLayerBg = onionLayerBg;
    VF.onionLayerFg = onionLayerFg;
    VF.fgLayer = fgLayer;

    var borderRect = null;
    var borderOutline = null;

    VF.drawBorder = function () {
        if (borderRect) borderRect.remove();
        if (borderOutline) borderOutline.remove();

        bgLayer.activate();
        borderRect = new P.Path.Rectangle({
            point: [0, 0], size: [S.canvas.w, S.canvas.h],
            fillColor: '#fff'
        });
        bgLayer.sendToBack();

        fgLayer.activate();
        borderOutline = new P.Path.Rectangle({
            point: [0, 0], size: [S.canvas.w, S.canvas.h],
            strokeColor: '#ccc', strokeWidth: 1 / view.zoom,
            dashArray: [5 / view.zoom, 3 / view.zoom]
        });
        fgLayer.bringToFront();

        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();
    };

    VF.fitCanvas = function () {
        var a = document.getElementById('canvas-area');
        cvs.width = a.clientWidth;
        cvs.height = a.clientHeight;
        view.viewSize = new P.Size(a.clientWidth, a.clientHeight);
        VF.drawBorder();
        if (VF.render) VF.render();
    };
    window.addEventListener('resize', VF.fitCanvas);

    VF.updateInfo = function () {
        $('#canvas-info').text(Math.round(view.zoom * 100) + '% · ' + S.canvas.w + '×' + S.canvas.h);
    };

    VF.resetView = function () {
        view.zoom = 1;
        view.center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
        VF.updateInfo();
        VF.drawBorder();
    };

    // Expose border refs for export
    VF.getBorderRect = function () { return borderRect; };
    VF.getBorderOutline = function () { return borderOutline; };

})();
