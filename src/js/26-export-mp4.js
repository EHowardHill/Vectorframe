(function () {
    "use strict";

    var S = VF.S;

    VF.exportMP4 = async function () {
        if (!window.__TAURI__) {
            VF.toast("MP4 Export requires the Tauri desktop environment.");
            return;
        }

        const { invoke } = window.__TAURI__.core;
        const { save } = window.__TAURI__.dialog;

        // 1. Prompt for save location BEFORE starting the heavy render process
        let outputPath = null;
        try {
            outputPath = await save({
                title: 'Export Animation as MP4',
                defaultPath: 'animation.mp4',
                filters: [{ name: 'Video', extensions: ['mp4'] }]
            });
        } catch (err) {
            console.error("Dialog error:", err);
            return;
        }

        if (!outputPath) return; // User canceled the dialog

        VF.toast("Starting MP4 export...");
        let $btn = $('#btn-export-mp4');
        let originalBtnText = $btn.text();
        $btn.prop('disabled', true).text('Preparing...');

        // Save current state and clear UI selections
        VF.saveFrame(true);
        VF.clearHandles();

        // Store original view state so we can restore it later
        var originalFrame = S.tl.frame;
        var originalZoom = VF.view.zoom;
        var originalCenter = VF.view.center.clone();

        // Hide system layers (canvas borders, onion skins, etc.)
        var borderRect = VF.getBorderRect();
        var borderOutline = VF.getBorderOutline();
        if (borderRect) borderRect.visible = false;
        if (borderOutline) borderOutline.visible = false;
        VF.onionLayerBg.visible = false;
        VF.onionLayerFg.visible = false;
        VF.fgLayer.visible = false;

        // Reset camera to exactly 1:1 for rendering
        VF.view.viewSize = new VF.P.Size(S.canvas.w, S.canvas.h);
        VF.view.zoom = 1;
        VF.view.center = new VF.P.Point(S.canvas.w / 2, S.canvas.h / 2);

        try {
            // 2. Start an MP4 session in Rust
            let sessionId = await invoke('mp4_start');

            // Create an off-screen canvas to copy the exact resolution
            var ec = document.createElement('canvas');
            ec.width = S.canvas.w;
            ec.height = S.canvas.h;
            var ectx = ec.getContext('2d');

            // Set global flag so `04-serialization.js` forces full vector deserialization 
            // for maximum quality, ignoring the low-res raster cache.
            VF._exporting = true;

            // 3. Loop through every frame
            for (let i = 0; i < S.tl.max; i++) {
                S.tl.frame = i;
                VF.render();       // Load items for this frame
                VF.view.update();  // Force Paper.js to draw it

                // Clear export canvas and paint background
                ectx.clearRect(0, 0, ec.width, ec.height);
                // Video doesn't support alpha. If canvas is transparent, force white. Otherwise use their chosen color.
                var mp4Bg = (VF.wsPrefs && !VF.wsPrefs.canvasBgTransparent) ? VF.wsPrefs.canvasBgColor : '#ffffff';
                ectx.fillStyle = mp4Bg;
                ectx.fillRect(0, 0, ec.width, ec.height);

                // Draw the Paper.js canvas onto our export canvas
                ectx.drawImage(VF.cvs, 0, 0, VF.cvs.width, VF.cvs.height, 0, 0, S.canvas.w, S.canvas.h);

                // Extract base64 data URL
                let dataUrl = ec.toDataURL('image/png');

                // Send the frame to Rust to save in the temp directory
                await invoke('mp4_frame', {
                    sessionId: sessionId,
                    frameIndex: i,
                    image: dataUrl
                });

                // Update UI progress
                $btn.text(`Exporting ${i + 1} / ${S.tl.max}`);
            }

            VF._exporting = false; // Turn off high-res forced render
            $btn.text('Encoding Video...');

            // 4. Trigger FFmpeg rendering in Rust
            let includeAudio = !!(VF.audio && VF.audio.filename);

            await invoke('mp4_render', {
                sessionId: sessionId,
                fps: S.tl.fps,
                includeAudio: includeAudio,
                totalFrames: S.tl.max,
                outputPath: outputPath
            });

            VF.toast("🎬 MP4 Exported Successfully!");
        } catch (err) {
            console.error("Export failed:", err);
            VF.toast("MP4 Export Failed: " + err);
        } finally {
            // 5. Restore original state and UI
            VF._exporting = false;

            if (borderRect) borderRect.visible = true;
            if (borderOutline) borderOutline.visible = true;
            VF.onionLayerBg.visible = true;
            VF.onionLayerFg.visible = true;
            VF.fgLayer.visible = true;

            S.tl.frame = originalFrame;
            VF.fitCanvas();
            VF.view.zoom = originalZoom;
            VF.view.center = originalCenter;
            VF.render();
            VF.uiTimeline();

            $btn.prop('disabled', false).html('<i class="fa-solid fa-clapperboard"></i> Export MP4');
        }
    };

    // Bind the event
    $(document).ready(function () {
        // Ensure we unbind any previous handlers to prevent double-firing
        $('#btn-export-mp4').off('click').on('click', VF.exportMP4);
    });

})();