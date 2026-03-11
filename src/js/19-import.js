(function () {
    "use strict";

    VF.importImg = function () {
        var invoke = window.__TAURI__.core.invoke;
        var open = window.__TAURI__.dialog.open;

        open({
            title: 'Import Image',
            multiple: false,
            filters: [{
                name: 'Images',
                extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
            }]
        }).then(function (filePath) {
            if (!filePath) return; // User cancelled

            // Read the image file via Rust backend and get a data URL
            invoke('read_image_file', { path: filePath }).then(function (dataUrl) {
                // Extract a friendly name from the path
                var name = filePath.replace(/\\/g, '/').split('/').pop().replace(/\.\w+$/, '');

                var l = VF.addLayer(name, 'image');
                l.imgData = dataUrl;
                l.frames[0] = [];
                VF.render();
                VF.uiTimeline();
            }).catch(function (err) {
                VF.toast('Failed to import image: ' + err);
                console.error('Image import error:', err);
            });
        }).catch(function (err) {
            console.error('Dialog error:', err);
        });
    };

})();