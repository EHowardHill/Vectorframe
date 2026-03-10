(function () {
    "use strict";

    var S = VF.S;

    /* ═══════════════════════════════════════════════════
       AUDIO STATE
       ═══════════════════════════════════════════════════ */
    VF.audio = {
        ctx: null,           // AudioContext
        buffer: null,        // Decoded AudioBuffer
        filename: null,      // Current audio filename
        waveformData: null,  // Float32Array of peak values for drawing
        source: null,        // Currently playing BufferSourceNode
        gainNode: null,      // Gain for volume control
        startTime: 0,        // AudioContext time when playback started
        startOffset: 0,      // Offset into buffer where playback started
        isPlaying: false,
        volume: 0.8
    };

    var A = VF.audio;

    /* ── Lazy-init AudioContext (must be triggered by user gesture) ── */
    function ensureCtx() {
        if (!A.ctx) {
            A.ctx = new (window.AudioContext || window.webkitAudioContext)();
            A.gainNode = A.ctx.createGain();
            A.gainNode.gain.value = A.volume;
            A.gainNode.connect(A.ctx.destination);
        }
        if (A.ctx.state === 'suspended') A.ctx.resume();
        return A.ctx;
    }

    /* ═══════════════════════════════════════════════════
       LOAD AUDIO FILE
       ═══════════════════════════════════════════════════ */
    VF.loadAudioFile = function (file) {
        ensureCtx();
        var reader = new FileReader();
        reader.onload = function (e) {
            A.ctx.decodeAudioData(e.target.result, function (decoded) {
                A.buffer = decoded;
                A.filename = file.name;
                VF.toast('Audio loaded: ' + file.name);
                buildWaveformData();
                VF.uiTimeline();
                updateAudioLabel();
            }, function (err) {
                VF.toast('Failed to decode audio');
                console.error('Audio decode error:', err);
            });
        };
        reader.readAsArrayBuffer(file);
    };

    /* Load from server (for project restore) */
    VF.loadAudioFromURL = function (url, filename) {
        ensureCtx();
        fetch(url)
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) { return A.ctx.decodeAudioData(buf); })
            .then(function (decoded) {
                A.buffer = decoded;
                A.filename = filename;
                buildWaveformData();
                VF.uiTimeline();
                updateAudioLabel();
            })
            .catch(function (err) {
                console.error('Audio load error:', err);
            });
    };

    function updateAudioLabel() {
        var el = document.getElementById('audio-label');
        if (el) {
            if (A.filename) {
                var dur = A.buffer ? A.buffer.duration.toFixed(1) + 's' : '';
                el.textContent = A.filename + ' (' + dur + ')';
                el.title = A.filename;
            } else {
                el.textContent = 'No audio';
            }
        }
    }

    /* ═══════════════════════════════════════════════════
       REMOVE AUDIO
       ═══════════════════════════════════════════════════ */
    VF.removeAudio = function () {
        stopAudio();
        A.buffer = null;
        A.filename = null;
        A.waveformData = null;

        fetch('/api/remove-audio', { method: 'POST' }).catch(function () { });

        VF.uiTimeline();
        updateAudioLabel();
        VF.toast('Audio removed');
    };

    /* ═══════════════════════════════════════════════════
       WAVEFORM DATA EXTRACTION
       ═══════════════════════════════════════════════════ */
    function buildWaveformData() {
        if (!A.buffer) { A.waveformData = null; return; }

        var totalFrames = S.tl.max;
        var fps = S.tl.fps;
        var sampleRate = A.buffer.sampleRate;
        var channelData = A.buffer.getChannelData(0);
        var peaks = new Float32Array(totalFrames);

        for (var f = 0; f < totalFrames; f++) {
            var tStart = f / fps;
            var tEnd = (f + 1) / fps;
            var sStart = Math.floor(tStart * sampleRate);
            var sEnd = Math.min(Math.floor(tEnd * sampleRate), channelData.length);

            var peak = 0;
            for (var s = sStart; s < sEnd; s++) {
                var abs = Math.abs(channelData[s]);
                if (abs > peak) peak = abs;
            }
            peaks[f] = peak;
        }

        A.waveformData = peaks;
    }

    /* Rebuild waveform data when fps/max changes */
    VF.rebuildWaveform = function () {
        buildWaveformData();
        VF.renderAudioWaveform();
    };

    /* ═══════════════════════════════════════════════════
       WAVEFORM CANVAS RENDERING
       ═══════════════════════════════════════════════════ */
    VF.renderAudioWaveform = function () {
        var canvas = document.getElementById('audio-waveform');
        if (!canvas) return;

        var totalFrames = S.tl.max;
        var cellW = 18;
        var height = 24;

        canvas.width = totalFrames * cellW;
        canvas.height = height;
        canvas.style.width = (totalFrames * cellW) + 'px';
        canvas.style.height = height + 'px';

        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!A.waveformData || A.waveformData.length === 0) {
            /* Draw a subtle "no audio" hint */
            ctx.fillStyle = 'rgba(128, 128, 128, 0.15)';
            ctx.fillRect(0, height / 2, canvas.width, 1);
            return;
        }

        var midY = height / 2;
        var maxBarH = height / 2 - 1;

        for (var f = 0; f < totalFrames; f++) {
            var peak = f < A.waveformData.length ? A.waveformData[f] : 0;
            var barH = peak * maxBarH;
            if (barH < 0.5) barH = 0.5;

            var x = f * cellW;
            var isCurrent = f === S.tl.frame;

            if (isCurrent) {
                ctx.fillStyle = 'rgba(74, 111, 255, 0.75)';
            } else if (peak > 0.6) {
                ctx.fillStyle = 'rgba(74, 111, 255, 0.45)';
            } else {
                ctx.fillStyle = 'rgba(74, 111, 255, 0.25)';
            }

            var barW = Math.max(2, cellW - 4);
            ctx.fillRect(x + (cellW - barW) / 2, midY - barH, barW, barH * 2);
        }

        /* Subtle cell grid */
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.06)';
        ctx.lineWidth = 0.5;
        for (var i = 0; i <= totalFrames; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellW, 0);
            ctx.lineTo(i * cellW, height);
            ctx.stroke();
        }
    };

    /* ═══════════════════════════════════════════════════
       FRAME-SNAP AUDIO PLAYBACK
       Plays a short audio snippet for the given frame.
       Used when navigating frame-by-frame for lip sync.
       ═══════════════════════════════════════════════════ */
    VF.playFrameAudio = function (frame) {
        if (!A.buffer) return;
        ensureCtx();

        stopAudio();

        var fps = S.tl.fps;
        var frameDuration = 1 / fps;
        var offset = frame / fps;

        if (offset >= A.buffer.duration) return;

        /* Play 1.5x frame duration so phonemes aren't cut off harshly */
        var duration = Math.min(frameDuration * 1.5, A.buffer.duration - offset);

        var source = A.ctx.createBufferSource();
        source.buffer = A.buffer;
        source.connect(A.gainNode);
        source.start(0, offset, duration);

        A.source = source;
        A.isPlaying = false;

        source.onended = function () {
            if (A.source === source) A.source = null;
        };
    };

    /* ═══════════════════════════════════════════════════
       CONTINUOUS PLAYBACK (synced with animation)
       Starts playing from the given frame position.
       ═══════════════════════════════════════════════════ */
    VF.startAudioPlayback = function (fromFrame) {
        if (!A.buffer) return;
        ensureCtx();

        stopAudio();

        var offset = fromFrame / S.tl.fps;
        if (offset >= A.buffer.duration) offset = 0;

        var source = A.ctx.createBufferSource();
        source.buffer = A.buffer;
        source.connect(A.gainNode);
        source.start(0, offset);

        A.source = source;
        A.isPlaying = true;
        A.startTime = A.ctx.currentTime;
        A.startOffset = offset;

        source.onended = function () {
            if (A.source === source) {
                A.source = null;
                A.isPlaying = false;
            }
        };
    };

    /* ═══════════════════════════════════════════════════
       STOP AUDIO
       ═══════════════════════════════════════════════════ */
    function stopAudio() {
        if (A.source) {
            try { A.source.stop(); } catch (e) { }
            A.source = null;
        }
        A.isPlaying = false;
    }
    VF.stopAudio = stopAudio;

    /* ═══════════════════════════════════════════════════
       VOLUME CONTROL
       ═══════════════════════════════════════════════════ */
    VF.setAudioVolume = function (v) {
        A.volume = Math.max(0, Math.min(1, v));
        if (A.gainNode) A.gainNode.gain.value = A.volume;
    };

    /* ═══════════════════════════════════════════════════
       UPLOAD AUDIO TO SERVER (for project persistence)
       ═══════════════════════════════════════════════════ */
    VF.uploadAudioToServer = function (file) {
        const { invoke } = window.__TAURI__.core;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (e) {
                // Strip the mime type header off the data URL to get raw base64
                var base64Data = e.target.result.split(',')[1];

                invoke('save_audio', { data: base64Data, filename: file.name })
                    .then(function (safeName) {
                        resolve({ success: true, filename: safeName });
                    })
                    .catch(function (err) {
                        reject(err);
                    });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };


    /* ═══════════════════════════════════════════════════
       REMOVE AUDIO
       ═══════════════════════════════════════════════════ */
    VF.removeAudio = function () {
        stopAudio();
        A.buffer = null;
        A.filename = null;
        A.waveformData = null;

        const { invoke } = window.__TAURI__.core;
        invoke('remove_audio').catch(function (e) { console.error("Audio removal failed", e); });

        VF.uiTimeline();
        updateAudioLabel();
        VF.toast('Audio removed');
    };


    /* ═══════════════════════════════════════════════════
       UI EVENT BINDINGS
       ═══════════════════════════════════════════════════ */
    $(document).ready(function () {

        /* Audio file input change */
        $('#audio-import').on('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;

            VF.loadAudioFile(file);

            VF.uploadAudioToServer(file).then(function (d) {
                if (d.success) console.log('Audio saved locally:', d.filename);
            }).catch(function (err) {
                console.error('Audio upload failed:', err);
            });

            $(this).val('');
        });

        /* Load audio button */
        $('#btn-load-audio').on('click', function () {
            $('#audio-import').trigger('click');
        });

        /* Remove audio button */
        $('#btn-remove-audio').on('click', function () {
            if (A.buffer && confirm('Remove audio track?')) {
                VF.removeAudio();
            }
        });

        /* Volume slider */
        $('#rng-audio-vol').on('input', function () {
            VF.setAudioVolume(+this.value / 100);
            $('#v-audio-vol').text(this.value + '%');
        });

        /* Hook into FPS changes to rebuild waveform */
        $('#in-fps').on('change.audio', function () {
            if (A.buffer) VF.rebuildWaveform();
        });

        /* Hook into end-frame changes to rebuild waveform */
        $('#in-endframe').on('change.audio', function () {
            if (A.buffer) VF.rebuildWaveform();
        });

        /* Try to load audio from backend on startup */
        if (window.__TAURI__) {
            const { invoke } = window.__TAURI__.core;

            invoke('get_current_audio').then(function (audioInfo) {
                if (audioInfo && audioInfo.filename && audioInfo.data) {
                    // Reconstruct Data URL to easily extract an ArrayBuffer using native fetch
                    var dataUrl = 'data:audio/mp3;base64,' + audioInfo.data;

                    fetch(dataUrl)
                        .then(function (res) { return res.arrayBuffer(); })
                        .then(function (buf) { return ensureCtx().decodeAudioData(buf); })
                        .then(function (decoded) {
                            A.buffer = decoded;
                            A.filename = audioInfo.filename;
                            if (typeof buildWaveformData !== 'undefined') buildWaveformData();
                            VF.uiTimeline();
                            updateAudioLabel();
                        })
                        .catch(function (err) {
                            console.error("Error decoding loaded audio:", err);
                        });
                }
            }).catch(function (err) {
                console.log("No current audio found", err);
            });
        }
    });

})();