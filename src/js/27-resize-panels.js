(function () {
    "use strict";

    /* ═══════════════════════════════════════════════════
       RESIZABLE PANELS
       Adds drag handles on the left, right, and bottom
       panel borders so the user can resize them.

       Handles are absolutely positioned over #app so they
       never participate in grid flow or disrupt layout.
       ═══════════════════════════════════════════════════ */

    var app = document.getElementById('app');

    /* ── Clamp limits ── */
    var LEFT_MIN = 60, LEFT_MAX = 300;
    var RIGHT_MIN = 120, RIGHT_MAX = 400;
    var BOT_MIN = 60, BOT_MAX = 400;

    /* ── Current sizes (synced with grid) ── */
    var leftW = 130;
    var rightW = 210;
    var botH = 130;

    /* ── Persist to localStorage ── */
    var STORAGE_KEY = 'vf_panel_sizes';

    function saveSizes() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                l: leftW, r: rightW, b: botH
            }));
        } catch (_) { }
    }

    function loadSizes() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var o = JSON.parse(raw);
                if (o.l) leftW = Math.max(LEFT_MIN, Math.min(LEFT_MAX, o.l));
                if (o.r) rightW = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, o.r));
                if (o.b) botH = Math.max(BOT_MIN, Math.min(BOT_MAX, o.b));
            }
        } catch (_) { }
    }

    function applyGrid() {
        app.style.gridTemplateColumns = leftW + 'px 1fr ' + rightW + 'px';
        app.style.gridTemplateRows = 'min-content 1fr ' + botH + 'px';
    }

    /* Keep #tl-labels width in sync with the left panel */
    function syncTimelineLabels() {
        var el = document.getElementById('tl-labels');
        if (el) el.style.width = leftW + 'px';
    }

    /* ── Position handles based on actual panel geometry ── */
    function positionHandles() {
        var leftTools = document.getElementById('left-tools');
        var rightPanel = document.getElementById('right-panel');
        var timelineBar = document.getElementById('timeline-bar');
        if (!leftTools || !rightPanel || !timelineBar) return;

        var appRect = app.getBoundingClientRect();

        /* Left handle: right edge of the tools panel */
        var ltRect = leftTools.getBoundingClientRect();
        hLeft.style.left = (ltRect.right - appRect.left - 2) + 'px';
        hLeft.style.top = (ltRect.top - appRect.top) + 'px';
        hLeft.style.height = ltRect.height + 'px';

        /* Right handle: left edge of the right panel */
        var rpRect = rightPanel.getBoundingClientRect();
        hRight.style.left = (rpRect.left - appRect.left - 2) + 'px';
        hRight.style.top = (rpRect.top - appRect.top) + 'px';
        hRight.style.height = rpRect.height + 'px';

        /* Bottom handle: top edge of the timeline */
        var tlRect = timelineBar.getBoundingClientRect();
        hBot.style.top = (tlRect.top - appRect.top - 2) + 'px';
        hBot.style.left = '0';
        hBot.style.width = appRect.width + 'px';
    }

    /* ── Create a handle element ── */
    function makeHandle(id, className) {
        var el = document.createElement('div');
        el.id = id;
        el.className = 'resize-handle ' + className;
        app.appendChild(el);
        return el;
    }

    var hLeft = makeHandle('resize-left', 'resize-v');
    var hRight = makeHandle('resize-right', 'resize-v');
    var hBot = makeHandle('resize-bottom', 'resize-h');

    /* ── Apply all layout updates ── */
    function applyAll() {
        applyGrid();
        syncTimelineLabels();
        /* Defer positioning one frame so the grid has time to reflow */
        requestAnimationFrame(positionHandles);
    }

    /* ── Generic drag engine ── */
    function enableDrag(handle, onMove) {
        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            handle.setPointerCapture(e.pointerId);

            var startX = e.clientX, startY = e.clientY;
            var startLeft = leftW, startRight = rightW, startBot = botH;

            function move(ev) {
                var dx = ev.clientX - startX;
                var dy = ev.clientY - startY;
                onMove(dx, dy, startLeft, startRight, startBot);
                applyAll();
                if (VF.fitCanvas) VF.fitCanvas();
            }

            function up(ev) {
                handle.releasePointerCapture(ev.pointerId);
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', up);
                handle.removeEventListener('pointercancel', up);
                saveSizes();
                requestAnimationFrame(positionHandles);
            }

            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
            handle.addEventListener('pointercancel', up);
        });
    }

    enableDrag(hLeft, function (dx, _dy, sL) {
        leftW = Math.max(LEFT_MIN, Math.min(LEFT_MAX, sL + dx));
    });

    enableDrag(hRight, function (dx, _dy, _sL, sR) {
        rightW = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, sR - dx));
    });

    enableDrag(hBot, function (_dx, dy, _sL, _sR, sB) {
        botH = Math.max(BOT_MIN, Math.min(BOT_MAX, sB - dy));
    });

    /* ── Reposition handles on window resize ── */
    window.addEventListener('resize', function () {
        requestAnimationFrame(positionHandles);
    });

    /* ── Also reposition when ribbon tabs switch (changes top-bar height) ── */
    $(document).on('click', '.ribbon-tab', function () {
        setTimeout(positionHandles, 50);
    });

    /* ── Init ── */
    loadSizes();
    applyAll();

    $(document).ready(function () {
        applyAll();
        setTimeout(function () {
            if (VF.fitCanvas) VF.fitCanvas();
            positionHandles();
        }, 80);
    });

})();