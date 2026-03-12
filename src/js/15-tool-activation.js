// ./src/js/15-tool-activation.js

(function () {
    "use strict";

    var S = VF.S;
    var cvs = VF.cvs;

    VF.setTool = function (t) {
        var prevTool = S.tool;
        S.tool = t;

        /* Reset to object mode when leaving select-family tools */
        var isSelectFamily = ['select', 'lasso', 'translate', 'rotate', 'scale'];
        if (isSelectFamily.indexOf(t) === -1) {
            VF.selectMode = 'object';

            /* FIX: Only clear selection if we're actually changing away from
               a select-family tool. Don't clear if we're just switching between
               non-selection tools (e.g. brush → eraser) as that would lose
               the last selection context for when the user switches back. */
            if (isSelectFamily.indexOf(prevTool) !== -1) {
                VF.clearHandles();
                VF.selSegments = [];
            }
        }

        $('#left-tools .tb').removeClass('active');
        $('#left-tools .tb[data-tool="' + t + '"]').addClass('active');

        if (t === 'brush') VF.tBrush.activate();
        else if (t === 'select') VF.tSelect.activate();
        else if (t === 'lasso') VF.tLasso.activate();
        else if (t === 'eraser') VF.tEraser.activate();
        else if (t === 'fill') VF.tFill.activate();
        else if (t === 'hide-edge') VF.tHideEdge.activate();
        else if (['translate', 'rotate', 'scale'].includes(t)) VF.tXform.activate();
        else if (t === 'camera') VF.tCamera.activate();
        else if (['pan', 'zoom', 'rotate-view'].includes(t)) VF.tCam.activate();

        var cursorMap = { brush: 'crosshair', select: 'default', lasso: 'crosshair', eraser: 'crosshair', fill: 'crosshair', 'hide-edge': 'pointer', translate: 'move', rotate: 'grab', scale: 'nwse-resize', camera: 'default', pan: 'grab', zoom: 'zoom-in', 'rotate-view': 'alias' };

        if (VF.renderCameraOverlay) VF.renderCameraOverlay();
        if (VF.view) VF.view.update();
    };

})();