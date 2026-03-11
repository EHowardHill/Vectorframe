(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    /* ═══════════════════════════════════════════════════
       RUNTIME STATE (not saved with project)
       ═══════════════════════════════════════════════════ */

    if (!S.cfg.symmetryH) S.cfg.symmetryH = false;
    if (!S.cfg.symmetryV) S.cfg.symmetryV = false;
    if (!S.cfg.showGrid) S.cfg.showGrid = false;
    if (!S.cfg.gridSize) S.cfg.gridSize = 16;
    if (!S.cfg.showSafeZone) S.cfg.showSafeZone = false;
    if (!S.cfg.showCenter) S.cfg.showCenter = false;

    /* Tracks items drawn by the current render-guides pass */
    var _guideItems = [];


    /* ═══════════════════════════════════════════════════
       ┌─────────────────────────────────────────────────┐
       │  1 ·  DRAWING ASSISTS — SYMMETRY MIRROR         │
       └─────────────────────────────────────────────────┘
       After each brush stroke, duplicate the new items
       and mirror them across the canvas center.
       ═══════════════════════════════════════════════════ */

    VF._preSymmetryCount = 0;

    /* ── Wrap brush tool's mouseDown to snapshot layer state ── */
    var _origBrushDown = VF.tBrush.onMouseDown;
    VF.tBrush.onMouseDown = function (e) {
        var pl = VF.pLayers[S.activeId];
        VF._preSymmetryCount = pl ? pl.children.length : 0;
        _origBrushDown.call(this, e);
    };

    /* ── Wrap brush tool's mouseUp to apply mirror ── */
    var _origBrushUp = VF.tBrush.onMouseUp;
    VF.tBrush.onMouseUp = function (e) {
        _origBrushUp.call(this, e);

        if (!S.cfg.symmetryH && !S.cfg.symmetryV) return;

        var pl = VF.pLayers[S.activeId];
        if (!pl) return;

        /* Collect items added by the stroke */
        var origItems = [];
        for (var i = VF._preSymmetryCount; i < pl.children.length; i++) {
            var c = pl.children[i];
            if (!c._isH) origItems.push(c);
        }
        if (origItems.length === 0) return;

        var P = getP();
        var center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);

        if (S.cfg.symmetryH) {
            origItems.forEach(function (item) { mirrorItem(item, 'h', center, pl); });
        }
        if (S.cfg.symmetryV) {
            origItems.forEach(function (item) { mirrorItem(item, 'v', center, pl); });
        }
        if (S.cfg.symmetryH && S.cfg.symmetryV) {
            origItems.forEach(function (item) { mirrorItem(item, 'hv', center, pl); });
        }

        VF.saveFrame();
    };

    /* ── Mirror a single item across an axis ── */
    function mirrorItem(item, axis, center, pl) {
        var P = getP();

        /* ── Texture stroke groups — serialize/transform/rebuild ── */
        if (item.data && item.data.isTextureStroke) {
            return mirrorTextureItem(item, axis, center, pl);
        }

        /* ── Standard vector item — clone + matrix scale ── */
        var clone = item.clone(); /* clone inserts into same parent */
        if (axis === 'h') clone.scale(-1, 1, center);
        else if (axis === 'v') clone.scale(1, -1, center);
        else clone.scale(-1, -1, center);
        return clone;
    }

    function mirrorTextureItem(item, axis, center, pl) {
        var P = getP();
        var json = VF.serItem(item);
        if (!json) return null;

        var data;
        try { data = JSON.parse(json); } catch (_) { return null; }
        if (!data.__texStroke) return null;

        /* Transform pressure point coordinates */
        if (data.pressurePoints) {
            data.pressurePoints = data.pressurePoints.map(function (p) {
                var np = { x: p.x, y: p.y, angle: p.angle, width: p.width };
                if (axis === 'h' || axis === 'hv') {
                    np.x = 2 * center.x - np.x;
                    np.angle = 180 - np.angle;
                }
                if (axis === 'v' || axis === 'hv') {
                    np.y = 2 * center.y - np.y;
                    np.angle = -np.angle;
                }
                return np;
            });
        } else if (data.pathJSON) {
            /* Non-pressure texture stroke — mirror the guide path */
            var tmp = new P.Layer({ insert: false });
            var guide = tmp.importJSON(data.pathJSON);
            if (guide) {
                if (axis === 'h') guide.scale(-1, 1, center);
                else if (axis === 'v') guide.scale(1, -1, center);
                else guide.scale(-1, -1, center);
                data.pathJSON = guide.exportJSON();
            }
            tmp.remove();
        }

        /* Deserialize the mirrored data (adds to pl internally) */
        return VF.desItem(pl, JSON.stringify(data));
    }


    /* ═══════════════════════════════════════════════════
       ┌─────────────────────────────────────────────────┐
       │  2 ·  PATH UTILITIES                             │
       └─────────────────────────────────────────────────┘
       ═══════════════════════════════════════════════════ */

    /* ── Collect standard Path objects from selection ── */
    function getSelectedPaths() {
        var items = VF.getSelectedItems();
        var paths = [];
        items.forEach(function (item) {
            if (item.className === 'Path' || item.className === 'CompoundPath') {
                paths.push(item);
            }
            /* Recurse into non-texture groups */
            if (item.className === 'Group' && !(item.data && item.data.isTextureStroke)) {
                item.children.forEach(function (child) {
                    if (child.className === 'Path') paths.push(child);
                });
            }
        });
        return paths;
    }

    /* ── Simplify selected paths ── */
    VF.toolSimplify = function () {
        var paths = getSelectedPaths();
        if (paths.length === 0) { VF.toast('Select paths first'); return; }

        VF.saveHistory();
        var totalRemoved = 0;
        paths.forEach(function (p) {
            var before = p.segments.length;
            p.simplify(VF.smoothTol() * 2);
            totalRemoved += before - p.segments.length;
        });

        rebuildTexForSelection();
        VF.saveFrame();
        reselectPaths(paths);
        VF.toast('Simplified — removed ' + totalRemoved + ' points');
    };

    /* ── Smooth selected paths ── */
    VF.toolSmooth = function () {
        var paths = getSelectedPaths();
        if (paths.length === 0) { VF.toast('Select paths first'); return; }

        VF.saveHistory();
        paths.forEach(function (p) {
            p.smooth({ type: 'continuous', factor: 0.5 });
        });

        rebuildTexForSelection();
        VF.saveFrame();
        reselectPaths(paths);
        VF.toast('Paths smoothed');
    };

    /* ── Close open paths ── */
    VF.toolClosePath = function () {
        var paths = getSelectedPaths();
        if (paths.length === 0) { VF.toast('Select paths first'); return; }

        VF.saveHistory();
        var closed = 0;
        paths.forEach(function (p) {
            if (!p.closed) { p.closePath(); closed++; }
        });

        rebuildTexForSelection();
        VF.saveFrame();
        reselectPaths(paths);
        VF.toast(closed > 0 ? closed + ' path(s) closed' : 'All paths already closed');
    };

    /* ── Reverse winding direction ── */
    VF.toolReversePath = function () {
        var paths = getSelectedPaths();
        if (paths.length === 0) { VF.toast('Select paths first'); return; }

        VF.saveHistory();
        paths.forEach(function (p) { p.reverse(); });
        rebuildTexForSelection();
        VF.saveFrame();
        reselectPaths(paths);
        VF.toast('Path direction reversed');
    };

    /* ── Boolean operations ── */
    VF.toolBoolean = function (op) {
        var paths = getSelectedPaths();
        if (paths.length !== 2) {
            VF.toast('Select exactly 2 paths for ' + op);
            return;
        }

        /* Booleans need closed paths */
        if (!paths[0].closed || !paths[1].closed) {
            VF.toast('Both paths must be closed for boolean ops');
            return;
        }

        VF.saveHistory();

        var result;
        try {
            if (op === 'unite') result = paths[0].unite(paths[1]);
            else if (op === 'subtract') result = paths[0].subtract(paths[1]);
            else if (op === 'intersect') result = paths[0].intersect(paths[1]);
            else if (op === 'exclude') result = paths[0].exclude(paths[1]);
        } catch (e) {
            VF.toast('Boolean operation failed — paths may be incompatible');
            return;
        }

        if (result) {
            paths[0].remove();
            paths[1].remove();

            /* Select the result */
            VF.selSegments = [];
            (function walk(item) {
                if (item.segments) {
                    item.segments.forEach(function (seg) { VF.selSegments.push(seg); });
                }
                if (item.children) item.children.forEach(walk);
            })(result);
            VF.showHandles();
        }

        VF.saveFrame();
        VF.toast(op.charAt(0).toUpperCase() + op.slice(1) + ' applied');
    };

    /* ── Helper: rebuild texture rasters for any tex groups in selection ── */
    function rebuildTexForSelection() {
        var items = VF.getSelectedItems();
        items.forEach(function (item) {
            if (item.data && item.data.isTextureStroke) {
                VF.rebuildTextureRaster(item);
            }
            if (item.parent && item.parent.data && item.parent.data.isTextureStroke) {
                VF.rebuildTextureRaster(item.parent);
            }
        });
    }

    /* ── Helper: re-select segments of given paths ── */
    function reselectPaths(paths) {
        VF.selSegments = [];
        paths.forEach(function (p) {
            if (p.segments) {
                p.segments.forEach(function (seg) { VF.selSegments.push(seg); });
            }
        });
        VF.showHandles();
    }


    /* ═══════════════════════════════════════════════════
       ┌─────────────────────────────────────────────────┐
       │  3 ·  SELECTION OPERATIONS                       │
       └─────────────────────────────────────────────────┘
       ═══════════════════════════════════════════════════ */

    /* ── Select all items on current frame ── */
    VF.toolSelectAll = function () {
        var pl = VF.pLayers[S.activeId];
        if (!pl) return;

        VF.selSegments = [];
        VF.selectMode = 'object';

        pl.children.forEach(function (c) {
            if (c._isH) return;
            (function walk(item) {
                if (item.segments) {
                    item.segments.forEach(function (seg) { VF.selSegments.push(seg); });
                }
                if (item.children) item.children.forEach(walk);
            })(c);
        });

        if (VF.selSegments.length > 0) {
            VF.setTool('select');
            VF.showHandles();
            VF.toast(VF.getSelectedItems().length + ' item(s) selected');
        } else {
            VF.toast('Nothing on this frame');
        }
    };

    /* ── Flip selection ── */
    VF.toolFlip = function (axis) {
        var items = VF.getSelectedItems();
        if (items.length === 0) { VF.toast('Select items first'); return; }

        VF.saveHistory();
        var P = getP();

        /* Compute combined bounds center */
        var bounds = null;
        items.forEach(function (it) {
            bounds = bounds ? bounds.unite(it.bounds) : it.bounds.clone();
        });
        var center = bounds.center;

        items.forEach(function (item) {
            if (axis === 'h') item.scale(-1, 1, center);
            else item.scale(1, -1, center);

            /* Fix texture data */
            if (item.data && item.data.isTextureStroke && item.data.pressurePoints) {
                item.data.pressurePoints.forEach(function (p) {
                    if (axis === 'h') {
                        p.x = 2 * center.x - p.x;
                        p.angle = 180 - p.angle;
                    } else {
                        p.y = 2 * center.y - p.y;
                        p.angle = -p.angle;
                    }
                });
                VF.rebuildTextureRaster(item);
            }
        });

        VF.saveFrame();
        VF.showHandles();
        VF.toast('Flipped ' + (axis === 'h' ? 'horizontally' : 'vertically'));
    };

    /* ── Align selection ── */
    VF.toolAlign = function (edge) {
        var items = VF.getSelectedItems();
        if (items.length < 2) { VF.toast('Select 2+ items to align'); return; }

        VF.saveHistory();
        var P = getP();

        /* Combined bounds */
        var total = null;
        items.forEach(function (it) {
            total = total ? total.unite(it.bounds) : it.bounds.clone();
        });

        items.forEach(function (item) {
            var b = item.bounds;
            var dx = 0, dy = 0;

            switch (edge) {
                case 'left': dx = total.left - b.left; break;
                case 'centerH': dx = total.center.x - b.center.x; break;
                case 'right': dx = total.right - b.right; break;
                case 'top': dy = total.top - b.top; break;
                case 'centerV': dy = total.center.y - b.center.y; break;
                case 'bottom': dy = total.bottom - b.bottom; break;
            }

            if (dx !== 0 || dy !== 0) {
                item.position = item.position.add(new P.Point(dx, dy));
                if (item.data && item.data.isTextureStroke) {
                    VF.syncTextureGroup(item, 'translate', new P.Point(dx, dy));
                    VF.rebuildTextureRaster(item);
                }
            }
        });

        VF.saveFrame();
        VF.showHandles();
        VF.toast('Aligned ' + edge);
    };

    /* ── Distribute selection evenly ── */
    VF.toolDistribute = function (axis) {
        var items = VF.getSelectedItems();
        if (items.length < 3) { VF.toast('Select 3+ items to distribute'); return; }

        VF.saveHistory();
        var P = getP();

        /* Sort by position along the axis */
        var sorted = items.slice().sort(function (a, b) {
            return axis === 'h'
                ? a.bounds.center.x - b.bounds.center.x
                : a.bounds.center.y - b.bounds.center.y;
        });

        /* First and last stay put, middle items get evenly spaced */
        var first = sorted[0].bounds.center;
        var last = sorted[sorted.length - 1].bounds.center;
        var totalSpan = axis === 'h' ? last.x - first.x : last.y - first.y;
        var step = totalSpan / (sorted.length - 1);

        sorted.forEach(function (item, i) {
            if (i === 0 || i === sorted.length - 1) return;

            var target = axis === 'h'
                ? first.x + step * i
                : first.y + step * i;
            var current = axis === 'h'
                ? item.bounds.center.x
                : item.bounds.center.y;
            var delta = target - current;

            var dPt = axis === 'h'
                ? new P.Point(delta, 0)
                : new P.Point(0, delta);

            item.position = item.position.add(dPt);
            if (item.data && item.data.isTextureStroke) {
                VF.syncTextureGroup(item, 'translate', dPt);
                VF.rebuildTextureRaster(item);
            }
        });

        VF.saveFrame();
        VF.showHandles();
        VF.toast('Distributed ' + (axis === 'h' ? 'horizontally' : 'vertically'));
    };


    /* ═══════════════════════════════════════════════════
       ┌─────────────────────────────────────────────────┐
       │  4 ·  CANVAS GUIDES — Grid / Safe Zone / Center │
       └─────────────────────────────────────────────────┘
       ═══════════════════════════════════════════════════ */

    function clearGuideItems() {
        _guideItems.forEach(function (item) {
            try { item.remove(); } catch (_) { }
        });
        _guideItems = [];
    }

    function addGuideItem(item) {
        item._isH = true;       /* Prevents selection/serialization */
        item._isGuide = true;
        _guideItems.push(item);
    }

    /* ── Render pixel grid ── */
    function renderGrid() {
        if (!S.cfg.showGrid) return;

        var P = getP();
        var gs = Math.max(4, S.cfg.gridSize);
        var w = S.canvas.w, h = S.canvas.h;
        var z = VF.view.zoom;

        /* Skip sub-pixel lines at extreme zoom-out */
        var effectiveGS = gs;
        while (effectiveGS * z < 4 && effectiveGS < w) effectiveGS *= 2;

        var gridColor = new P.Color(0, 0, 0, 0.08);

        /* ── Use system dark mode detection ── */
        var isDark = document.documentElement.classList.contains('theme-dark') ||
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches &&
                !document.documentElement.classList.contains('theme-light'));
        if (isDark) gridColor = new P.Color(1, 1, 1, 0.06);

        VF.fgLayer.activate();

        /* Vertical lines */
        for (var x = effectiveGS; x < w; x += effectiveGS) {
            var vl = new P.Path.Line({
                from: [x, 0], to: [x, h],
                strokeColor: gridColor,
                strokeWidth: 0.5 / z
            });
            addGuideItem(vl);
        }

        /* Horizontal lines */
        for (var y = effectiveGS; y < h; y += effectiveGS) {
            var hl = new P.Path.Line({
                from: [0, y], to: [w, y],
                strokeColor: gridColor,
                strokeWidth: 0.5 / z
            });
            addGuideItem(hl);
        }

        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();
    }

    /* ── Render safe zone overlays (broadcast standard) ── */
    function renderSafeZones() {
        if (!S.cfg.showSafeZone) return;

        var P = getP();
        var w = S.canvas.w, h = S.canvas.h;
        var z = VF.view.zoom;

        VF.fgLayer.activate();

        var zones = [
            { label: 'Action Safe', factor: 0.93, color: '#e56c00' },
            { label: 'Title Safe', factor: 0.80, color: '#da2a00' }
        ];

        zones.forEach(function (zone) {
            var zw = w * zone.factor;
            var zh = h * zone.factor;
            var ox = (w - zw) / 2;
            var oy = (h - zh) / 2;

            var rect = new P.Path.Rectangle({
                point: [ox, oy],
                size: [zw, zh],
                strokeColor: zone.color,
                strokeWidth: 1 / z,
                dashArray: [6 / z, 4 / z],
                opacity: 0.5
            });
            addGuideItem(rect);

            /* Small label */
            var txt = new P.PointText({
                point: [ox + 4 / z, oy + 10 / z],
                content: zone.label,
                fontSize: 9 / z,
                fillColor: zone.color,
                opacity: 0.6
            });
            addGuideItem(txt);
        });

        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();
    }

    /* ── Render center crosshair and thirds ── */
    function renderCenterMark() {
        if (!S.cfg.showCenter) return;

        var P = getP();
        var w = S.canvas.w, h = S.canvas.h;
        var cx = w / 2, cy = h / 2;
        var z = VF.view.zoom;

        VF.fgLayer.activate();

        var armLen = 20 / z;
        var markColor = new P.Color(0.3, 0.6, 1.0, 0.5);

        /* Horizontal arm */
        addGuideItem(new P.Path.Line({
            from: [cx - armLen, cy], to: [cx + armLen, cy],
            strokeColor: markColor, strokeWidth: 1 / z
        }));

        /* Vertical arm */
        addGuideItem(new P.Path.Line({
            from: [cx, cy - armLen], to: [cx, cy + armLen],
            strokeColor: markColor, strokeWidth: 1 / z
        }));

        /* Rule-of-thirds lines */
        var thirdColor = new P.Color(0.3, 0.6, 1.0, 0.15);
        var thirds = [1 / 3, 2 / 3];

        thirds.forEach(function (t) {
            addGuideItem(new P.Path.Line({
                from: [w * t, 0], to: [w * t, h],
                strokeColor: thirdColor, strokeWidth: 0.5 / z,
                dashArray: [8 / z, 6 / z]
            }));
            addGuideItem(new P.Path.Line({
                from: [0, h * t], to: [w, h * t],
                strokeColor: thirdColor, strokeWidth: 0.5 / z,
                dashArray: [8 / z, 6 / z]
            }));
        });

        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();
    }

    /* ── Render symmetry axis lines (visual guide while drawing) ── */
    function renderSymmetryGuides() {
        if (!S.cfg.symmetryH && !S.cfg.symmetryV) return;

        var P = getP();
        var w = S.canvas.w, h = S.canvas.h;
        var z = VF.view.zoom;

        VF.fgLayer.activate();

        var symColor = new P.Color(1, 0.4, 0.6, 0.4);

        if (S.cfg.symmetryH) {
            addGuideItem(new P.Path.Line({
                from: [w / 2, 0], to: [w / 2, h],
                strokeColor: symColor, strokeWidth: 1.5 / z,
                dashArray: [8 / z, 4 / z]
            }));
        }

        if (S.cfg.symmetryV) {
            addGuideItem(new P.Path.Line({
                from: [0, h / 2], to: [w, h / 2],
                strokeColor: symColor, strokeWidth: 1.5 / z,
                dashArray: [8 / z, 4 / z]
            }));
        }

        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();
    }


    /* ═══════════════════════════════════════════════════
       RENDER HOOK
       Wraps VF.render() to draw guides after each frame.
       ═══════════════════════════════════════════════════ */

    var _origRender = VF.render;

    VF.render = function () {
        clearGuideItems();
        _origRender();

        /* Don't draw guides during export or playback */
        if (VF._exporting) return;
        if (S.tl.playing) return;

        renderGrid();
        renderSafeZones();
        renderCenterMark();
        renderSymmetryGuides();
    };


    /* ═══════════════════════════════════════════════════
       KEYBOARD SHORTCUT — Ctrl+A for Select All
       ═══════════════════════════════════════════════════ */

    $(document).on('keydown.toolsAdv', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            VF.toolSelectAll();
        }
    });


    /* ═══════════════════════════════════════════════════
       UI BINDINGS
       ═══════════════════════════════════════════════════ */

    $(document).ready(function () {

        /* ── Drawing Assists ── */
        $('#tgl-sym-h').on('click', function () {
            S.cfg.symmetryH = !S.cfg.symmetryH;
            $(this).toggleClass('on', S.cfg.symmetryH);
            VF.render();
            VF.toast('Horizontal symmetry ' + (S.cfg.symmetryH ? 'ON' : 'OFF'));
        });

        $('#tgl-sym-v').on('click', function () {
            S.cfg.symmetryV = !S.cfg.symmetryV;
            $(this).toggleClass('on', S.cfg.symmetryV);
            VF.render();
            VF.toast('Vertical symmetry ' + (S.cfg.symmetryV ? 'ON' : 'OFF'));
        });

        /* ── Canvas Guides ── */
        $('#tgl-show-grid').on('click', function () {
            S.cfg.showGrid = !S.cfg.showGrid;
            $(this).toggleClass('on', S.cfg.showGrid);
            VF.render();
        });

        $('#in-grid-size').on('change', function () {
            S.cfg.gridSize = Math.max(4, Math.min(256, +$(this).val() || 16));
            $(this).val(S.cfg.gridSize);
            if (S.cfg.showGrid) VF.render();
        }).on('keydown keyup keypress', function (e) { e.stopPropagation(); });

        $('#tgl-safe-zone').on('click', function () {
            S.cfg.showSafeZone = !S.cfg.showSafeZone;
            $(this).toggleClass('on', S.cfg.showSafeZone);
            VF.render();
        });

        $('#tgl-center-mark').on('click', function () {
            S.cfg.showCenter = !S.cfg.showCenter;
            $(this).toggleClass('on', S.cfg.showCenter);
            VF.render();
        });

        /* ── Path Utilities ── */
        $('#btn-path-simplify').on('click', VF.toolSimplify);
        $('#btn-path-smooth').on('click', VF.toolSmooth);
        $('#btn-path-close').on('click', VF.toolClosePath);
        $('#btn-path-reverse').on('click', VF.toolReversePath);

        $('#btn-bool-unite').on('click', function () { VF.toolBoolean('unite'); });
        $('#btn-bool-subtract').on('click', function () { VF.toolBoolean('subtract'); });
        $('#btn-bool-intersect').on('click', function () { VF.toolBoolean('intersect'); });
        $('#btn-bool-exclude').on('click', function () { VF.toolBoolean('exclude'); });

        /* ── Selection Ops ── */
        $('#btn-sel-all').on('click', VF.toolSelectAll);
        $('#btn-flip-h').on('click', function () { VF.toolFlip('h'); });
        $('#btn-flip-v').on('click', function () { VF.toolFlip('v'); });

        $('#btn-align').on('click', function () {
            var val = $('#sel-align').val();
            if (val) VF.toolAlign(val);
        });

        $('#btn-dist-h').on('click', function () { VF.toolDistribute('h'); });
        $('#btn-dist-v').on('click', function () { VF.toolDistribute('v'); });
    });

})();