(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var cvs = VF.cvs;
    var tCam = new (getP()).Tool(); tCam.name = 'cam';
    VF.tCam = tCam;

    var lastScreenPt = null;

    // 1. Capture the initial screen coordinate when the drag starts
    tCam.onMouseDown = function (e) {
        var P = getP();
        lastScreenPt = new P.Point(e.event.clientX, e.event.clientY);
    };

    tCam.onMouseDrag = function (e) {
        var P = getP();

        // 2. Calculate the raw pixel difference on the screen
        var currentScreenPt = new P.Point(e.event.clientX, e.event.clientY);
        var screenDelta = lastScreenPt ? currentScreenPt.subtract(lastScreenPt) : new P.Point(0, 0);
        lastScreenPt = currentScreenPt;

        if (S.tool === 'pan') {
            // Divide the screen movement by the zoom level to get stable project movement
            VF.view.center = VF.view.center.subtract(screenDelta.divide(VF.view.zoom));
        } else if (S.tool === 'zoom') {
            // Use screen Y movement so the zoom speed is consistent at all depths
            var f = 1 + screenDelta.y * -0.006;
            VF.view.zoom = Math.max(.05, Math.min(16, VF.view.zoom * f));
        }

        VF.updateInfo();
        VF.drawBorder();
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
