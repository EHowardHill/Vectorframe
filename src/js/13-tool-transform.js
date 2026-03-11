(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var tXform = new (getP()).Tool(); tXform.name = 'xform';
    VF.tXform = tXform;
    var xOrigin = null;
    var tXformSaved = false;

    /* ── Throttle state for real-time texture rebuild ── */
    var TEX_REBUILD_INTERVAL = 80;
    var lastRebuildTime = 0;
    var pendingTexGroups = new Set();

    /* ── Helper: collect texture groups that own the selected segments ── */
    function collectTexGroups() {
        pendingTexGroups.clear();
        VF.selSegments.forEach(function (seg) {
            if (seg.path && seg.path.parent &&
                seg.path.parent.data && seg.path.parent.data.isTextureStroke) {
                pendingTexGroups.add(seg.path.parent);
            }
        });
    }

    /* ── Throttled rebuild ── */
    function flushTexRebuilds() {
        if (pendingTexGroups.size === 0) return;
        var now = Date.now();
        if (now - lastRebuildTime < TEX_REBUILD_INTERVAL) return;
        lastRebuildTime = now;
        pendingTexGroups.forEach(function (grp) {
            VF.rebuildTextureRaster(grp);
        });
    }

    tXform.onMouseDown = function (e) {
        var P = getP();
        if (VF.isPanInput(e.event)) return;
        tXformSaved = false;
        lastRebuildTime = 0;
        pendingTexGroups.clear();
        var pl = VF.pLayers[S.activeId]; if (!pl) return;

        if (VF.selSegments.length > 0) {
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            VF.selSegments.forEach(function (seg) {
                minX = Math.min(minX, seg.point.x); minY = Math.min(minY, seg.point.y);
                maxX = Math.max(maxX, seg.point.x); maxY = Math.max(maxY, seg.point.y);
            });
            xOrigin = new P.Point((minX + maxX) / 2, (minY + maxY) / 2);
            collectTexGroups();
        } else {
            xOrigin = pl.children.length > 0 ? pl.bounds.center : e.point;
        }
    };

    tXform.onMouseDrag = function (e) {
        if (VF.isPanInput(e.event)) return;
        var pl = VF.pLayers[S.activeId]; if (!pl || pl.children.length === 0) return;

        if (!tXformSaved) {
            VF.saveHistory();
            tXformSaved = true;
        }

        if (VF.selSegments.length > 0) {
            if (S.tool === 'translate') {
                VF.selSegments.forEach(function (seg) { seg.point = seg.point.add(e.delta); });
            } else if (S.tool === 'rotate') {
                var ang = e.delta.x * 0.4;
                VF.selSegments.forEach(function (seg) {
                    var pt = seg.point.subtract(xOrigin);
                    pt.angle += ang;
                    seg.point = pt.add(xOrigin);
                    seg.handleIn.angle += ang;
                    seg.handleOut.angle += ang;
                });
            } else if (S.tool === 'scale') {
                var fac = 1 + e.delta.x * 0.004;
                VF.selSegments.forEach(function (seg) {
                    var pt = seg.point.subtract(xOrigin);
                    seg.point = pt.multiply(fac).add(xOrigin);
                    seg.handleIn = seg.handleIn.multiply(fac);
                    seg.handleOut = seg.handleOut.multiply(fac);
                });
            }
            VF.showHandles();

            /* ── Throttled real-time texture rebuild for vertex transforms ── */
            flushTexRebuilds();
        } else {
            pl.children.forEach(function (c) {
                if (c._isH) return;

                if (S.tool === 'translate') c.position = c.position.add(e.delta);
                else if (S.tool === 'rotate') c.rotate(e.delta.x * 0.4, xOrigin);
                else if (S.tool === 'scale') {
                    var sw = c.strokeWidth;
                    c.scale(1 + e.delta.x * 0.004, xOrigin);
                    c.strokeWidth = sw;
                }
            });
        }
    };

    tXform.onMouseUp = function (e) {
        if (VF.isPanInput(e.event)) return;

        /* Final un-throttled rebuild for all affected texture groups */
        if (VF.selSegments.length > 0) {
            var pl = VF.pLayers[S.activeId];
            if (pl) pl.children.forEach(VF.rebuildTextureRaster);
        }
        pendingTexGroups.clear();

        VF.saveFrame();
    };

})();