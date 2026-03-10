(function () {
    "use strict";

    var cvs = VF.cvs;
    var P = VF.P;
    var view = VF.view;

    cvs.addEventListener('mousemove', function (e) {
        var rect = cvs.getBoundingClientRect();
        var vp = view.viewToProject(new P.Point(e.clientX - rect.left, e.clientY - rect.top));
        $('#cursor-info').text(Math.round(vp.x) + ', ' + Math.round(vp.y));
    });

})();

(function () {
    "use strict";

    var S = VF.S;

    function init() {
        VF.loadPrefs();

        // TAURI IPC LOAD BRUSHES
        if (window.__TAURI__) {
            const { invoke } = window.__TAURI__.core;

            // 1. Get the list of brush filenames from the Rust backend
            invoke('list_brushes').then(function (files) {
                var sel = $('#sel-tex');
                sel.empty();
                sel.append('<option value="none">N/A</option>');

                // 2. Iterate through each file
                files.forEach(function (f) {
                    // Add it to the dropdown menu
                    sel.append('<option value="' + f + '">' + f.replace('.png', '') + '</option>');

                    // 3. Fetch the actual PNG data as a base64 string
                    invoke('get_brush_data', { filename: f })
                        .then(function (base64Data) {
                            var img = new Image();
                            img.onload = function () {
                                VF.baseBrushes[f] = img;
                            };
                            // Reconstruct the image locally using a Data URL
                            img.src = 'data:image/png;base64,' + base64Data;
                        })
                        .catch(function (err) {
                            console.error("Failed to load brush data for " + f, err);
                        });
                });

                sel.val(S.cfg.tex || 'none');
            }).catch(function (err) {
                console.error("Error listing brushes:", err);
            });
        } else {
            console.warn("Tauri API not found. App must be run via Tauri desktop window.");
        }

        VF.addLayer('Layer 1', 'vector');
        VF.fitCanvas();
        VF.resetView();
        VF.uiTimeline();
        VF.render();
        VF.setTool('brush');
        VF.tBrush.activate();
        VF.toast('VectorFrame ready — draw with B, select with V');

        // Start Autosave Background Timer
        setInterval(function () { VF.doSave(true); }, 60000);
    }

    $(document).ready(init);

})();