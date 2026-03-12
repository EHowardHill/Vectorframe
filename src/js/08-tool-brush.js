(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    var curPath = null, drawing = false;
    var pressureGroup = null;
    var pressurePoints = [];
    var lastPoint = null;

    /* ── Real-time texture preview state ── */
    var texPreview = null;
    var fillPreview = null;
    var TEX_PREVIEW_INTERVAL = 80;
    var lastTexPreviewTime = 0;
    var pressureGuidePath = null;

    /* ── Stable seed: decided once at mouseDown ── */
    var strokeSeed = 0;

    /* ═══════════════════════════════════════════════════
       PEN INPUT OPTIMIZATION
       ═══════════════════════════════════════════════════
       Stylus / pen devices fire pointer events at 200+ Hz
       while mice typically fire at ~60 Hz. Without throttling,
       every event adds a Paper.js point or child object,
       causing visible lag with pen input.

       MIN_POINT_DIST: minimum pixel distance between
       consecutive points that we actually process. Points
       closer than this are skipped until the pen moves
       far enough. The final mouseUp point is always
       captured so stroke endpoints stay accurate.
       ═══════════════════════════════════════════════════ */
    var MIN_POINT_DIST = 1.5;
    var lastAddedPoint = null;

    function isTooClose(pt) {
        if (!lastAddedPoint) return false;
        var dx = pt.x - lastAddedPoint.x;
        var dy = pt.y - lastAddedPoint.y;
        return (dx * dx + dy * dy) < (MIN_POINT_DIST * MIN_POINT_DIST);
    }

    var tBrush = new (getP()).Tool(); tBrush.name = 'brush';
    VF.tBrush = tBrush;

    function clearTexPreview() {
        if (texPreview) { texPreview.remove(); texPreview = null; }
        if (fillPreview) { fillPreview.remove(); fillPreview = null; }
    }

    /* ── Build a live fill + texture preview on the active layer ── */
    function renderTexPreview() {
        var P = getP();
        var pl = VF.pLayers[S.activeId];
        if (!pl) return;
        clearTexPreview();

        var texCol = S.cfg.strokeCol;

        if (S.cfg.pressure) {
            if (pressurePoints.length < 2) return;

            if (S.cfg.autoFill) {
                fillPreview = new P.Path({
                    fillColor: S.cfg.fillCol,
                    strokeColor: null,
                    closed: true,
                    opacity: 0.6,
                    insert: false
                });
                pressurePoints.forEach(function (p) {
                    fillPreview.add(p.point.clone());
                });
                fillPreview.simplify(VF.smoothTol());
                pl.addChild(fillPreview);
            }

            var ptsCopy = pressurePoints.map(function (p) {
                return { point: p.point.clone(), angle: p.angle, width: p.width };
            });
            texPreview = VF.renderPressureTextureRibbon(
                ptsCopy, S.cfg.tex, texCol, S.cfg.brushSize, strokeSeed
            );
            if (texPreview) {
                pl.addChild(texPreview);
                if (pressureGuidePath) pressureGuidePath.visible = false;
            } else if (pressureGuidePath) {
                pressureGuidePath.visible = true;
            }
        } else {
            if (!curPath || curPath.length < 0.5) return;

            if (S.cfg.autoFill) {
                var fillClone = curPath.clone({ insert: false });
                fillClone.closePath();
                fillClone.simplify(VF.smoothTol());
                fillClone.strokeColor = null;
                fillClone.strokeWidth = 0;
                fillClone.fillColor = S.cfg.fillCol;
                fillClone.opacity = 0.6;
                fillPreview = fillClone;
                pl.addChild(fillPreview);
            }

            var clonePath = curPath.clone({ insert: false });
            clonePath.simplify(VF.smoothTol());
            texPreview = VF.renderTextureRibbon(
                clonePath,
                curPath.data._pendingTex,
                texCol,
                S.cfg.brushSize,
                { seed: strokeSeed }
            );
            if (texPreview) {
                pl.addChild(texPreview);
                curPath.visible = false;
            } else {
                curPath.visible = true;
            }
        }
    }

    /* ═══════════════════════════════════════════════════
       MOUSE DOWN
       ═══════════════════════════════════════════════════ */
    tBrush.onMouseDown = function (e) {
        var P = getP();
        if (VF.isPanInput(e.event)) return;
        if (VF.isLocked && VF.isLocked()) { VF.toast('Layer is locked'); return; }
        if (S.tl.playing) VF.togglePlay();
        if (S.tool !== 'brush') return;
        var l = VF.AL(); if (!l || l.type !== 'vector') return;
        var pl = VF.pLayers[l.id]; if (!pl) return;

        VF.saveHistory();

        /* Clear previous selection */
        VF.selSegments = [];
        VF.clearHandles();

        pl.activate();

        drawing = true;
        lastTexPreviewTime = 0;
        clearTexPreview();
        lastAddedPoint = null;

        strokeSeed = Date.now() | 0;

        var strokeCol = S.cfg.autoStroke ? S.cfg.strokeCol : null;
        var usingTex = S.cfg.tex !== 'none' && VF.baseBrushes[S.cfg.tex];

        if (S.cfg.pressure) {
            pressureGroup = new P.Group();
            pressurePoints = [];
            lastPoint = e.point;

            var col = S.cfg.autoStroke ? S.cfg.strokeCol : '#1e1e24';
            var w = Math.max(0.5, S.cfg.brushSize * VF.currentPressure);

            if (usingTex) {
                pressureGuidePath = new P.Path({
                    strokeColor: col,
                    strokeWidth: 1,
                    opacity: 0.35,
                    strokeCap: 'round'
                });
                pressureGuidePath.add(e.point);
                pressureGroup.addChild(pressureGuidePath);
            } else {
                var dot = new P.Path.Circle({
                    center: e.point, radius: w / 2,
                    fillColor: col
                });
                pressureGroup.addChild(dot);
            }

            pressurePoints.push({ point: e.point.clone(), angle: 0, width: w });
            lastAddedPoint = e.point.clone();
        } else {
            curPath = new P.Path({
                strokeWidth: S.cfg.brushSize,
                strokeCap: 'round', strokeJoin: 'round',
                strokeColor: strokeCol,
                fillColor: S.cfg.autoFill ? S.cfg.fillCol : null,
            });
            if (usingTex) {
                curPath.opacity = 0.3;
                curPath.data._pendingTex = S.cfg.tex;
                curPath.data._pendingCol = strokeCol;
            }
            curPath.add(e.point);
            lastAddedPoint = e.point.clone();
        }
    };

    tBrush.onMouseDrag = function (e) {
        var P = getP();
        if (!drawing) return;

        /* ── Distance throttle: skip points that are too close ── */
        if (isTooClose(e.point)) return;

        var usingTex = S.cfg.tex !== 'none' && VF.baseBrushes[S.cfg.tex];

        if (S.cfg.pressure && pressureGroup) {
            var col = S.cfg.autoStroke ? S.cfg.strokeCol : '#1e1e24';
            var w = Math.max(0.5, S.cfg.brushSize * VF.currentPressure);

            if (usingTex) {
                if (pressureGuidePath) pressureGuidePath.add(e.point);
            } else {
                var seg = new P.Path.Line({
                    from: lastPoint, to: e.point,
                    strokeWidth: w,
                    strokeCap: 'round',
                    strokeColor: col
                });
                pressureGroup.addChild(seg);
            }

            var delta = e.point.subtract(lastPoint);
            var angle = delta.length > 0.5 ? delta.angle : (pressurePoints.length > 0 ? pressurePoints[pressurePoints.length - 1].angle : 0);
            pressurePoints.push({ point: e.point.clone(), angle: angle, width: w });
            lastPoint = e.point;
            lastAddedPoint = e.point.clone();

            if (usingTex) {
                var now = Date.now();
                if (now - lastTexPreviewTime >= TEX_PREVIEW_INTERVAL) {
                    lastTexPreviewTime = now;
                    renderTexPreview();
                }
            }
        } else if (curPath) {
            curPath.add(e.point);
            lastAddedPoint = e.point.clone();

            if (usingTex) {
                var now2 = Date.now();
                if (now2 - lastTexPreviewTime >= TEX_PREVIEW_INTERVAL) {
                    lastTexPreviewTime = now2;
                    renderTexPreview();
                }
            }
        }
    };

    tBrush.onMouseUp = function (e) {
        if (!drawing) return;
        drawing = false;
        var P = getP();
        var usingTex = S.cfg.tex !== 'none' && VF.baseBrushes[S.cfg.tex];
        var pl = VF.pLayers[S.activeId];

        clearTexPreview();
        if (pressureGuidePath) { pressureGuidePath.remove(); pressureGuidePath = null; }

        /* Reset distance tracking */
        lastAddedPoint = null;

        var committed = [];

        if (S.cfg.pressure && pressureGroup) {
            /* ── Capture the final endpoint so the stroke ends accurately ── */
            if (pressurePoints.length > 0) {
                var lastPP = pressurePoints[pressurePoints.length - 1];
                var distToEnd = e.point.getDistance(lastPP.point);
                if (distToEnd > 0.1) {
                    var wEnd = Math.max(0.5, S.cfg.brushSize * VF.currentPressure);
                    var deltaEnd = e.point.subtract(lastPP.point);
                    var angleEnd = deltaEnd.length > 0.5 ? deltaEnd.angle : lastPP.angle;
                    pressurePoints.push({ point: e.point.clone(), angle: angleEnd, width: wEnd });

                    if (!usingTex) {
                        var col = S.cfg.autoStroke ? S.cfg.strokeCol : '#1e1e24';
                        var segEnd = new P.Path.Line({
                            from: lastPoint, to: e.point,
                            strokeWidth: wEnd,
                            strokeCap: 'round',
                            strokeColor: col
                        });
                        pressureGroup.addChild(segEnd);
                    }
                    lastPoint = e.point;
                }
            }

            if (usingTex && pressurePoints && pressurePoints.length > 0) {
                var texCol = S.cfg.strokeCol;
                pressureGroup.remove();

                if (S.cfg.autoFill && pressurePoints.length > 1) {
                    var fillPath = new P.Path({
                        fillColor: S.cfg.fillCol,
                        strokeColor: null,
                        closed: true,
                        insert: false
                    });
                    pressurePoints.forEach(function (p) {
                        fillPath.add(p.point.clone());
                    });
                    fillPath.simplify(VF.smoothTol());
                    if (pl) { pl.addChild(fillPath); committed.push(fillPath); }
                }

                var texGroup = VF.renderPressureTextureRibbon(
                    pressurePoints, S.cfg.tex, texCol, S.cfg.brushSize, strokeSeed
                );
                if (texGroup && pl) { pl.addChild(texGroup); committed.push(texGroup); }
            } else {
                committed.push(pressureGroup);
            }
            VF.saveFrame(); VF.uiTimeline();
            pressureGroup = null;
            pressurePoints = [];

        } else if (curPath) {
            /* ── Capture the final endpoint ── */
            var lastSeg = curPath.lastSegment;
            if (lastSeg && e.point.getDistance(lastSeg.point) > 0.1) {
                curPath.add(e.point);
            }

            curPath.visible = true;
            curPath.opacity = 1;

            if (S.cfg.autoFill && !usingTex) curPath.closePath();

            curPath.simplify(VF.smoothTol());

            if (usingTex && curPath.data._pendingTex) {
                var texName = curPath.data._pendingTex;
                var texCol2 = S.cfg.strokeCol;

                if (S.cfg.autoFill) {
                    var fillClone = curPath.clone({ insert: false });
                    fillClone.closePath();
                    fillClone.strokeColor = null;
                    fillClone.strokeWidth = 0;
                    fillClone.fillColor = S.cfg.fillCol;
                    if (pl) { pl.addChild(fillClone); committed.push(fillClone); }
                }

                var texGroup2 = VF.renderTextureRibbon(
                    curPath, texName, texCol2, S.cfg.brushSize,
                    { seed: strokeSeed }
                );
                if (texGroup2 && pl) {
                    pl.addChild(texGroup2);
                    committed.push(texGroup2);
                } else {
                    curPath.remove();
                }
            } else {
                committed.push(curPath);
            }
            VF.saveFrame(); VF.uiTimeline();
            curPath = null;
        }

        VF.selSegments = [];
        VF.clearHandles();
        committed.forEach(function (item) {
            if (item.segments) {
                item.segments.forEach(function (seg) { VF.selSegments.push(seg); });
            } else if (item.children) {
                item.children.forEach(function (child) {
                    if (child.segments) {
                        child.segments.forEach(function (seg) { VF.selSegments.push(seg); });
                    }
                });
            }
        });
        if (VF.selSegments.length > 0) VF.showHandles();

        if (pl) pl.activate();
    };

})();