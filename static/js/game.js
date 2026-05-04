/**
 * Face Puzzle — Core Game Engine
 * Manages: Camera capture, puzzle slicing, hand tracking input, timer, scoring, 2P split screen.
 */

/* ===== SOUND MANAGER ===== */
class SoundManager {
    constructor() {
        this.ctx = null;
    }
    _ensure() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    _tone(freq, dur, type = 'sine', vol = 0.25) {
        this._ensure();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.frequency.value = freq; o.type = type;
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        o.start(); o.stop(this.ctx.currentTime + dur);
    }
    grab() { this._tone(400, 0.1, 'sine', 0.2); }
    drop() { this._tone(600, 0.06, 'square', 0.15); }
    snap() { this._tone(880, 0.25, 'sine', 0.3); }
    capture() { this._tone(1200, 0.15, 'sine', 0.2); }
    countdown(n) { this._tone(n === 0 ? 880 : 440, 0.2, 'sine', 0.3); }
    win() {
        [523,659,784,1047].forEach((f,i) => {
            setTimeout(() => this._tone(f, 0.3, 'sine', 0.3), i * 150);
        });
    }
}

/* ===== PUZZLE PIECE ===== */
class PuzzlePiece {
    constructor(id, row, col, srcX, srcY, w, h) {
        this.id = id;
        this.correctRow = row;
        this.correctCol = col;
        this.currentRow = row;
        this.currentCol = col;
        this.srcX = srcX;
        this.srcY = srcY;
        this.w = w;
        this.h = h;
        this.grabbed = false;
        this.drawX = 0;
        this.drawY = 0;
    }
    isCorrect() { return this.currentRow === this.correctRow && this.currentCol === this.correctCol; }
}

