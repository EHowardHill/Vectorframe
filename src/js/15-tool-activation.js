(function () {
    "use strict";

    var S = VF.S;
    var cvs = VF.cvs;

    VF.setTool = function (t) {
        S.tool = t;

        /* Reset to object mode when leaving select-family tools */
        if (!['select', 'lasso', 'translate', 'rotate', 'scale'].includes(t)) {
            VF.selectMode = 'object';
            VF.clearHandles();
            VF.selSegments = [];
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
        else if (['pan', 'zoom'].includes(t)) VF.tCam.activate();

        var cursorMap = { brush: 'crosshair', select: 'default', lasso: 'crosshair', eraser: 'crosshair', fill: 'crosshair', 'hide-edge': 'pointer', translate: 'move', rotate: 'grab', scale: 'nwse-resize', pan: 'grab', zoom: 'zoom-in' };
        cvs.style.cursor = cursorMap[t] || 'default';
    };

})();