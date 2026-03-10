(function () {
    "use strict";

    var S = VF.S, P;
    function getP() { if (!P) P = VF.P; return P; }

    /* Temp Layers created for onion skins — cleaned up each render */
    VF._onionTempLayers = [];

    /* Recursively tint every stroke/fill in an item tree */
    function tintTree(item, tintColor, layerOpacity) {
        if (!item) return;

        /* Skip rasters (texture bitmaps) — we don't tint those for
           onion skins; the guide path underneath provides the outline */
        if (item.className === 'Raster') {
            item.visible = false;
            return;
        }

        if (item.strokeColor) {
            var sc = tintColor.clone();
            sc.alpha = tintColor.alpha * layerOpacity;
            item.strokeColor = sc;
        }
        if (item.fillColor) {
            var fc = tintColor.clone();
            fc.alpha = 0.12 * layerOpacity; // Scale the base fill alpha
            item.fillColor = fc;
        }

        if (item.children) {
            var kids = item.children.slice();
            kids.forEach(function (child) { tintTree(child, tintColor, layerOpacity); });
        }
    }

    VF.render = function () {
        var P = getP();
        var f = S.tl.frame;

        /* ── Clean up previous onion temp Layers ── */
        VF._onionTempLayers.forEach(function (tl) {
            tl.removeChildren();
            tl.remove();
        });
        VF._onionTempLayers = [];

        /* FIX 4: Don't activate system layers — just clear their children.
           Activating them here changes the active layer before content
           loading begins, which is unnecessary and fragile. */
        VF.onionLayerBg.removeChildren();
        VF.onionLayerFg.removeChildren();

        var sorted = [].concat(S.layers).sort(function (a, b) { return a.z - b.z; });
        sorted.forEach(function (l, i) {
            var pl = VF.pLayers[l.id]; if (!pl) return;
            pl.visible = l.vis;
            pl.opacity = l.opacity;
            VF.loadFrame(l.id, f);

            if (i === 0) pl.insertAbove(VF.onionLayerBg);
            else pl.insertAbove(VF.pLayers[sorted[i - 1].id]);
        });

        /* ───────────────────────────────────────────────
                   ADVANCED ONION SKINNING
                   ─────────────────────────────────────────────── */
        if (S.cfg.onion && !S.tl.playing) {

            /* ── THE CAMERA BAKE FIX ──
               Instantly snap the camera to 1:1 project space so Paper.js 
               doesn't bake the current zoom/pan into the generated items. */
            var oldZoom = VF.view.zoom;
            var oldCenter = VF.view.center.clone();
            VF.view.zoom = 1;
            VF.view.center = new P.Point(S.canvas.w / 2, S.canvas.h / 2);
            VF.view.update(); // Force internal matrix update

            /* Identify the bottom-most and top-most content layers
               for positioning onion layers in the stack */
            var firstContentPL = sorted.length > 0 ? VF.pLayers[sorted[0].id] : null;
            var lastContentPL = sorted.length > 0 ? VF.pLayers[sorted[sorted.length - 1].id] : null;

            var aboveAnchor = lastContentPL;
            var belowAnchor = firstContentPL;

            S.onions.forEach(function (skin) {
                var targetF = skin.rel ? f + skin.val : skin.val - 1;
                if (targetF < 0 || targetF >= S.tl.max || targetF === f) return;

                var isFuture = skin.rel ? skin.val > 0 : (skin.val - 1) > f;
                var tintColor = isFuture
                    ? new P.Color(.2, .6, .2, .6)
                    : new P.Color(.2, .2, .8, .6);

                S.layers.forEach(function (l) {
                    if (l.type !== 'vector' || !l.vis) return;
                    if (S.cfg.onionIsolate && l.id !== S.activeId) return;

                    var res = VF.getResolvedFrame(l, targetF);
                    var curRes = VF.getResolvedFrame(l, f);

                    if (res && (!curRes || res.keyFrame !== curRes.keyFrame)) {
                        var d = res.data;
                        if (!d || !Array.isArray(d) || d.length === 0) return;

                        var onionPL = new P.Layer();
                        onionPL.name = '_Onion_' + l.id + '_f' + targetF;

                        var layerOpacity = skin.op / 100;

                        VF._onionTempLayers.push(onionPL);
                        onionPL.activate();

                        d.forEach(function (j) {
                            try {
                                var parsed = null;
                                try { parsed = JSON.parse(j); } catch (_) { parsed = null; }

                                if (parsed && parsed.__texStroke) {
                                    if (parsed.pressurePoints && parsed.pressurePoints.length > 1) {
                                        var pp = new P.Path({
                                            strokeColor: tintColor,
                                            strokeWidth: parsed.size || 2,
                                            strokeCap: 'round',
                                            opacity: 0.6 * layerOpacity // ✅ Apply directly to Path
                                        });
                                        parsed.pressurePoints.forEach(function (p) {
                                            pp.add(new P.Point(p.x, p.y));
                                        });
                                        pp.simplify(5);
                                    } else if (parsed.pathJSON) {
                                        var guide = onionPL.importJSON(parsed.pathJSON);
                                        if (guide) {
                                            guide.visible = true;
                                            guide.strokeColor = tintColor;
                                            guide.strokeWidth = parsed.size || 2;
                                            guide.fillColor = null;
                                            guide.opacity = 0.6 * layerOpacity; // ✅ Apply directly to Path
                                        }
                                    }
                                } else {
                                    var item = onionPL.importJSON(j);
                                    if (item) {
                                        tintTree(item, tintColor, layerOpacity); // ✅ Pass opacity down to standard items
                                    }
                                }
                            } catch (e) { }
                        });

                        if (skin.top) {
                            if (aboveAnchor) {
                                onionPL.insertAbove(aboveAnchor);
                                aboveAnchor = onionPL;
                            }
                        } else {
                            if (belowAnchor) {
                                onionPL.insertBelow(belowAnchor);
                                belowAnchor = onionPL;
                            }
                        }
                    }
                });
            });

            /* ── RESTORE CAMERA ──
               Put the camera back exactly where the user had it. */
            VF.view.zoom = oldZoom;
            VF.view.center = oldCenter;
            VF.view.update();
        }

        if (VF.pLayers[S.activeId]) VF.pLayers[S.activeId].activate();

        VF.fgLayer.bringToFront();
        VF.drawBorder();
        VF.uiFrameDisp();
        VF.uiPlayhead();
    };

})();