/* ===== PUZZLE BOARD ===== */
class PuzzleBoard {
    constructor(canvas, handCanvas, gridSize) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.handCanvas = handCanvas;
        this.handCtx = handCanvas.getContext('2d');
        this.gridSize = gridSize;
        this.pieces = [];
        this.sourceImage = null;
        this.cellW = 0;
        this.cellH = 0;
        this.grabbedPiece = null;
        this.solved = false;
        this.cursorX = -1;
        this.cursorY = -1;
        this.isPinching = false;
        this.isHolding = false;
    }

    setSize(w, h) {
        this.canvas.width = w; this.canvas.height = h;
        this.handCanvas.width = w; this.handCanvas.height = h;
        this.cellW = w / this.gridSize;
        this.cellH = h / this.gridSize;
    }

    generatePieces(sourceImage) {
        this.sourceImage = sourceImage;
        this.pieces = [];
        const sw = sourceImage.width / this.gridSize;
        const sh = sourceImage.height / this.gridSize;
        let id = 0;
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                this.pieces.push(new PuzzlePiece(id++, r, c, c * sw, r * sh, sw, sh));
            }
        }
    }

    scramble() {
        const positions = [];
        for (let r = 0; r < this.gridSize; r++)
            for (let c = 0; c < this.gridSize; c++) positions.push({ r, c });
        // Fisher-Yates
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        // Ensure at least some pieces are misplaced
        let allCorrect = positions.every((p, idx) =>
            p.r === Math.floor(idx / this.gridSize) && p.c === idx % this.gridSize
        );
        if (allCorrect && positions.length > 1) {
            [positions[0], positions[1]] = [positions[1], positions[0]];
        }
        this.pieces.forEach((piece, idx) => {
            piece.currentRow = positions[idx].r;
            piece.currentCol = positions[idx].c;
        });
        this.solved = false;
    }

    render() {
        const ctx = this.ctx;
        const cw = this.cellW, ch = this.cellH;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(0,240,255,0.12)';
        ctx.lineWidth = 1;
        for (let i = 1; i < this.gridSize; i++) {
            ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, this.canvas.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * ch); ctx.lineTo(this.canvas.width, i * ch); ctx.stroke();
        }

        // Draw pieces (non-grabbed first)
        for (const p of this.pieces) {
            if (p.grabbed) continue;
            const dx = p.currentCol * cw, dy = p.currentRow * ch;
            ctx.drawImage(this.sourceImage, p.srcX, p.srcY, p.w, p.h, dx, dy, cw, ch);
            // Border
            ctx.strokeStyle = p.isCorrect() ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.strokeRect(dx, dy, cw, ch);
        }

        // Draw grabbed piece on top
        if (this.grabbedPiece) {
            const p = this.grabbedPiece;
            const dx = p.drawX - cw / 2, dy = p.drawY - ch / 2;
            ctx.save();
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 20;
            ctx.drawImage(this.sourceImage, p.srcX, p.srcY, p.w, p.h, dx, dy, cw, ch);
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(dx, dy, cw, ch);
            ctx.restore();
        }

        // Draw hand overlay
        this.handCtx.clearRect(0, 0, this.handCanvas.width, this.handCanvas.height);
        if (this.cursorX >= 0 && this.cursorY >= 0) {
            MediaPipeHandler.drawCursor(this.handCtx, this.cursorX, this.cursorY, this.isPinching, this.isHolding);
        }
    }

    getPieceAt(x, y) {
        const col = Math.floor(x / this.cellW);
        const row = Math.floor(y / this.cellH);
        return this.pieces.find(p => !p.grabbed && p.currentRow === row && p.currentCol === col) || null;
    }

    tryGrab(x, y) {
        if (this.grabbedPiece) return false;
        const piece = this.getPieceAt(x, y);
        if (piece) {
            piece.grabbed = true;
            piece.drawX = x;
            piece.drawY = y;
            this.grabbedPiece = piece;
            return true;
        }
        return false;
    }

    moveGrabbed(x, y) {
        if (this.grabbedPiece) {
            // Lerp for smooth piece following (reduces visual jitter)
            const lerp = 0.55;
            this.grabbedPiece.drawX += (x - this.grabbedPiece.drawX) * lerp;
            this.grabbedPiece.drawY += (y - this.grabbedPiece.drawY) * lerp;
        }
    }

    tryDrop() {
        if (!this.grabbedPiece) return false;
        const p = this.grabbedPiece;
        const col = Math.round((p.drawX - this.cellW / 2) / this.cellW);
        const row = Math.round((p.drawY - this.cellH / 2) / this.cellH);
        const clampedRow = Math.max(0, Math.min(this.gridSize - 1, row));
        const clampedCol = Math.max(0, Math.min(this.gridSize - 1, col));

        // Check if target cell is occupied
        const occupant = this.pieces.find(op => !op.grabbed && op.currentRow === clampedRow && op.currentCol === clampedCol);
        if (occupant) {
            // Swap positions
            occupant.currentRow = p.currentRow;
            occupant.currentCol = p.currentCol;
        }
        p.currentRow = clampedRow;
        p.currentCol = clampedCol;
        p.grabbed = false;
        this.grabbedPiece = null;

        this.solved = this.pieces.every(pc => pc.isCorrect());
        return p.isCorrect();
    }

    updateCursor(x, y, pinching, holding) {
        this.cursorX = x;
        this.cursorY = y;
        this.isPinching = pinching;
        this.isHolding = holding || false;
    }
}

/* ===== GAME ENGINE ===== */
class FacePuzzleGame {
    constructor(config) {
        this.mode = config.mode;
        this.totalRounds = config.rounds;
        this.gridSize = config.gridSize;
        this.player1Name = config.player1;
        this.player2Name = config.player2;

        this.currentRound = 0;
        this.sessionId = null;
        this.sourceImage = null;     // 1P image
        this.sourceImageP1 = null;   // 2P player 1 image
        this.sourceImageP2 = null;   // 2P player 2 image
        this._captureDataUrl1 = null; // for reference display
        this._captureDataUrl2 = null;
        this.cameraStream = null;

        this.sound = new SoundManager();
        this.mpHandler = null;

        // Timer state
        this.timerStart = 0;
        this.timerRunning = false;
        this.timerP1 = 0;
        this.timerP2 = 0;
        this.p1Solved = false;
        this.p2Solved = false;

        // Round results
        this.roundResults = [];

        // Boards
        this.board1 = null;
        this.board2 = null;

        // Previous pinch state per hand
        this.prevPinch = { Left: false, Right: false };

        // Grace period: count consecutive non-pinch frames before actually releasing.
        this._releaseFrames = { Left: 0, Right: 0 };
        this._RELEASE_GRACE = 3; // require 3 consecutive non-pinch frames to release

        this._rafId = null;
        this._init();
    }

