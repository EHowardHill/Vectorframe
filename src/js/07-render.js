(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    /* Recursively tint every stroke/fill in an item tree */
    /* Updated to apply alpha directly to the colors to bypass the Group Opacity bug */
    function tintTree(item, tintColor, skinOpacity) {
        if (!item) return;

        if (item.className === 'Raster') {
            item.opacity = skinOpacity * 0.6; // Slightly dim images so they don't overpower vectors
            return;
        }

        if (item.strokeColor) {
            var sc = tintColor.clone();
            sc.alpha = skinOpacity; // Map the opacity exactly to the slider's 0-1 percentage
            item.strokeColor = sc;
        }
        if (item.fillColor) {
            var fc = tintColor.clone();
            fc.alpha = skinOpacity * 0.3; // Make fills more transparent than strokes to reduce clutter
            item.fillColor = fc;
        }

        if (item.children) {
            var kids = item.children.slice();
            kids.forEach(function (child) { tintTree(child, tintColor, skinOpacity); });
        }
    }

    VF.render = function () {
        var P = getP();
        var f = S.tl.frame;

        /* ── Flush dedicated Onion Skin layers ── */
        VF.onionLayerBg.removeChildren();
        VF.onionLayerFg.removeChildren();

        var sorted = [].concat(S.layers).sort(function (a, b) { return a.z - b.z; });
        sorted.forEach(function (l, i) {
            /* Ensure layer has all settings (safe for old projects) */
            if (VF.ensureLayerSettings) VF.ensureLayerSettings(l);

            var pl = VF.pLayers[l.id]; if (!pl) return;
            pl.visible = l.vis;

            VF.loadFrame(l.id, f);

            // Prevent Paper.js Layer parallax bug by applying opacity to the Raster child
            if (l.type === 'image') {
                pl.opacity = 1;
                pl.children.forEach(function (c) { c.opacity = l.opacity; });
            } else {
                pl.opacity = l.opacity;
            }

            /* ── Apply blend mode ── */
            if (VF.applyBlendMode) VF.applyBlendMode(l, pl);

            // Keeps normal artwork perfectly sandwiched between the bg and fg Onion Layers
            if (i === 0) pl.insertAbove(VF.onionLayerBg);
            else pl.insertAbove(VF.pLayers[sorted[i - 1].id]);
        });

        /* ───────────────────────────────────────────────
                    ADVANCED ONION SKINNING
           ─────────────────────────────────────────────── */
        if (S.cfg.onion && !S.tl.playing) {

            var oldZoom = VF.view.zoom;
            var oldCenter = VF.view.center.clone();
            VF.view.zoom = 1;
            VF.view.center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
            VF.view.update();

            S.onions.forEach(function (skin) {
                var targetF = skin.rel ? f + skin.val : skin.val - 1;
                if (targetF < 0 || targetF >= S.tl.max || targetF === f) return;

                var isFuture = skin.rel ? skin.val > 0 : (skin.val - 1) > f;
                var tintColor = isFuture
                    ? new P.Color(0.2, 0.8, 0.2)  // Green
                    : new P.Color(0.2, 0.4, 1.0); // Blue

                var skinOpacity = skin.op / 100;

                S.layers.forEach(function (l) {
                    if (!l.vis) return;
                    if (S.cfg.onionIsolate && l.id !== S.activeId) return;

                    var res = VF.getResolvedFrame(l, targetF);
                    var curRes = VF.getResolvedFrame(l, f);

                    if (res && (!curRes || res.keyFrame !== curRes.keyFrame)) {
                        var d = res.data;
                        if (!d || (Array.isArray(d) && d.length === 0)) return;

                        var targetLayer = skin.top ? VF.onionLayerFg : VF.onionLayerBg;

                        var skinGroup = new P.Group();
                        targetLayer.addChild(skinGroup);

                        if (l.type === 'vector') {
                            d.forEach(function (j) {
                                try {
                                    var parsed = null;
                                    try { parsed = JSON.parse(j); } catch (_) { parsed = null; }

                                    if (parsed && parsed.__texStroke) {
                                        if (parsed.pressurePoints && parsed.pressurePoints.length > 1) {
                                            var tc = tintColor.clone();
                                            tc.alpha = skinOpacity;

                                            var pp = new P.Path({
                                                strokeColor: tc,
                                                strokeWidth: parsed.size || 2,
                                                strokeCap: 'round'
                                            });
                                            parsed.pressurePoints.forEach(function (p) {
                                                pp.add(new P.Point(p.x, p.y));
                                            });
                                            pp.simplify(5);
                                            skinGroup.addChild(pp);
                                        } else if (parsed.pathJSON) {
                                            var tempGroup = new P.Group({ insert: false });
                                            var guide = tempGroup.importJSON(parsed.pathJSON);
                                            if (guide) {
                                                guide.remove(); // detach from temp
                                                guide.visible = true;

                                                var tc2 = tintColor.clone();
                                                tc2.alpha = skinOpacity;

                                                guide.strokeColor = tc2;
                                                guide.strokeWidth = parsed.size || 2;
                                                guide.fillColor = null;
                                                skinGroup.addChild(guide);
                                            }
                                        }
                                    } else {
                                        var item = skinGroup.importJSON(j);
                                        if (item) tintTree(item, tintColor, skinOpacity);
                                    }
                                } catch (e) { }
                            });
                        } else if (l.type === 'image' && l.imgData) {
                            var imgR = new P.Raster({ source: l.imgData });
                            if (d.matrix) {
                                imgR.matrix = new P.Matrix(d.matrix[0], d.matrix[1], d.matrix[2], d.matrix[3], d.matrix[4], d.matrix[5]);
                            } else {
                                imgR.position = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
                            }
                            imgR.opacity = skinOpacity * 0.5;
                            skinGroup.addChild(imgR);
                        }
                    }
                });
            });

            VF.view.zoom = oldZoom;
            VF.view.center = oldCenter;
            VF.view.update();
        }

        /* ───────────────────────────────────────────────
                    SKETCH WOBBLE POST-PROCESS
           ─────────────────────────────────────────────── */
        if (VF.applyWobbleEffects) {
            VF.applyWobbleEffects(sorted, f);
        }

        /* ───────────────────────────────────────────────
                            GLOBAL GRAIN EFFECT
           ─────────────────────────────────────────────── */
        if (VF.grainGroup && VF.grainRaster && VF.grainClip) {
            if (S.cfg.grain) {
                VF.grainGroup.visible = true;
                VF.grainRaster.opacity = (S.cfg.grainAmt / 100) * 0.5;

                /* FIX: Only rebuild the clip rectangle when the canvas
                   size actually changes. Use insertChild(0, ...) to
                   guarantee the clip lands at index 0 (the mask slot). */
                var clipB = VF.grainClip.bounds;
                if (Math.abs(clipB.width - S.canvas.w) > 0.5 ||
                    Math.abs(clipB.height - S.canvas.h) > 0.5 ||
                    Math.abs(clipB.x) > 0.5 ||
                    Math.abs(clipB.y) > 0.5) {
                    VF.grainClip.remove();
                    var newClip = new P.Path.Rectangle({
                        point: [0, 0],
                        size: [S.canvas.w, S.canvas.h],
                        insert: false
                    });
                    VF.grainGroup.insertChild(0, newClip);
                    VF.grainClip = newClip;
                }

                // Reset matrix to identity so scaling doesn't compound infinitely
                VF.grainRaster.matrix = new P.Matrix();

                // Scale the grain so it covers the canvas + 60% padding
                var scaleX = (S.canvas.w * 1.6) / 1024;
                var scaleY = (S.canvas.h * 1.6) / 1024;
                VF.grainRaster.scale(Math.max(1, scaleX, scaleY));

                // Create a per-frame stable seed so the offset "boils"
                var rand = VF.seededRandom(f * 1234);

                // Shift randomly within the 60% padding bounds to hide edges
                var ox = (rand() - 0.5) * (S.canvas.w * 0.5);
                var oy = (rand() - 0.5) * (S.canvas.h * 0.5);

                VF.grainRaster.position = new P.Point(S.canvas.w / 2 + ox, S.canvas.h / 2 + oy);
            } else {
                VF.grainGroup.visible = false;
            }
        }

        if (VF.fxLayer) VF.fxLayer.bringToFront();
        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();

        VF.fgLayer.bringToFront();
        VF.drawBorder();
        VF.uiFrameDisp();
        VF.uiPlayhead();
    };

})();