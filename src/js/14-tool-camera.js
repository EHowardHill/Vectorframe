(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var cvs = VF.cvs;
    var tCam = new (getP()).Tool(); tCam.name = 'cam';
    VF.tCam = tCam;

    tCam.onMouseDrag = function (e) {
        if (S.tool === 'pan') {
            VF.view.center = VF.view.center.subtract(e.delta);
        } else if (S.tool === 'zoom') {
            var f = 1 + e.delta.y * -0.006;
            VF.view.zoom = Math.max(.05, Math.min(16, VF.view.zoom * f));
        }
        VF.updateInfo(); VF.drawBorder();
    };

    // Scroll-wheel zoom
    cvs.addEventListener('wheel', function (e) {
        var P = getP();
        e.preventDefault();

        var rect = cvs.getBoundingClientRect();
        var mousePt = new P.Point(e.clientX - rect.left, e.clientY - rect.top);
        var viewPt = VF.view.viewToProject(mousePt);

        var f = e.deltaY > 0 ? 0.9 : 1.1;
        var newZoom = Math.max(.05, Math.min(16, VF.view.zoom * f));

        VF.view.zoom = newZoom;
        VF.view.center = VF.view.center.add(viewPt.subtract(VF.view.viewToProject(mousePt)));

        VF.updateInfo(); VF.drawBorder();
    }, { passive: false });

    // Global Panning (Middle-Click OR Surface Pen Side Button)
    var isMiddlePanning = false, middlePanStart = null;

    $(cvs).on('pointerdown', function (e) {
        var P = getP();
        var ev = e.originalEvent;
        if (ev.button === 1 || (ev.pointerType === 'pen' && (ev.button === 2 || ev.button === 5))) {
            e.preventDefault();
            isMiddlePanning = true;
            middlePanStart = new P.Point(ev.clientX, ev.clientY);
            cvs.style.cursor = 'grab';
        }
    });

    $(window).on('pointermove', function (e) {
        var P = getP();
        if (isMiddlePanning && middlePanStart) {
            var ev = e.originalEvent;
            var currentPt = new P.Point(ev.clientX, ev.clientY);
            var delta = currentPt.subtract(middlePanStart).divide(VF.view.zoom);
            VF.view.center = VF.view.center.subtract(delta);
            middlePanStart = currentPt;
            VF.updateInfo(); VF.drawBorder();
        }
    });

    $(window).on('pointerup', function (e) {
        var ev = e.originalEvent;
        // Ensure we catch the release of the right-click button
        if (isMiddlePanning && (ev.button === 1 || ev.button === 2 || ev.pointerType === 'pen')) {
            isMiddlePanning = false;
            VF.setTool(S.tool);
        }
    });

    $(cvs).on('contextmenu', function (e) {
        // Always prevent the default browser context menu over the canvas 
        // so it doesn't pop up after a right-click pan.
        e.preventDefault();
    });

})();
