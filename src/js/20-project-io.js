(function () {
    "use strict";

    var S = VF.S;

    function getSaveState() {
        VF.saveFrame();
        S.layers.forEach(function (l) { if (l.cache) l.cache = {}; });

        return {
            canvas: S.canvas,
            tl: S.tl,
            layers: S.layers,
            activeId: S.activeId,
            nextId: S.nextId,
            cfg: S.cfg,
            onions: S.onions
        };
    }

    VF.doSave = function (isAutosave) {
        VF.saveFrame();
        var statePayload = getSaveState();
        var namePayload = null;

        if (!isAutosave) {
            var name = prompt("Enter project name:", "my_animation");
            if (!name) return;
            namePayload = name;
        }

        // TAURI IPC SAVE
        const { invoke } = window.__TAURI__.core;

        invoke('save_project', {
            state: statePayload,
            name: namePayload,
            isAutosave: isAutosave
        }).then(function (filename) {
            if (!isAutosave) VF.toast('Saved: ' + filename);
        }).catch(function (e) {
            console.error("Save failed", e);
            if (!isAutosave) VF.toast('Save failed');
        });
    };

    $('#btn-save').on('click', function () { VF.doSave(false); });

    $('#btn-new').on('click', function () {
        if (!confirm('Start new project? Unsaved changes will be lost.')) return;

        S.layers = [];
        for (var k in VF.pLayers) { VF.pLayers[k].remove(); delete VF.pLayers[k]; }

        S.tl.frame = 0;
        S.nextId = 1;
        VF.undoStack = []; VF.redoStack = [];

        VF.loadPrefs();

        $('#in-endframe').val(S.tl.max);
        $('#in-fps').val(S.tl.fps);

        VF.addLayer('Layer 1', 'vector');

        VF.resetView();
        VF.render();
        VF.uiTimeline();
        VF.toast('New project started');
    });

    $('#btn-load').on('click', function () {
        // TAURI IPC LIST PROJECTS
        const { invoke } = window.__TAURI__.core;

        invoke('list_projects').then(function (files) {
            var h = '';
            files.forEach(function (f) {
                var d = new Date(f.modified * 1000).toLocaleString();
                h += '<div class="proj-item" data-file="' + f.filename + '" style="padding:6px 8px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;color:var(--text-primary)">' +
                    '<span>' + f.filename + '</span>' +
                    '<span style="font-size:10px;color:var(--text-dim)">' + d + '</span>' +
                    '</div>';
            });
            $('#project-list').html(h || '<div style="padding:8px;color:var(--text-dim)">No projects found.</div>');
            $('#modal-load').show();

            $('.proj-item').on('click', function () {
                loadProjectFile($(this).data('file'));
                $('#modal-load').hide();
            });

            $('.proj-item').hover(
                function () { $(this).css('background', 'var(--bg-active)'); },
                function () { $(this).css('background', ''); }
            );
        }).catch(function (err) {
            console.error("Failed to list projects", err);
        });
    });

    $('#btn-close-load').on('click', function () { $('#modal-load').hide(); });

    function loadProjectFile(filename) {
        // TAURI IPC LOAD PROJECT
        const { invoke } = window.__TAURI__.core;

        invoke('load_project', { filename: filename }).then(function (d) {
            var state = d.state || d;
            S.canvas = state.canvas || S.canvas;
            S.tl = state.tl || S.tl;
            S.activeId = state.activeId || (state.layers && state.layers.length > 0 ? state.layers[0].id : 1);
            S.nextId = state.nextId || S.nextId;
            S.cfg = state.cfg || S.cfg;
            S.onions = state.onions || S.onions;

            $('#in-endframe').val(S.tl.max);
            $('#in-fps').val(S.tl.fps);
            $('#rng-brush').val(S.cfg.brushSize || 4);
            $('#v-brush').val(S.cfg.brushSize || 4);

            VF.restoreSnapshot(JSON.stringify(state.layers));
            VF.fitCanvas();
            VF.resetView();
            VF.toast('Loaded: ' + filename);
        }).catch(function (err) {
            VF.toast('Error loading project');
            console.error(err);
        });
    }

})();