(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var tEraser = new (getP()).Tool(); tEraser.name = 'eraser';
    VF.tEraser = tEraser;

    var tEraserSaved = false;

    function eraseAt(pt) {
        var pl = VF.pLayers[S.activeId]; if (!pl) return;
        var hit = pl.hitTest(pt, { stroke: true, fill: true, bounds: true, tolerance: Math.max(S.cfg.brushSize, 6) });

        if (hit && hit.item && !hit.item._isH) {
            if (!tEraserSaved) {
                VF.saveHistory();
                tEraserSaved = true;
            }
            var target = hit.item;
            var cursor = target;
            while (cursor && cursor !== pl) {
                if (cursor.data && cursor.data.isTextureStroke) {
                    target = cursor;
                    break;
                }
                if (cursor.parent && cursor.parent !== pl && cursor.parent.className === 'Group') {
                    target = cursor.parent;
                    cursor = cursor.parent;
                } else {
                    break;
                }
            }
            target.remove();
            VF.view.update();
        }
    }

    tEraser.onMouseDown = function (e) {
        if (VF.isPanInput(e.event)) return;
        tEraserSaved = false;
        if (S.tool === 'eraser') eraseAt(e.point);
    };

    tEraser.onMouseDrag = function (e) {
        if (e.event.buttons === 4 || e.event.button === 1) return;
        if (S.tool === 'eraser') eraseAt(e.point);
    };

    tEraser.onMouseUp = function (e) {
        if (VF.isPanInput(e.event)) return;
        VF.saveFrame();
        VF.render();
    };

})();
