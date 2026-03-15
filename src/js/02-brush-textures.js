(function () {
    "use strict";

    var S = VF.S, P;

    // P (paper) isn't available yet; lazy-bind on first call
    function getP() { if (!P) P = VF.P; return P; }

    /**
     * TEXTURE RIBBON RENDERER — Mask + Composite approach
     */
    VF.renderTextureRibbon = function (guidePath, texFilename, color, brushSize, extraData) {
        var P = getP();
        var tc = VF.getTintedCanvas(texFilename, color);
        if (!tc || guidePath.length < 0.5) return null;

        var texW = tc.width, texH = tc.height;
        var pathLen = guidePath.length;

        var texScale = brushSize / texH;
        var scaledW = texW * texScale;

        var seed = (extraData && extraData.seed) ? extraData.seed : (Date.now() ^ (pathLen * 1000) | 0);
        var rand = VF.seededRandom(seed);

        var pad = brushSize * 1.5 + 4;
        var b = guidePath.bounds;
        var x0 = b.x - pad, y0 = b.y - pad;
        var cw = Math.ceil(b.width + pad * 2);
        var ch = Math.ceil(b.height + pad * 2);

        // ── Canvas 1 (MASK) ──
        var maskCvs = document.createElement('canvas');
        maskCvs.width = Math.max(cw, 1);
        maskCvs.height = Math.max(ch, 1);
        var maskCtx = maskCvs.getContext('2d');

        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        maskCtx.lineWidth = brushSize;
        maskCtx.strokeStyle = '#fff';
        maskCtx.beginPath();

        var maskStep = Math.max(1, pathLen / 500);
        for (var d = 0; d <= pathLen; d += maskStep) {
            var pt = guidePath.getPointAt(Math.min(d, pathLen));
            if (!pt) continue;
            if (d === 0) maskCtx.moveTo(pt.x - x0, pt.y - y0);
            else maskCtx.lineTo(pt.x - x0, pt.y - y0);
        }
        var lastPt = guidePath.getPointAt(pathLen);
        if (lastPt) maskCtx.lineTo(lastPt.x - x0, lastPt.y - y0);
        maskCtx.stroke();

        // ── Canvas 2 (BLOTS) ──
        var tileCvs = document.createElement('canvas');
        tileCvs.width = maskCvs.width;
        tileCvs.height = maskCvs.height;
        var tileCtx = tileCvs.getContext('2d');
        tileCtx.imageSmoothingEnabled = (texScale > 0.5);

        var blotStep = Math.max(1, brushSize * 0.3);

        for (var d2 = 0; d2 <= pathLen; d2 += blotStep) {
            var clampD = Math.min(d2, pathLen);
            var pt2 = guidePath.getPointAt(clampD);
            if (!pt2) continue;

            var angle = rand() * Math.PI * 2;

            tileCtx.save();
            tileCtx.translate(pt2.x - x0, pt2.y - y0);
            tileCtx.rotate(angle);
            tileCtx.drawImage(tc, -scaledW / 2, -brushSize / 2, scaledW, brushSize);
            tileCtx.restore();
        }

        // ── Combine ──
        maskCtx.globalCompositeOperation = 'source-in';
        maskCtx.drawImage(tileCvs, 0, 0);

        var raster = new P.Raster({ canvas: maskCvs, insert: false });

        if (raster.bounds.width && Math.abs(raster.bounds.width - cw) > 0.01) {
            raster.scale(cw / raster.bounds.width);
        }

        raster.position = new P.Point(x0 + cw / 2, y0 + ch / 2);

        var group = new P.Group();
        group.data = {
            isTextureStroke: true,
            tex: texFilename,
            strokeCol: color,
            brushSize: brushSize,
            seed: seed
        };
        if (extraData) Object.assign(group.data, extraData);

        var guide = guidePath.clone({ insert: false });
        guide.visible = false;
        guide.data = { isGuide: true };
        group.addChild(guide);
        group.addChild(raster);

        guidePath.remove();
        return group;
    };

    /**
     * Pressure-mode texture ribbon — variable width version.
     */
    VF.renderPressureTextureRibbon = function (points, texFilename, color, brushSize, existingSeed) {
        var P = getP();
        var tc = VF.getTintedCanvas(texFilename, color);
        if (!tc || points.length < 2) return null;

        var texW = tc.width, texH = tc.height;

        var tempPath = new P.Path({ insert: false });
        points.forEach(function (p) { tempPath.add(new P.Point(p.point.x, p.point.y)); });

        // Post-stroke smoothing for Legacy Mode
        if (VF.wsPrefs && VF.wsPrefs.tabletMode === 'legacy') {
            tempPath.smooth({ type: 'continuous', factor: 0.4 });
        }

        tempPath.simplify(VF.smoothTol());

        var pathLen = tempPath.length;
        if (pathLen < 0.5) { tempPath.remove(); return null; }

        var seed = existingSeed || (Date.now() ^ (pathLen * 1000) | 0);
        var rand = VF.seededRandom(seed);

        var widths = points.map(function (p) { return p.width; });
        function getWidthAt(d) {
            var t = (d / pathLen) * (widths.length - 1);
            var i = Math.floor(t);
            var f = t - i;
            var w0 = widths[Math.min(i, widths.length - 1)];
            var w1 = widths[Math.min(i + 1, widths.length - 1)];
            return w0 + (w1 - w0) * f;
        }

        var maxW = Math.max.apply(null, widths.concat([brushSize]));
        var pad = maxW * 1.5 + 4;
        var b = tempPath.bounds;
        var x0 = b.x - pad, y0 = b.y - pad;
        var cw = Math.ceil(b.width + pad * 2);
        var ch = Math.ceil(b.height + pad * 2);

        // ── Canvas 1 (MASK) ──
        var maskCvs = document.createElement('canvas');
        maskCvs.width = Math.max(cw, 1);
        maskCvs.height = Math.max(ch, 1);
        var maskCtx = maskCvs.getContext('2d');

        maskCtx.fillStyle = '#fff';
        var maskStep = Math.max(0.5, maxW * 0.15);
        for (var d = 0; d <= pathLen; d += maskStep) {
            var pt = tempPath.getPointAt(Math.min(d, pathLen));
            if (!pt) continue;
            var w = getWidthAt(d);
            maskCtx.beginPath();
            maskCtx.arc(pt.x - x0, pt.y - y0, w / 2, 0, Math.PI * 2);
            maskCtx.fill();
        }
        var lpt = tempPath.getPointAt(pathLen);
        if (lpt) {
            var lw = getWidthAt(pathLen);
            maskCtx.beginPath();
            maskCtx.arc(lpt.x - x0, lpt.y - y0, lw / 2, 0, Math.PI * 2);
            maskCtx.fill();
        }

        // ── Canvas 2 (BLOTS) ──
        var tileCvs = document.createElement('canvas');
        tileCvs.width = maskCvs.width;
        tileCvs.height = maskCvs.height;
        var tileCtx = tileCvs.getContext('2d');

        var avgW = widths.reduce(function (a, v) { return a + v; }, 0) / widths.length;
        var texScale = avgW / texH;
        var scaledW = texW * texScale;
        tileCtx.imageSmoothingEnabled = (texScale > 0.5);

        var blotStep = Math.max(1, avgW * 0.3);
        for (var d2 = 0; d2 <= pathLen; d2 += blotStep) {
            var clampD = Math.min(d2, pathLen);
            var pt2 = tempPath.getPointAt(clampD);
            if (!pt2) continue;

            var angle = rand() * Math.PI * 2;
            var w2 = getWidthAt(clampD);

            tileCtx.save();
            tileCtx.translate(pt2.x - x0, pt2.y - y0);
            tileCtx.rotate(angle);
            tileCtx.drawImage(tc, -scaledW / 2, -w2 / 2, scaledW, w2);
            tileCtx.restore();
        }

        // ── Combine ──
        maskCtx.globalCompositeOperation = 'source-in';
        maskCtx.drawImage(tileCvs, 0, 0);

        var raster = new P.Raster({ canvas: maskCvs, insert: false });

        if (raster.bounds.width && Math.abs(raster.bounds.width - cw) > 0.01) {
            raster.scale(cw / raster.bounds.width);
        }

        raster.position = new P.Point(x0 + cw / 2, y0 + ch / 2);

        var group = new P.Group();
        group.data = {
            isTextureStroke: true,
            tex: texFilename,
            strokeCol: color,
            brushSize: brushSize,
            seed: seed,
            pressurePoints: points.map(function (p) {
                return {
                    x: p.point.x, y: p.point.y,
                    angle: p.angle, width: p.width
                };
            })
        };

        var guide = tempPath.clone({ insert: false });
        guide.visible = false;
        guide.data = { isGuide: true };
        group.addChild(guide);
        group.addChild(raster);

        tempPath.remove();
        return group;
    };

})();
