(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    /* ═══════════════════════════════════════════════════
       MODE STATE
       'object'  — bounding-box gizmo (rotate/scale/translate)
       'vertex'  — individual point & Bézier handle editing
       ═══════════════════════════════════════════════════ */
    VF.selectMode = 'object';

    VF.exitVertexMode = function () {
        if (VF.selectMode === 'vertex') {
            VF.selectMode = 'object';
            VF.showHandles();
        }
    };


    /* ═══════════════════════════════════════════════════
       TEXTURE HELPERS
       ═══════════════════════════════════════════════════ */

    VF.rebuildTextureRaster = function (c) {
        var P = getP();
        if (!c.data || !c.data.isTextureStroke) return;
        var childrenArr = Array.from(c.children);
        var guide = childrenArr.find(function (ch) { return ch.data && ch.data.isGuide; });
        var oldRaster = childrenArr.find(function (ch) { return ch.className === 'Raster'; });
        if (!oldRaster) return;
        var tempGrp;
        if (c.data.pressurePoints && c.data.pressurePoints.length > 1) {
            var pts = c.data.pressurePoints.map(function (p) {
                return { point: new P.Point(p.x, p.y), angle: p.angle, width: p.width };
            });
            tempGrp = VF.renderPressureTextureRibbon(pts, c.data.tex, c.data.strokeCol, c.data.brushSize, c.data.seed);
        } else if (guide) {
            tempGrp = VF.renderTextureRibbon(guide.clone({ insert: false }), c.data.tex, c.data.strokeCol, c.data.brushSize, { seed: c.data.seed });
        }
        if (tempGrp) {
            var newChildren = Array.from(tempGrp.children);
            var newRaster = newChildren.find(function (ch) { return ch.className === 'Raster'; });
            if (newRaster) { newRaster.insertAbove(oldRaster); oldRaster.remove(); }
            if (c.data.pressurePoints && guide) {
                var newGuide = newChildren.find(function (ch) { return ch.data && ch.data.isGuide; });
                if (newGuide) { newGuide.insertAbove(guide); guide.remove(); }
            }
            tempGrp.remove();
        }
    };

    VF.syncTextureGroup = function (grp, tool, delta, xOrigin) {
        var P = getP();
        if (!grp || !grp.data || !grp.data.isTextureStroke) return;
        var r = grp.children ? Array.from(grp.children).find(function (c) { return c.className === 'Raster'; }) : null;
        var pts = grp.data.pressurePoints;
        if (tool === 'translate') {
            if (r) r.position = r.position.add(delta);
            if (pts) pts.forEach(function (p) { p.x += delta.x; p.y += delta.y; });
        } else if (tool === 'rotate') {
            if (r) r.rotate(delta, xOrigin);
            if (pts) pts.forEach(function (p) {
                var pt = new P.Point(p.x, p.y).subtract(xOrigin);
                pt.angle += delta;
                var f = pt.add(xOrigin);
                p.x = f.x; p.y = f.y; p.angle += delta;
            });
        } else if (tool === 'scale') {
            if (r) r.scale(delta.x, delta.y, xOrigin);
            if (pts) pts.forEach(function (p) {
                var pt = new P.Point(p.x, p.y).subtract(xOrigin);
                var f = new P.Point(pt.x * delta.x, pt.y * delta.y).add(xOrigin);
                p.x = f.x; p.y = f.y; p.width *= (Math.abs(delta.x) + Math.abs(delta.y)) / 2;
            });
        }
    };

    /* ── Throttled texture rebuild ── */
    var TEX_REBUILD_INTERVAL = 100;
    var lastTexRebuild = 0;
    var pendingTexGroups = new Set();

    function flushTexRebuilds(force) {
        if (pendingTexGroups.size === 0) return;
        var now = Date.now();
        if (!force && now - lastTexRebuild < TEX_REBUILD_INTERVAL) return;
        lastTexRebuild = now;
        pendingTexGroups.forEach(function (grp) { VF.rebuildTextureRaster(grp); });
        if (force) pendingTexGroups.clear();
    }


    /* ═══════════════════════════════════════════════════
       GIZMO  — object-mode bounding box handles
       ═══════════════════════════════════════════════════ */

    var gizmoEntries = [];
    var gizmoBounds = null;

    function clearGizmo() {
        gizmoEntries.forEach(function (g) { g.item.remove(); });
        gizmoEntries = [];
        gizmoBounds = null;
    }

    function pushG(item, action, cursor, anchor) {
        item._isH = true;
        gizmoEntries.push({ item: item, action: action, cursor: cursor, anchor: anchor || null });
        VF.selHandles.push(item);
    }

    function makeSquare(center, size, action, cursor, anchor) {
        var P = getP(); var z = VF.view.zoom; var hs = size / z;
        var sq = new P.Path.Rectangle({
            point: [center.x - hs / 2, center.y - hs / 2], size: [hs, hs],
            fillColor: '#fff', strokeColor: '#4a6fff', strokeWidth: 1 / z
        });
        pushG(sq, action, cursor, anchor);
    }

    function makeRect(center, w, h, action, cursor, anchor) {
        var P = getP(); var z = VF.view.zoom;
        var rw = w / z, rh = h / z;
        var rc = new P.Path.Rectangle({
            point: [center.x - rw / 2, center.y - rh / 2], size: [rw, rh],
            fillColor: '#fff', strokeColor: '#4a6fff', strokeWidth: 1 / z
        });
        pushG(rc, action, cursor, anchor);
    }

    function computeBounds() {
        var items = VF.getSelectedItems();
        if (items.length === 0) return null;
        var b = null;
        items.forEach(function (it) {
            if (!b) b = it.bounds.clone();
            else b = b.unite(it.bounds);
        });
        return b;
    }

    function drawGizmo() {
        var P = getP();
        var b = computeBounds();
        if (!b) return;
        gizmoBounds = b;
        var z = VF.view.zoom;

        pushG(new P.Path.Rectangle({
            point: b.topLeft, size: b.size,
            strokeColor: '#4a6fff', strokeWidth: 1 / z,
            dashArray: [5 / z, 3 / z]
        }), null, null);

        var rotDist = 24 / z;
        var rotTop = new P.Point(b.center.x, b.top);
        var rotPos = new P.Point(b.center.x, b.top - rotDist);
        pushG(new P.Path.Line({ from: rotTop, to: rotPos, strokeColor: '#4a6fff', strokeWidth: 1 / z }), null, null);
        pushG(new P.Path.Circle({
            center: rotPos, radius: 5.5 / z,
            fillColor: '#4a6fff', strokeColor: '#fff', strokeWidth: 1.2 / z
        }), 'rotate', 'crosshair');

        var HS = 7;
        makeSquare(b.topLeft, HS, 'scale-tl', 'nwse-resize', b.bottomRight);
        makeSquare(b.topRight, HS, 'scale-tr', 'nesw-resize', b.bottomLeft);
        makeSquare(b.bottomLeft, HS, 'scale-bl', 'nesw-resize', b.topRight);
        makeSquare(b.bottomRight, HS, 'scale-br', 'nwse-resize', b.topLeft);

        if (b.width > 18 / z) {
            makeRect(b.topCenter, 9, 5, 'scale-t', 'ns-resize', b.bottomCenter);
            makeRect(b.bottomCenter, 9, 5, 'scale-b', 'ns-resize', b.topCenter);
        }
        if (b.height > 18 / z) {
            makeRect(b.leftCenter, 5, 9, 'scale-l', 'ew-resize', b.rightCenter);
            makeRect(b.rightCenter, 5, 9, 'scale-r', 'ew-resize', b.leftCenter);
        }

        var cs = 4 / z; var cx = b.center;
        pushG(new P.Path.Line({ from: [cx.x - cs, cx.y], to: [cx.x + cs, cx.y], strokeColor: '#ff9500', strokeWidth: 1.2 / z }), null, null);
        pushG(new P.Path.Line({ from: [cx.x, cx.y - cs], to: [cx.x, cx.y + cs], strokeColor: '#ff9500', strokeWidth: 1.2 / z }), null, null);
    }


    /* ═══════════════════════════════════════════════════
       VERTEX HANDLES
       ═══════════════════════════════════════════════════ */

    function drawVertexHandles() {
        var P = getP();
        var z = VF.view.zoom;

        VF.selSegments.forEach(function (seg, i) {
            var d = new P.Path.Circle({
                center: seg.point, radius: 4.5 / z,
                fillColor: '#4a6fff', strokeColor: '#fff', strokeWidth: 1 / z
            });
            d._hIdx = i; d._hType = 'pt'; d._isH = true; d._seg = seg;
            VF.selHandles.push(d);

            if (seg.handleIn.length > 0.1) {
                var hpt = seg.point.add(seg.handleIn);
                var line1 = new P.Path.Line({ from: seg.point, to: hpt, strokeColor: '#ff9500', strokeWidth: 1 / z });
                line1._isH = true; VF.selHandles.push(line1);
                var hd = new P.Path.Circle({
                    center: hpt, radius: 3.5 / z,
                    fillColor: '#ff9500', strokeColor: '#fff', strokeWidth: .6 / z
                });
                hd._hIdx = i; hd._hType = 'hIn'; hd._isH = true; hd._seg = seg;
                VF.selHandles.push(hd);
            }

            if (seg.handleOut.length > 0.1) {
                var hpt2 = seg.point.add(seg.handleOut);
                var line2 = new P.Path.Line({ from: seg.point, to: hpt2, strokeColor: '#34c759', strokeWidth: 1 / z });
                line2._isH = true; VF.selHandles.push(line2);
                var hd2 = new P.Path.Circle({
                    center: hpt2, radius: 3.5 / z,
                    fillColor: '#34c759', strokeColor: '#fff', strokeWidth: .6 / z
                });
                hd2._hIdx = i; hd2._hType = 'hOut'; hd2._isH = true; hd2._seg = seg;
                VF.selHandles.push(hd2);
            }
        });

        if (VF.selSegments.length > 1) {
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            VF.selSegments.forEach(function (seg) {
                minX = Math.min(minX, seg.point.x); minY = Math.min(minY, seg.point.y);
                maxX = Math.max(maxX, seg.point.x); maxY = Math.max(maxY, seg.point.y);
            });
            var pad = 6 / z;
            var br = new P.Path.Rectangle({
                point: [minX - pad, minY - pad],
                size: [(maxX - minX) + pad * 2, (maxY - minY) + pad * 2],
                strokeColor: 'rgba(74, 111, 255, 0.4)',
                strokeWidth: 1 / z,
                dashArray: [4 / z, 4 / z]
            });
            br._isH = true; VF.selHandles.push(br);
        }
    }


    /* ═══════════════════════════════════════════════════
       UNIFIED clearHandles / showHandles
       ═══════════════════════════════════════════════════ */

    VF.clearHandles = function () {
        clearGizmo();
        VF.selHandles.forEach(function (h) { h.remove(); });
        VF.selHandles = [];
    };

    VF.showHandles = function () {
        var P = getP();
        VF.clearHandles();
        if (VF.selSegments.length === 0) return;

        VF.fgLayer.activate();

        if (VF.selectMode === 'vertex') {
            drawVertexHandles();
        } else {
            drawGizmo();
        }

        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();
    };


    /* ═══════════════════════════════════════════════════
       GIZMO HIT TESTING  (object mode)
       ═══════════════════════════════════════════════════ */

    function hitGizmo(pt) {
        for (var i = gizmoEntries.length - 1; i >= 0; i--) {
            var g = gizmoEntries[i];
            if (!g.action) continue;
            if (g.item.contains(pt)) return g;
        }
        return null;
    }

    function insideGizmo(pt) {
        if (!gizmoBounds) return false;
        return pt.x >= gizmoBounds.left && pt.x <= gizmoBounds.right &&
            pt.y >= gizmoBounds.top && pt.y <= gizmoBounds.bottom;
    }

    function isItemSelected(hitItem) {
        var pl = VF.pLayers[S.activeId]; if (!pl) return false;
        var t = hitItem;
        while (t.parent && t.parent !== pl) t = t.parent;
        var selectedItems = VF.getSelectedItems();
        for (var i = 0; i < selectedItems.length; i++) {
            if (selectedItems[i] === t) return true;
        }
        return false;
    }

    /* ═══════════════════════════════════════════════════
       VERTEX HANDLE HIT TESTING
       ═══════════════════════════════════════════════════ */

    function hitVertexHandle(pt) {
        for (var i = VF.selHandles.length - 1; i >= 0; i--) {
            var h = VF.selHandles[i];
            if (!h._hType || !['pt', 'hIn', 'hOut'].includes(h._hType)) continue;
            if (h.contains && h.contains(pt)) return h;
        }
        return null;
    }


    /* ═══════════════════════════════════════════════════
       OBJECT-MODE TRANSFORM ENGINE (drift-free)
       ═══════════════════════════════════════════════════ */

    var gAction = null, gAnchor = null, gCenter = null, gStartAng = null;
    var gOrigBounds = null, gOrigSegs = [], gOrigTex = [], gOrigRasters = [];
    var gSaved = false, gDragged = false;

    function collectAllSegments(items) {
        var segs = [];
        items.forEach(function (item) {
            (function walk(it) {
                if (it.segments) it.segments.forEach(function (s) { segs.push(s); });
                if (it.children) it.children.forEach(function (ch) { walk(ch); });
            })(item);
        });
        return segs;
    }

    function storeOriginals() {
        var P = getP();
        var items = VF.getSelectedItems();
        gOrigBounds = computeBounds();
        gOrigSegs = [];
        collectAllSegments(items).forEach(function (seg) {
            gOrigSegs.push({ seg: seg, point: seg.point.clone(), hIn: seg.handleIn.clone(), hOut: seg.handleOut.clone() });
        });
        gOrigTex = []; gOrigRasters = [];
        items.forEach(function (item) {
            if (item.data && item.data.isTextureStroke) {
                if (item.data.pressurePoints) {
                    gOrigTex.push({ group: item, pts: item.data.pressurePoints.map(function (p) { return { x: p.x, y: p.y, angle: p.angle, width: p.width }; }) });
                }
                var r = Array.from(item.children).find(function (c) { return c.className === 'Raster'; });
                if (r) gOrigRasters.push({ raster: r, pos: r.position.clone(), matrix: r.matrix.clone() });
            }
        });
    }

    function applyTranslate(delta) {
        VF.selSegments.forEach(function (seg) { seg.point = seg.point.add(delta); });
        VF.getSelectedItems().forEach(function (item) {
            if (item.data && item.data.isTextureStroke) VF.syncTextureGroup(item, 'translate', delta);
        });
    }

    function applyScale(sx, sy, anchor) {
        var P = getP();
        gOrigSegs.forEach(function (o) {
            var rel = o.point.subtract(anchor);
            o.seg.point = new P.Point(rel.x * sx, rel.y * sy).add(anchor);
            o.seg.handleIn = new P.Point(o.hIn.x * sx, o.hIn.y * sy);
            o.seg.handleOut = new P.Point(o.hOut.x * sx, o.hOut.y * sy);
        });
        gOrigTex.forEach(function (td) {
            var pts = td.group.data.pressurePoints;
            td.pts.forEach(function (orig, i) {
                var rel = new P.Point(orig.x, orig.y).subtract(anchor);
                pts[i].x = rel.x * sx + anchor.x; pts[i].y = rel.y * sy + anchor.y;
                pts[i].width = orig.width * (Math.abs(sx) + Math.abs(sy)) / 2;
            });
            pendingTexGroups.add(td.group);
        });
        gOrigRasters.forEach(function (or) { or.raster.matrix = or.matrix.clone(); or.raster.scale(sx, sy, anchor); });
    }

    function applyRotate(totalAngle, center) {
        var P = getP();
        var rad = totalAngle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        function rPt(pt) { var rx = pt.x - center.x, ry = pt.y - center.y; return new P.Point(rx * cos - ry * sin + center.x, rx * sin + ry * cos + center.y); }
        function rVec(v) { return new P.Point(v.x * cos - v.y * sin, v.x * sin + v.y * cos); }
        gOrigSegs.forEach(function (o) { o.seg.point = rPt(o.point); o.seg.handleIn = rVec(o.hIn); o.seg.handleOut = rVec(o.hOut); });
        gOrigTex.forEach(function (td) {
            var pts = td.group.data.pressurePoints;
            td.pts.forEach(function (orig, i) { var np = rPt(new P.Point(orig.x, orig.y)); pts[i].x = np.x; pts[i].y = np.y; pts[i].angle = orig.angle + totalAngle; });
            pendingTexGroups.add(td.group);
        });
        gOrigRasters.forEach(function (or) { or.raster.matrix = or.matrix.clone(); or.raster.rotate(totalAngle, center); });
    }

    function getOrigHandle(dir) {
        if (!gOrigBounds) return null;
        var b = gOrigBounds;
        switch (dir) {
            case 'tl': return b.topLeft; case 'tr': return b.topRight;
            case 'bl': return b.bottomLeft; case 'br': return b.bottomRight;
            case 't': return b.topCenter; case 'b': return b.bottomCenter;
            case 'l': return b.leftCenter; case 'r': return b.rightCenter;
        }
        return null;
    }

    function finishTransform() {
        var pl = VF.pLayers[S.activeId];
        if (pl) pl.children.forEach(VF.rebuildTextureRaster);
        flushTexRebuilds(true);
        VF.saveFrame();
        VF.showHandles();
    }


    /* ═══════════════════════════════════════════════════
       HELPERS
       ═══════════════════════════════════════════════════ */

    function selectItem(item, additive) {
        if (!additive) VF.selSegments = [];
        (function walk(it) {
            if (it.segments) it.segments.forEach(function (seg) { if (!VF.selSegments.includes(seg)) VF.selSegments.push(seg); });
            if (it.children) it.children.forEach(function (ch) { walk(ch); });
        })(item);
    }

    function resolveTarget(hitItem) {
        var pl = VF.pLayers[S.activeId]; if (!pl) return hitItem;
        var t = hitItem;
        while (t.parent && t.parent !== pl) t = t.parent;
        return t;
    }

    /** Notify UI of new selection */
    function notifySelectionChanged() {
        if (VF.syncUIFromSelection) VF.syncUIFromSelection();
    }


    /* ═══════════════════════════════════════════════════
       SELECT TOOL
       ═══════════════════════════════════════════════════ */

    var tSelect = new (getP()).Tool(); tSelect.name = 'select';
    VF.tSelect = tSelect;

    var lastClickTime = 0;
    var lastClickPoint = null;
    var DBLCLICK_MS = 400;
    var DBLCLICK_DIST = 8;

    var vDragH = null;
    var vSaved = false;

    /* ── MOUSE DOWN ── */
    tSelect.onMouseDown = function (e) {
        gAction = null; gSaved = false; gDragged = false;
        vDragH = null; vSaved = false;
        pendingTexGroups.clear(); lastTexRebuild = 0;
        if (VF.isPanInput(e.event)) return;
        if (S.tool !== 'select') return;
        var P = getP();
        var pl = VF.pLayers[S.activeId]; if (!pl) return;

        /* ── Double-click detection ── */
        var now = Date.now();
        var isDoubleClick = false;
        if (lastClickPoint && now - lastClickTime < DBLCLICK_MS) {
            var dist = e.point.getDistance(lastClickPoint);
            if (dist < DBLCLICK_DIST / VF.view.zoom) isDoubleClick = true;
        }
        lastClickTime = now;
        lastClickPoint = e.point.clone();


        /* ═══ VERTEX MODE ═══ */
        if (VF.selectMode === 'vertex') {

            var vh = hitVertexHandle(e.point);
            if (vh) { vDragH = vh; return; }

            var hit = pl.hitTest(e.point, { segments: true, tolerance: 8 / VF.view.zoom });
            if (hit && hit.type === 'segment' && hit.segment && !hit.item._isH) {
                if (e.event.shiftKey) {
                    var idx = VF.selSegments.indexOf(hit.segment);
                    if (idx >= 0) VF.selSegments.splice(idx, 1);
                    else VF.selSegments.push(hit.segment);
                } else {
                    VF.selSegments = [hit.segment];
                }
                VF.showHandles();
                notifySelectionChanged();
                vDragH = hitVertexHandle(e.point);
                return;
            }

            VF.selectMode = 'object';
            VF.selSegments = [];
            VF.clearHandles();
        }


        /* ═══ OBJECT MODE ═══ */

        if (isDoubleClick && VF.selSegments.length > 0) {
            var hitDbl = pl.hitTest(e.point, { stroke: true, fill: true, segments: true, tolerance: 8 / VF.view.zoom });
            if (hitDbl && hitDbl.item && !hitDbl.item._isH && isItemSelected(hitDbl.item)) {
                VF.selectMode = 'vertex';
                VF.showHandles();
                return;
            }
        }

        /* 1) Gizmo handle hit? */
        var gh = hitGizmo(e.point);
        if (gh) {
            gAction = gh.action;
            gAnchor = gh.anchor ? gh.anchor.clone() : null;
            gCenter = gizmoBounds ? gizmoBounds.center.clone() : e.point;
            gStartAng = e.point.subtract(gCenter).angle;
            storeOriginals();
            return;
        }

        /* 2) Layer hit test */
        var hit2 = pl.hitTest(e.point, { stroke: true, fill: true, segments: true, tolerance: 8 / VF.view.zoom });
        if (hit2 && hit2.item && !hit2.item._isH) {
            var target = resolveTarget(hit2.item);
            if (isItemSelected(hit2.item)) {
                gAction = 'translate-pending';
                return;
            } else {
                selectItem(target, e.event.shiftKey);
                VF.showHandles();
                notifySelectionChanged();
                gAction = 'translate-pending';
                return;
            }
        }

        /* 3) Inside gizmo bounds? → translate */
        if (insideGizmo(e.point)) {
            gAction = 'translate-pending';
            return;
        }

        /* 4) Nothing → deselect */
        if (!e.event.shiftKey) {
            VF.selSegments = [];
            VF.clearHandles();
        }
    };


    /* ── MOUSE DRAG ── */
    tSelect.onMouseDrag = function (e) {
        if (VF.isPanInput(e.event)) return;
        var P = getP();

        /* ═══ VERTEX MODE DRAG ═══ */
        if (VF.selectMode === 'vertex') {
            if (!vSaved && vDragH) {
                VF.saveHistory(); vSaved = true;
            }
            if (vDragH && vDragH._seg) {
                var seg = vDragH._seg;
                if (vDragH._hType === 'pt') seg.point = seg.point.add(e.delta);
                else if (vDragH._hType === 'hIn') seg.handleIn = seg.handleIn.add(e.delta);
                else if (vDragH._hType === 'hOut') seg.handleOut = seg.handleOut.add(e.delta);

                var texGrp = seg.path && seg.path.parent;
                if (texGrp && texGrp.data && texGrp.data.isTextureStroke) {
                    if (vDragH._hType === 'pt') VF.syncTextureGroup(texGrp, 'translate', e.delta);
                    pendingTexGroups.add(texGrp);
                }
                flushTexRebuilds(false);
                VF.showHandles();
            }
            return;
        }

        /* ═══ OBJECT MODE DRAG ═══ */
        if (!gAction) return;

        if (!gSaved) { VF.saveHistory(); gSaved = true; }
        gDragged = true;

        if (gAction === 'translate-pending' || gAction === 'translate') {
            gAction = 'translate';
            applyTranslate(e.delta);
            VF.showHandles();
            return;
        }

        if (gAction === 'rotate') {
            var curAng = e.point.subtract(gCenter).angle;
            var totalAngle = curAng - gStartAng;
            if (e.event.shiftKey) totalAngle = Math.round(totalAngle / 15) * 15;
            applyRotate(totalAngle, gCenter);
            flushTexRebuilds(false);
            VF.showHandles();
            return;
        }

        if (gAction.indexOf('scale') === 0 && gOrigBounds && gAnchor) {
            var dir = gAction.replace('scale-', '');
            var origHandle = getOrigHandle(dir);
            if (!origHandle) return;
            var sx = 1, sy = 1;
            var dx = origHandle.x - gAnchor.x, dy = origHandle.y - gAnchor.y;
            var scaleX = dir !== 't' && dir !== 'b';
            var scaleY = dir !== 'l' && dir !== 'r';
            if (scaleX && Math.abs(dx) > 0.001) sx = (e.point.x - gAnchor.x) / dx;
            if (scaleY && Math.abs(dy) > 0.001) sy = (e.point.y - gAnchor.y) / dy;
            if (e.event.shiftKey && scaleX && scaleY) { var u = (Math.abs(sx) + Math.abs(sy)) / 2; sx = u; sy = u; }
            if (scaleX && Math.abs(sx) < 0.02) sx = 0.02 * (sx < 0 ? -1 : 1);
            if (scaleY && Math.abs(sy) < 0.02) sy = 0.02 * (sy < 0 ? -1 : 1);
            if (!scaleX) sx = 1; if (!scaleY) sy = 1;
            applyScale(sx, sy, gAnchor);
            flushTexRebuilds(false);
            VF.showHandles();
        }
    };


    /* ── MOUSE UP ── */
    tSelect.onMouseUp = function (e) {
        if (VF.isPanInput(e.event)) return;

        if (VF.selectMode === 'vertex') {
            if (vDragH) {
                var pl = VF.pLayers[S.activeId];
                if (pl) pl.children.forEach(VF.rebuildTextureRaster);
                flushTexRebuilds(true);
                VF.saveFrame();
                VF.showHandles();
            }
            vDragH = null; vSaved = false;
            return;
        }

        if (gAction && gDragged && gAction !== 'translate-pending') {
            finishTransform();
        } else if (gAction === 'translate' && gDragged) {
            finishTransform();
        } else {
            VF.saveFrame();
        }
        gAction = null; gSaved = false; gDragged = false;
        gOrigSegs = []; gOrigTex = []; gOrigRasters = [];
    };


    /* ── MOUSE MOVE (cursor feedback) ── */
    tSelect.onMouseMove = function (e) {
        if (S.tool !== 'select') return;
        var cvs = VF.cvs;

        if (VF.selectMode === 'vertex') {
            var vh = hitVertexHandle(e.point);
            cvs.style.cursor = vh ? 'pointer' : 'default';
            return;
        }

        var gh = hitGizmo(e.point);
        if (gh) { cvs.style.cursor = gh.cursor || 'default'; return; }
        if (insideGizmo(e.point) && VF.selSegments.length > 0) { cvs.style.cursor = 'move'; return; }
        cvs.style.cursor = 'default';
    };


    /* ═══════════════════════════════════════════════════
       LASSO TOOL
       ═══════════════════════════════════════════════════ */

    var tLasso = new (getP()).Tool(); tLasso.name = 'lasso';
    VF.tLasso = tLasso;
    var lassoPath = null;

    tLasso.onMouseDown = function (e) {
        var P = getP();
        if (VF.isPanInput(e.event)) return;
        if (S.tool !== 'lasso') return;
        var pl = VF.pLayers[S.activeId]; if (!pl) return;
        pl.activate();
        VF.selectMode = 'object';
        if (!e.event.shiftKey) { VF.selSegments = []; VF.clearHandles(); }
        lassoPath = new P.Path({
            segments: [e.point], strokeColor: '#4a6fff', strokeWidth: 1 / VF.view.zoom,
            dashArray: [4 / VF.view.zoom, 4 / VF.view.zoom], closed: false
        });
    };

    tLasso.onMouseDrag = function (e) { if (lassoPath) lassoPath.add(e.point); };

    tLasso.onMouseUp = function (e) {
        if (!lassoPath) return;
        lassoPath.closePath();
        var pl = VF.pLayers[S.activeId];
        if (pl) {
            (function findSegs(items) {
                items.forEach(function (c) {
                    if (c === lassoPath || c._isH) return;
                    if (c.className === 'Group') findSegs(c.children);
                    else if (c.segments) {
                        c.segments.forEach(function (seg) {
                            if (lassoPath.contains(seg.point) && !VF.selSegments.includes(seg))
                                VF.selSegments.push(seg);
                        });
                    }
                });
            })(pl.children);
        }
        lassoPath.remove(); lassoPath = null;
        VF.showHandles();
        notifySelectionChanged();
    };

})();