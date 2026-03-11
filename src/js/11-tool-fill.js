(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var tFill = new (getP()).Tool(); tFill.name = 'fill';
    VF.tFill = tFill;

    tFill.onMouseDown = function (e) {
        if (VF.isPanInput(e.event)) return;
        if (VF.isLocked && VF.isLocked()) { VF.toast('Layer is locked'); return; }
        if (S.tool !== 'fill') return;

        var pl = VF.pLayers[S.activeId]; if (!pl) return;
        var hit = pl.hitTest(e.point, { fill: true, stroke: true, tolerance: 5 });

        if (hit && hit.item) {
            VF.saveHistory();
            var target = hit.item.parent && hit.item.parent.className === 'Group' ? hit.item.parent : hit.item;
            target.fillColor = S.cfg.fillCol;
            if (S.cfg.autoStroke) target.strokeColor = S.cfg.strokeCol;
            VF.saveFrame();
        }
    };

})();
