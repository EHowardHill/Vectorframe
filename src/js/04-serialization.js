(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    VF.getResolvedFrame = function (layer, f) {
        for (var i = f; i >= 0; i--) {
            if (layer.frames[i] !== undefined) return { keyFrame: i, data: layer.frames[i] };
        }
        return null;
    };

    VF.serPL = function (pl) {
        var P = getP();
        var out = [];

        pl.children.forEach(function (c) {
            if (c._isH) return;

            // --- TEXTURE STROKE GROUP ---
            if (c.data && c.data.isTextureStroke) {
                var customData = {
                    __texStroke: true,
                    tex: c.data.tex,
                    col: c.data.strokeCol,
                    size: c.data.brushSize,
                    seed: c.data.seed || 0
                };

                var mat = c.matrix;
                var decomp = mat.decompose();

                if (c.data.pressurePoints) {
                    customData.pressurePoints = c.data.pressurePoints.map(function (p) {
                        var mappedPt = mat.transform(new P.Point(p.x, p.y));
                        return {
                            x: mappedPt.x,
                            y: mappedPt.y,
                            angle: p.angle,
                            width: p.width * decomp.scaling.x
                        };
                    });
                } else {
                    var guide = c.children ? Array.from(c.children).find(
                        function (ch) { return ch.data && ch.data.isGuide; }
                    ) : null;

                    if (guide) {
                        var gClone = guide.clone({ insert: false });
                        gClone.transform(mat);
                        gClone.visible = true;
                        customData.pathJSON = gClone.exportJSON();
                    }
                }
                out.push(JSON.stringify(customData));
                return;
            }

            // --- STANDARD VECTOR ITEMS ---
            if (c.className === 'Path' || c.className === 'CompoundPath' || c.className === 'Shape' || c.className === 'Group') {
                var clone = c.clone({ insert: false });
                out.push(clone.exportJSON());
            }
        });
        return out;
    };

    VF.desPL = function (pl, arr) {
        var P = getP();
        pl.removeChildren();
        if (!arr || !Array.isArray(arr)) return;

        arr.forEach(function (j) {
            try {
                var parsed = null;
                try { parsed = JSON.parse(j); } catch (_) { parsed = null; }

                if (parsed && parsed.__texStroke) {
                    if (parsed.pressurePoints && parsed.pressurePoints.length > 0) {
                        var pts = parsed.pressurePoints.map(function (p) {
                            return {
                                point: new P.Point(p.x, p.y),
                                angle: p.angle,
                                width: p.width
                            };
                        });
                        var grp = VF.renderPressureTextureRibbon(pts, parsed.tex, parsed.col, parsed.size, parsed.seed);
                        if (grp) pl.addChild(grp);
                    } else if (parsed.pathJSON) {
                        var tempGroup = new P.Group({ insert: false });
                        var guidePath = tempGroup.importJSON(parsed.pathJSON);
                        if (guidePath) {
                            guidePath.remove();
                            var grp2 = VF.renderTextureRibbon(guidePath, parsed.tex, parsed.col, parsed.size, { seed: parsed.seed });
                            if (grp2) pl.addChild(grp2);
                        }
                        tempGroup.remove();
                    }
                    return;
                }

                pl.importJSON(j);
            } catch (e) { }
        });
    };

    VF.saveFrame = function () {
        var l = VF.AL();
        if (!l) return;
        var pl = VF.pLayers[l.id]; if (!pl) return;

        var res = VF.getResolvedFrame(l, S.tl.frame);
        var targetFrame = res ? res.keyFrame : S.tl.frame;

        if (l.type === 'vector') {
            l.frames[targetFrame] = VF.serPL(pl);
            if (!l.cache) l.cache = {};
            delete l.cache[targetFrame];
        } else if (l.type === 'image') {
            var r = pl.children.find(function (c) { return c.className === 'Raster'; });
            l.frames[targetFrame] = r ? { matrix: r.matrix.values } : [];
        }
    };

    VF.loadFrame = function (id, f) {
        var P = getP();
        var l = S.layers.find(function (x) { return x.id === id; });
        var pl = VF.pLayers[id]; if (!l || !pl) return;

        var res = VF.getResolvedFrame(l, f);
        var data = res ? res.data : null;
        var targetFrame = res ? res.keyFrame : null;

        if (l.type === 'vector') {
            pl.removeChildren();

            /* ── During MP4 export (VF._exporting === true), ALL layers
               get full vector deserialization for maximum quality.
               Normally only the active layer gets full deser;
               the rest use a raster cache for performance. ── */
            if (id === S.activeId || VF._exporting) {
                VF.desPL(pl, data);
            } else {
                if (targetFrame === null) return;
                if (!l.cache) l.cache = {};

                if (l.cache[targetFrame]) {
                    var cacheData = l.cache[targetFrame];
                    var r = new P.Raster({ canvas: cacheData.cvs });
                    r.position = new P.Point(cacheData.x, cacheData.y);

                    // --- HIGH DPI FIX ---
                    // Force the logical bounds to match the expected width.
                    // This prevents Paper.js from double-shrinking the cached frame.
                    var expectedWidth = cacheData.cvs.width / (cacheData.dpr || 1);
                    if (r.bounds.width && Math.abs(r.bounds.width - expectedWidth) > 0.01) {
                        r.scale(expectedWidth / r.bounds.width);
                    }

                    pl.addChild(r);
                } else {
                    VF.desPL(pl, data);

                    if (pl.children.length > 0) {
                        var dpr = window.devicePixelRatio || 1;

                        // --- CAMERA BAKE FIX ---
                        // Temporarily reset the camera to 1:1 project space so the 
                        // raster snapshot doesn't bake in the current zoom or pan!
                        var oldZoom = VF.view.zoom;
                        var oldCenter = VF.view.center.clone();

                        VF.view.zoom = 1;
                        VF.view.center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
                        VF.view.update(); // Force internal matrix update

                        var raster = pl.rasterize(72 * dpr, false);

                        // Restore the camera instantly
                        VF.view.zoom = oldZoom;
                        VF.view.center = oldCenter;
                        VF.view.update();
                        // -----------------------

                        var cacheCvs = document.createElement('canvas');
                        cacheCvs.width = raster.canvas.width;
                        cacheCvs.height = raster.canvas.height;
                        cacheCvs.getContext('2d').drawImage(raster.canvas, 0, 0);

                        l.cache[targetFrame] = {
                            cvs: cacheCvs,
                            x: raster.position.x,
                            y: raster.position.y,
                            dpr: dpr
                        };

                        pl.removeChildren();
                        pl.addChild(raster);
                    }
                }
            }
        } else if (l.type === 'image' && l.imgData) {
            pl.removeChildren();
            if (data || l.frames[0] !== undefined) {
                var imgR = new P.Raster({ source: l.imgData });
                if (data && data.matrix) {
                    imgR.matrix = new P.Matrix(data.matrix[0], data.matrix[1], data.matrix[2], data.matrix[3], data.matrix[4], data.matrix[5]);
                } else {
                    imgR.position = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
                }
                pl.addChild(imgR);
            }
        }
    };

})();