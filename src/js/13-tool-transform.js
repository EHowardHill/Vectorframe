(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var tXform = new (getP()).Tool(); tXform.name = 'xform';
    VF.tXform = tXform;
    var xOrigin = null;
    var tXformSaved = false;
    var dragTransform = null;

    var TEX_REBUILD_INTERVAL = 80;
    var lastRebuildTime = 0;
    var pendingTexGroups = new Set();

    function collectTexGroups() {
        pendingTexGroups.clear();
        VF.selSegments.forEach(function (seg) {
            if (seg.path && seg.path.parent &&
                seg.path.parent.data && seg.path.parent.data.isTextureStroke) {
                pendingTexGroups.add(seg.path.parent);
            }
        });
    }

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
            // Origin in LOCAL coordinate space
            xOrigin = new P.Point((minX + maxX) / 2, (minY + maxY) / 2);
            collectTexGroups();

            // Snapshot the original coordinates so non-destructive dragging won't jitter
            tXform.origSegs = [];
            VF.selSegments.forEach(function (seg) {
                tXform.origSegs.push({
                    seg: seg,
                    pt: seg.point.clone(),
                    hIn: seg.handleIn.clone(),
                    hOut: seg.handleOut.clone()
                });
            });

            // Calculate starting angle and distance mapped to global space
            var globalOrigin = pl.localToGlobal(xOrigin);
            tXform.startAngle = Math.atan2(e.point.y - globalOrigin.y, e.point.x - globalOrigin.x) * (180 / Math.PI);
            tXform.startDist = e.point.getDistance(globalOrigin);
        } else {
            // LAYER TRANSFORM MODE
            var l = VF.AL();
            if (l) {
                if (!l.transforms) l.transforms = {};
                if (l.transforms[S.tl.frame] === undefined) {
                    l.transforms[S.tl.frame] = VF.getLayerTransform(l, S.tl.frame);
                    if (VF.uiTimeline) VF.uiTimeline();
                }
                dragTransform = Object.assign({}, l.transforms[S.tl.frame]);

                var cx = S.canvas.w / 2, cy = S.canvas.h / 2;
                var globalOrigin = new P.Point(cx + dragTransform.x, cy + dragTransform.y);
                tXform.startAngle = Math.atan2(e.point.y - globalOrigin.y, e.point.x - globalOrigin.x) * (180 / Math.PI);
                tXform.startDist = e.point.getDistance(globalOrigin);
                tXform.origRotation = dragTransform.rotation;
                tXform.origScaleX = dragTransform.scaleX;
                tXform.origScaleY = dragTransform.scaleY;
            }
        }
    };

    tXform.onMouseDrag = function (e) {
        var P = getP();
        if (VF.isPanInput(e.event)) return;
        var pl = VF.pLayers[S.activeId]; if (!pl || pl.children.length === 0) return;

        if (!tXformSaved) {
            VF.saveHistory();
            tXformSaved = true;
        }

        if (VF.selSegments.length > 0) {
            if (S.tool === 'translate') {
                // Convert workspace project e.delta into local layer delta to prevent over/under-scaling
                var localDelta = pl.globalToLocal(e.point).subtract(pl.globalToLocal(e.point.subtract(e.delta)));
                VF.selSegments.forEach(function (seg) { seg.point = seg.point.add(localDelta); });
            } else if (S.tool === 'rotate') {
                var globalOrigin = pl.localToGlobal(xOrigin);
                var curAngle = Math.atan2(e.point.y - globalOrigin.y, e.point.x - globalOrigin.x) * (180 / Math.PI);
                var deltaAng = curAngle - tXform.startAngle;
                if (e.event.shiftKey) deltaAng = Math.round(deltaAng / 15) * 15;

                var rad = deltaAng * Math.PI / 180;
                var cos = Math.cos(rad), sin = Math.sin(rad);

                tXform.origSegs.forEach(function (orig) {
                    var dx = orig.pt.x - xOrigin.x, dy = orig.pt.y - xOrigin.y;
                    orig.seg.point = new P.Point(dx * cos - dy * sin + xOrigin.x, dx * sin + dy * cos + xOrigin.y);

                    var hInX = orig.hIn.x, hInY = orig.hIn.y;
                    orig.seg.handleIn = new P.Point(hInX * cos - hInY * sin, hInX * sin + hInY * cos);

                    var hOutX = orig.hOut.x, hOutY = orig.hOut.y;
                    orig.seg.handleOut = new P.Point(hOutX * cos - hOutY * sin, hOutX * sin + hOutY * cos);
                });
            } else if (S.tool === 'scale') {
                var globalOrigin = pl.localToGlobal(xOrigin);
                var curDist = e.point.getDistance(globalOrigin);
                var fac = tXform.startDist > 0.1 ? curDist / tXform.startDist : 1;
                if (e.event.shiftKey) fac = Math.round(fac * 10) / 10;

                tXform.origSegs.forEach(function (orig) {
                    var pt = orig.pt.subtract(xOrigin);
                    orig.seg.point = pt.multiply(fac).add(xOrigin);
                    orig.seg.handleIn = orig.hIn.multiply(fac);
                    orig.seg.handleOut = orig.hOut.multiply(fac);
                });
            }
            VF.showHandles();
            flushTexRebuilds();
        } else {
            // LAYER TRANSFORM (no selection)
            var l = VF.AL();
            if (l && dragTransform) {
                if (S.tool === 'translate') {
                    // Translation is applied natively in global project space relative to standard origin
                    dragTransform.x += e.delta.x;
                    dragTransform.y += e.delta.y;
                } else if (S.tool === 'rotate') {
                    var cx = S.canvas.w / 2, cy = S.canvas.h / 2;
                    var globalOrigin = new P.Point(cx + dragTransform.x, cy + dragTransform.y);
                    var curAngle = Math.atan2(e.point.y - globalOrigin.y, e.point.x - globalOrigin.x) * (180 / Math.PI);
                    var deltaAng = curAngle - tXform.startAngle;
                    if (e.event.shiftKey) deltaAng = Math.round(deltaAng / 15) * 15;
                    dragTransform.rotation = tXform.origRotation + deltaAng;
                } else if (S.tool === 'scale') {
                    var cx2 = S.canvas.w / 2, cy2 = S.canvas.h / 2;
                    var globalOrigin2 = new P.Point(cx2 + dragTransform.x, cy2 + dragTransform.y);
                    var curDist2 = e.point.getDistance(globalOrigin2);
                    var fac2 = tXform.startDist > 0.1 ? curDist2 / tXform.startDist : 1;
                    if (e.event.shiftKey) fac2 = Math.round(fac2 * 10) / 10;
                    dragTransform.scaleX = tXform.origScaleX * fac2;
                    dragTransform.scaleY = tXform.origScaleY * fac2;
                }
                l.transforms[S.tl.frame] = Object.assign({}, dragTransform);
                VF.render();
            }
        }
    };

    tXform.onMouseUp = function (e) {
        if (VF.isPanInput(e.event)) return;

        if (VF.selSegments.length > 0) {
            var pl = VF.pLayers[S.activeId];
            if (pl) pl.children.forEach(VF.rebuildTextureRaster);
        }

        pendingTexGroups.clear();
        dragTransform = null;
        VF.saveFrame();
    };

})();