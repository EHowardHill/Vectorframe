(function () {
    "use strict";

    /* ═══════════════════════════════════════════════════
       ABOUT DIALOG
       ═══════════════════════════════════════════════════ */

    VF.showAbout = function () {
        /* Try to read app version from Tauri */
        var verEl = document.getElementById('about-version');
        if (verEl) {
            if (window.__TAURI__ && window.__TAURI__.app) {
                window.__TAURI__.app.getVersion().then(function (v) {
                    verEl.textContent = 'v' + v;
                }).catch(function () {
                    verEl.textContent = '';
                });
            } else {
                verEl.textContent = '';
            }
        }
        $('#modal-about').show();
    };

    $(document).ready(function () {
        /* Button in Workspace ribbon tab */
        $('#btn-about').on('click', VF.showAbout);

        /* Close button */
        $('#about-close').on('click', function () {
            $('#modal-about').hide();
        });

        /* Close on overlay click */
        $('#modal-about').on('click', function (e) {
            if (e.target === this) $(this).hide();
        });

        /* Close on Escape */
        $('#modal-about').on('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                $(this).hide();
            }
        });
    });

})();