    async _init() {
        // Back button
        document.getElementById('btn-back').addEventListener('click', () => {
            if (confirm('Return to menu?')) window.location.href = '/';
        });

        // Create session
        await this._createSession();

        // Start capture phase
        this._showPhase('phase-capture');
        await this._initCamera();

        // Set initial capture label for 2P
        if (this.mode === '2p') {
            document.getElementById('capture-title').textContent = `📸 ${this.player1Name}, Capture Your Face`;
            document.getElementById('capture-desc').textContent = 'Player 1 — position your face and tap capture';
        }

        // Capture button
        document.getElementById('btn-capture').addEventListener('click', () => this._onCapture());

        // Next round / play again
        document.getElementById('btn-next-round').addEventListener('click', () => this._startRound());
        document.getElementById('btn-play-again').addEventListener('click', () => window.location.reload());
    }

    /* ----- Phase Management ----- */
    _showPhase(id) {
        document.querySelectorAll('.phase').forEach(el => el.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    /* ----- Camera ----- */
    async _initCamera() {
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            const vid = document.getElementById('camera-feed');
            vid.srcObject = this.cameraStream;
            await vid.play();
        } catch (e) {
            alert('Camera access is required to play Face Puzzle. Please allow camera access and refresh.');
            console.error(e);
        }
    }

    _captureFrame() {
        const vid = document.getElementById('camera-feed');
        const offCanvas = document.createElement('canvas');
        const size = Math.min(vid.videoWidth, vid.videoHeight);
        offCanvas.width = size;
        offCanvas.height = size;
        const ctx = offCanvas.getContext('2d');
        const sx = (vid.videoWidth - size) / 2;
        const sy = (vid.videoHeight - size) / 2;
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(vid, sx, sy, size, size, 0, 0, size, size);
        return offCanvas.toDataURL('image/jpeg', 0.9);
    }

    _onCapture() {
        this.sound.capture();
        const dataUrl = this._captureFrame();

        if (this.mode === '1p') {
            // Single player — one capture, then start
            this._captureDataUrl1 = dataUrl;
            const img = new Image();
            img.onload = () => {
                this.sourceImage = img;
                this._startCountdown();
            };
            img.src = dataUrl;
        } else {
            // 2P — capture for each player separately
            if (!this.sourceImageP1) {
                // First capture → Player 1
                this._captureDataUrl1 = dataUrl;
                const img = new Image();
                img.onload = () => {
                    this.sourceImageP1 = img;
                    // Prompt Player 2
                    document.getElementById('capture-title').textContent = `📸 ${this.player2Name}, Capture Your Face`;
                    document.getElementById('capture-desc').textContent = 'Player 2 — position your face and tap capture';
                };
                img.src = dataUrl;
            } else {
                // Second capture → Player 2, then start
                this._captureDataUrl2 = dataUrl;
                const img = new Image();
                img.onload = () => {
                    this.sourceImageP2 = img;
                    this._startCountdown();
                };
                img.src = dataUrl;
            }
        }
    }

    /* ----- Countdown ----- */
    _startCountdown() {
        this._showPhase('phase-countdown');
        let count = 3;
        const numEl = document.getElementById('countdown-number');
        numEl.textContent = count;
        this.sound.countdown(count);

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                numEl.textContent = count;
                this.sound.countdown(count);
            } else {
                clearInterval(interval);
                numEl.textContent = 'GO!';
                this.sound.countdown(0);
                setTimeout(() => this._startRound(), 400);
            }
        }, 800);
    }

    /* ----- Round Start ----- */
    async _startRound() {
        this.currentRound++;
        document.getElementById('hud-round').textContent = `${this.currentRound} / ${this.totalRounds}`;

        // Calculate puzzle canvas size
        const maxSize = Math.min(window.innerWidth - 40, window.innerHeight - 140);
        let canvasSize;

        if (this.mode === '1p') {
            canvasSize = Math.min(maxSize, 500);
            this._showPhase('phase-solve-1p');
            this._setupBoard1P(canvasSize);
        } else {
            canvasSize = Math.min(Math.floor((window.innerWidth - 60) / 2), 420);
            canvasSize = Math.min(canvasSize, window.innerHeight - 160);
            this._showPhase('phase-solve-2p');
            this._setupBoard2P(canvasSize);
        }

        // Setup MediaPipe for hand tracking
        await this._initHandTracking();

        // Reset solve state
        this.p1Solved = false;
        this.p2Solved = false;
        this.timerP1 = 0;
        this.timerP2 = 0;

        // Start timer
        this.timerStart = performance.now();
        this.timerRunning = true;
        this._gameLoop();
    }

    _setupBoard1P(size) {
        const c1 = document.getElementById('puzzle-canvas-1');
        const h1 = document.getElementById('hand-canvas-1');
        this.board1 = new PuzzleBoard(c1, h1, this.gridSize);
        this.board1.setSize(size, size);
        this.board1.generatePieces(this.sourceImage);
        this.board1.scramble();
        // Show reference photo
        const refImg = document.getElementById('ref-img-1');
        if (refImg && this._captureDataUrl1) refImg.src = this._captureDataUrl1;
    }

    _setupBoard2P(size) {
        const c1 = document.getElementById('puzzle-canvas-2p-1');
        const h1 = document.getElementById('hand-canvas-2p-1');
        const c2 = document.getElementById('puzzle-canvas-2p-2');
        const h2 = document.getElementById('hand-canvas-2p-2');
        this.board1 = new PuzzleBoard(c1, h1, this.gridSize);
        this.board2 = new PuzzleBoard(c2, h2, this.gridSize);
        this.board1.setSize(size, size);
        this.board2.setSize(size, size);
        // Each player gets their own captured face
        this.board1.generatePieces(this.sourceImageP1);
        this.board2.generatePieces(this.sourceImageP2);
        this.board1.scramble();
        this.board2.scramble();
        // Show reference photos
        const ref1 = document.getElementById('ref-img-2p-1');
        const ref2 = document.getElementById('ref-img-2p-2');
        if (ref1 && this._captureDataUrl1) ref1.src = this._captureDataUrl1;
        if (ref2 && this._captureDataUrl2) ref2.src = this._captureDataUrl2;
    }

    /* ----- Hand Tracking ----- */
    async _initHandTracking() {
        if (this.mpHandler) {
            this.mpHandler.stopTracking();
        }

        // Use mini camera for tracking
        const miniId = this.mode === '1p' ? 'camera-mini' : 'camera-mini-2p';
        const miniVid = document.getElementById(miniId);
        miniVid.srcObject = this.cameraStream;
        await miniVid.play();

        const maxHands = this.mode === '2p' ? 2 : 1;
        this.mpHandler = new MediaPipeHandler(miniVid, (hands) => this._onHandResults(hands));
        await this.mpHandler.init(maxHands);
        this.mpHandler.startTracking();
    }

    _onHandResults(handsData) {
        if (!this.timerRunning) return;

        if (this.mode === '1p') {
            this._processHandForBoard(handsData[0], this.board1);
        } else {
            // 2P: map by handedness
            for (const hand of handsData) {
                if (hand.label === 'Left') {
                    this._processHandForBoard(hand, this.board1);
                } else if (hand.label === 'Right') {
                    this._processHandForBoard(hand, this.board2);
                }
            }
            // Clear cursor if hand lost
            if (!handsData.find(h => h.label === 'Left') && this.board1) {
                this.board1.updateCursor(-1, -1, false);
            }
            if (!handsData.find(h => h.label === 'Right') && this.board2) {
                this.board2.updateCursor(-1, -1, false);
            }
        }
    }

    _processHandForBoard(handData, board) {
        if (!handData || !board || board.solved) return;

        const pos = MediaPipeHandler.mapToCanvas(
            handData.indexTip.x, handData.indexTip.y,
            board.canvas.width, board.canvas.height
        );

        const label = handData.label || 'Left';
        const nowPinching = handData.isPinching;
        const isHolding = !!board.grabbedPiece;

        board.updateCursor(pos.x, pos.y, nowPinching, isHolding);

        if (nowPinching && !this.prevPinch[label] && !board.grabbedPiece) {
            // ── GRAB: pinch just started & no piece held ──
            this._releaseFrames[label] = 0;
            if (board.tryGrab(pos.x, pos.y)) {
                this.sound.grab();
            }
        } else if (board.grabbedPiece) {
            // ── HOLDING a piece ──
            // Always move the piece to follow the hand (even during brief pinch loss)
            board.moveGrabbed(pos.x, pos.y);

            if (!nowPinching) {
                // Pinch lost — increment grace counter
                this._releaseFrames[label]++;
                if (this._releaseFrames[label] >= this._RELEASE_GRACE) {
                    // Enough frames without pinch — actually release
                    const correct = board.tryDrop();
                    if (correct) this.sound.snap();
                    else this.sound.drop();
                    this._releaseFrames[label] = 0;

                    if (board.solved) {
                        this._onBoardSolved(board);
                    }
                }
            } else {
                // Pinch is still active — reset the grace counter
                this._releaseFrames[label] = 0;
            }
        } else {
            // Not holding and not starting a new pinch — reset
            this._releaseFrames[label] = 0;
        }

        this.prevPinch[label] = nowPinching;
    }

    _onBoardSolved(board) {
        const elapsed = (performance.now() - this.timerStart) / 1000;
        this.sound.win();

        if (this.mode === '1p') {
            this.timerP1 = elapsed;
            this.p1Solved = true;
            this._endRound();
        } else {
            if (board === this.board1) {
                this.timerP1 = elapsed;
                this.p1Solved = true;
            } else {
                this.timerP2 = elapsed;
                this.p2Solved = true;
            }
            // End round when either solves (the other is slower)
            if (this.p1Solved || this.p2Solved) {
                // Give the other player a few seconds or end immediately
                this._endRound();
            }
        }
    }

    /* ----- Game Loop ----- */
    _gameLoop() {
        if (!this.timerRunning) return;

        const elapsed = (performance.now() - this.timerStart) / 1000;

        // Update HUD timer
        document.getElementById('hud-timer').textContent = this._formatTime(elapsed);

        // Update 2P individual timers
        if (this.mode === '2p') {
            const t1El = document.getElementById('p1-timer-2p');
            const t2El = document.getElementById('p2-timer-2p');
            if (t1El) t1El.textContent = this.p1Solved ? this._formatTime(this.timerP1) : this._formatTime(elapsed);
            if (t2El) t2El.textContent = this.p2Solved ? this._formatTime(this.timerP2) : this._formatTime(elapsed);
        }

        // Render boards
        if (this.board1) this.board1.render();
        if (this.board2) this.board2.render();

        this._rafId = requestAnimationFrame(() => this._gameLoop());
    }

    _formatTime(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        const ms = Math.floor((secs % 1) * 10);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
    }

    /* ----- Round End ----- */
    _endRound() {
        this.timerRunning = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this.mpHandler) this.mpHandler.stopTracking();

        let winner = null;
        if (this.mode === '2p') {
            if (this.p1Solved && !this.p2Solved) winner = 'p1';
            else if (this.p2Solved && !this.p1Solved) winner = 'p2';
            else if (this.p1Solved && this.p2Solved) winner = this.timerP1 <= this.timerP2 ? 'p1' : 'p2';
        }

        this.roundResults.push({
            round: this.currentRound,
            timeP1: this.timerP1,
            timeP2: this.timerP2,
            winner: winner
        });

        // Save round to API
        this._saveRound(this.currentRound, this.timerP1, this.timerP2, winner);

        // Show result
        setTimeout(() => this._showRoundResult(winner), 600);
    }

    _showRoundResult(winner) {
        const isLast = this.currentRound >= this.totalRounds;
        const statsEl = document.getElementById('result-stats');
        let statsHtml = '';

        if (this.mode === '1p') {
            statsHtml = `
                <div class="stat-row"><span class="stat-label">Time</span><span class="stat-value">${this._formatTime(this.timerP1)}</span></div>
                <div class="stat-row"><span class="stat-label">Round</span><span class="stat-value">${this.currentRound} / ${this.totalRounds}</span></div>`;
            document.getElementById('result-title').textContent = 'Puzzle Solved! 🎉';
        } else {
            const winnerName = winner === 'p1' ? this.player1Name : this.player2Name;
            document.getElementById('result-title').textContent = `${winnerName} Wins! 🎉`;
            statsHtml = `
                <div class="stat-row"><span class="stat-label">${this.player1Name}</span><span class="stat-value">${this.p1Solved ? this._formatTime(this.timerP1) : 'DNF'}</span></div>
                <div class="stat-row"><span class="stat-label">${this.player2Name}</span><span class="stat-value">${this.p2Solved ? this._formatTime(this.timerP2) : 'DNF'}</span></div>`;
        }
        statsEl.innerHTML = statsHtml;

        if (isLast) {
            document.getElementById('next-round-text').textContent = 'See Final Results';
            document.getElementById('btn-next-round').onclick = () => this._showFinalResult();
        } else {
            document.getElementById('next-round-text').textContent = 'Next Round →';
            document.getElementById('btn-next-round').onclick = () => {
                // Reset capture state for new round
                if (this.mode === '2p') {
                    this.sourceImageP1 = null;
                    this.sourceImageP2 = null;
                    document.getElementById('capture-title').textContent = `📸 ${this.player1Name}, Capture Your Face`;
                    document.getElementById('capture-desc').textContent = 'Player 1 — position your face and tap capture';
                } else {
                    this.sourceImage = null;
                    document.getElementById('capture-title').textContent = '📸 Capture Your Face';
                    document.getElementById('capture-desc').textContent = 'Position your face in front of the camera';
                }
                this._showPhase('phase-capture');
            };
        }

        this._showPhase('phase-result');
    }

    _showFinalResult() {
        const statsEl = document.getElementById('final-stats');
        let html = '';

        if (this.mode === '1p') {
            const totalTime = this.roundResults.reduce((s, r) => s + r.timeP1, 0);
            html = `
                <div class="stat-row"><span class="stat-label">Total Time</span><span class="stat-value">${this._formatTime(totalTime)}</span></div>
                <div class="stat-row"><span class="stat-label">Rounds</span><span class="stat-value">${this.totalRounds}</span></div>`;
            document.getElementById('final-title').textContent = '🏆 Game Complete!';
            this._saveLeaderboard(this.player1Name, '1p', totalTime, this.totalRounds, this.totalRounds);
        } else {
            const p1Wins = this.roundResults.filter(r => r.winner === 'p1').length;
            const p2Wins = this.roundResults.filter(r => r.winner === 'p2').length;
            const overallWinner = p1Wins >= p2Wins ? this.player1Name : this.player2Name;
            document.getElementById('final-title').textContent = `🏆 ${overallWinner} Wins!`;
            html = `
                <div class="stat-row"><span class="stat-label">${this.player1Name} Wins</span><span class="stat-value">${p1Wins}</span></div>
                <div class="stat-row"><span class="stat-label">${this.player2Name} Wins</span><span class="stat-value">${p2Wins}</span></div>`;
            const bestTime = Math.min(...this.roundResults.map(r => r.timeP1 || 999));
            this._saveLeaderboard(overallWinner, '2p', bestTime, Math.max(p1Wins, p2Wins), this.totalRounds);
        }
        statsEl.innerHTML = html;
        this._showPhase('phase-final');
    }

    /* ----- API Calls ----- */
    async _createSession() {
        try {
            const res = await fetch('/api/session/create/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    player_name_1: this.player1Name,
                    player_name_2: this.mode === '2p' ? this.player2Name : null,
                    player_mode: this.mode,
                    source_mode: 'camera',
                    total_rounds: this.totalRounds
                })
            });
            const data = await res.json();
            this.sessionId = data.session_id;
        } catch (e) { console.error('Session create failed:', e); }
    }

    async _saveRound(roundNum, timeP1, timeP2, winner) {
        try {
            await fetch('/api/round/save/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    round_number: roundNum,
                    grid_size: this.gridSize,
                    time_p1: timeP1 || null,
                    time_p2: timeP2 || null,
                    winner: winner
                })
            });
        } catch (e) { console.error('Round save failed:', e); }
    }

    async _saveLeaderboard(name, mode, bestTime, roundsWon, totalRounds) {
        try {
            await fetch('/api/leaderboard/save/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    player_name: name,
                    mode: mode,
                    best_time: bestTime,
                    rounds_won: roundsWon,
                    total_rounds: totalRounds
                })
            });
        } catch (e) { console.error('Leaderboard save failed:', e); }
    }
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
    if (window.GAME_CONFIG) {
        new FacePuzzleGame(window.GAME_CONFIG);
    }
});
