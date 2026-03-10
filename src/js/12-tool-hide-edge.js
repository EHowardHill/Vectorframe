(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var tHideEdge = new (getP()).Tool(); tHideEdge.name = 'hideEdge';
    VF.tHideEdge = tHideEdge;
    var heSel = [];

    tHideEdge.onMouseDown = function (e) {
        var P = getP();
        if (VF.isPanInput(e.event)) return;
        if (S.tool !== 'hide-edge') return;
        var pl = VF.pLayers[S.activeId]; if (!pl) return;
        var hit = pl.hitTest(e.point, { segments: true, tolerance: 12 / VF.view.zoom });
        if (!hit || !hit.segment) { heSel = []; return; }

        VF.fgLayer.activate();
        var marker = new P.Path.Circle({ center: hit.segment.point, radius: 5 / VF.view.zoom, fillColor: 'rgba(255,150,54,.5)', strokeColor: '#ff9500', strokeWidth: 1 / VF.view.zoom });
        setTimeout(function () { marker.remove(); }, 600);
        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();

        heSel.push(hit.segment);
        if (heSel.length === 2) {
            VF.saveHistory();
            var s1 = heSel[0], s2 = heSel[1];
            if (s1.path === s2.path) {
                var path = s1.path;
                var i1 = Math.min(s1.index, s2.index);
                var i2 = Math.max(s1.index, s2.index);
                for (var i = i1; i < i2; i++) {
                    if (path.curves[i]) {
                        var c = path.curves[i];
                        var overlay = new P.Path();
                        overlay.add(new P.Segment(c.point1, null, c.handle1));
                        overlay.add(new P.Segment(c.point2, c.handle2, null));
                        overlay.strokeColor = '#fff';
                        overlay.strokeWidth = path.strokeWidth + 1;
                        overlay.insertAbove(path);
                    }
                }
            }
            heSel = [];
            VF.saveFrame();
        }
    };

})();
