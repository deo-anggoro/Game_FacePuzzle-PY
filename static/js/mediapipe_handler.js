/**
 * MediaPipe Hands Handler
 * Isolated module for hand tracking initialization and processing.
 * Includes hysteresis pinch detection and coordinate smoothing.
 */
class MediaPipeHandler {
    // Pinch thresholds with hysteresis — grab is tighter, release is looser
    static PINCH_GRAB_THRESHOLD = 0.09;
    static PINCH_RELEASE_THRESHOLD = 0.11;
    // Smoothing factor (0 = no smoothing, 1 = infinite lag). 0.45 is a good balance.
    static SMOOTH_ALPHA = 0.45;

    constructor(videoElement, onResultsCallback) {
        this.videoElement = videoElement;
        this.onResultsCallback = onResultsCallback;
        this.hands = null;
        this.camera = null;
        this.isRunning = false;
        this.maxHands = 2;

        // Internal state per hand for hysteresis and smoothing
        this._handState = {
            Left:  { pinching: false, smoothX: -1, smoothY: -1 },
            Right: { pinching: false, smoothX: -1, smoothY: -1 }
        };
    }

    /**
     * Initialize MediaPipe Hands model.
     */
    async init(maxHands = 2) {
        this.maxHands = maxHands;

        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: this.maxHands,
            modelComplexity: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.4,
            selfieMode: true
        });

        this.hands.onResults((results) => this._processResults(results));

        // Wait for model to load
        await this.hands.initialize();
        console.log('[MediaPipe] Hands model initialized');
    }

    /**
     * Start tracking hands from the video element.
     */
    startTracking() {
        if (this.isRunning) return;
        this.isRunning = true;

        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                if (this.isRunning && this.hands) {
                    await this.hands.send({ image: this.videoElement });
                }
            },
            width: 640,
            height: 480
        });
        this.camera.start();
        console.log('[MediaPipe] Tracking started');
    }

    /**
     * Stop tracking.
     */
    stopTracking() {
        this.isRunning = false;
        if (this.camera) {
            this.camera.stop();
            this.camera = null;
        }
        // Reset hand states
        for (const key in this._handState) {
            this._handState[key] = { pinching: false, smoothX: -1, smoothY: -1 };
        }
        console.log('[MediaPipe] Tracking stopped');
    }

    /**
     * Process raw MediaPipe results and extract useful data.
     */
    _processResults(results) {
        const handsData = [];

        if (results.multiHandLandmarks && results.multiHandedness) {
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i];

                const thumbTip = landmarks[4];
                const indexTip = landmarks[8];

                // With selfieMode, "Left" label = user's left hand
                const label = handedness.label; // 'Left' or 'Right'

                // Hysteresis-based pinch detection
                const isPinching = this._updatePinchState(label, thumbTip, indexTip);

                // Smoothed index finger tip coordinates
                const smoothed = this._smoothCoords(label, indexTip.x, indexTip.y);

                handsData.push({
                    label: label,
                    landmarks: landmarks,
                    indexTip: { x: smoothed.x, y: smoothed.y },
                    rawIndexTip: indexTip,
                    thumbTip: thumbTip,
                    isPinching: isPinching,
                    score: handedness.score
                });
            }
        }

        if (this.onResultsCallback) {
            this.onResultsCallback(handsData);
        }
    }

    /**
     * Hysteresis pinch detection — prevents flickering.
     * Requires a tighter distance to START pinching, and a looser distance to STOP.
     */
    _updatePinchState(label, thumbTip, indexTip) {
        const state = this._handState[label];
        if (!state) return false;

        const distance = this._pinchDistance(thumbTip, indexTip);

        if (state.pinching) {
            // Currently pinching — only release if distance exceeds the larger threshold
            if (distance > MediaPipeHandler.PINCH_RELEASE_THRESHOLD) {
                state.pinching = false;
            }
        } else {
            // Not pinching — only grab if distance is below the tighter threshold
            if (distance < MediaPipeHandler.PINCH_GRAB_THRESHOLD) {
                state.pinching = true;
            }
        }

        return state.pinching;
    }

    /**
     * Calculate distance between thumb tip and index tip.
     */
    _pinchDistance(thumbTip, indexTip) {
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dz = (thumbTip.z || 0) - (indexTip.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Exponential moving average smoothing for coordinates.
     * Reduces jitter while keeping responsiveness.
     */
    _smoothCoords(label, rawX, rawY) {
        const state = this._handState[label];
        if (!state) return { x: rawX, y: rawY };

        const alpha = MediaPipeHandler.SMOOTH_ALPHA;

        if (state.smoothX < 0) {
            // First frame — initialize directly
            state.smoothX = rawX;
            state.smoothY = rawY;
        } else {
            state.smoothX = alpha * state.smoothX + (1 - alpha) * rawX;
            state.smoothY = alpha * state.smoothY + (1 - alpha) * rawY;
        }

        return { x: state.smoothX, y: state.smoothY };
    }

    /**
     * Map normalized coordinates to canvas coordinates.
     */
    static mapToCanvas(normalizedX, normalizedY, canvasWidth, canvasHeight) {
        return {
            x: normalizedX * canvasWidth,
            y: normalizedY * canvasHeight
        };
    }

    /**
     * Draw a hand cursor indicator on a canvas context.
     */
    static drawCursor(ctx, x, y, isPinching, isHolding) {
        ctx.save();

        const color = isHolding ? '#00ff88' : (isPinching ? '#ffcc00' : '#00f0ff');
        const radius = isHolding ? 14 : (isPinching ? 18 : 22);

        // Outer ring
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = isHolding ? 3 : 2.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(x, y, isHolding ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Holding indicator — crosshair lines
        if (isHolding) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8);
                ctx.lineTo(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}

// Export for use in game.js
window.MediaPipeHandler = MediaPipeHandler;
