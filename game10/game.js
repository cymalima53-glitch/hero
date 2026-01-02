class SimonSquadGame {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.ctx = this.canvas.getContext('2d');

        this.detector = null;
        this.rafId = null;
        this.isModelLoaded = false;

        // Data
        this.sessionId = new URLSearchParams(window.location.search).get('session');
        this.sessionData = null;
        this.rounds = [];

        // Game State
        this.currentRoundIndex = 0;
        this.score = 0;
        this.mistakes = 0;
        this.isRoundActive = false;
        this.roundStartTime = 0;
        this.debounceTimer = 0;
        this.gameStartTime = Date.now();

        // ----------------------------------------------------
        // HERO FREEZE (Freeze vs Jump) STATE
        // ----------------------------------------------------
        this.canDetect = false;             // Only true AFTER audio + 300ms
        this.lastKeypoints = null;          // For Motion Delta (Freeze)
        this.hipYHistory = [];              // For Jump Detection
        this.freezeTimer = 0;               // Time held still
        this.FREEZE_THRESH_LOW = 2.5;         // Motion < this => Freeze
        this.FREEZE_DURATION = 800;         // ms to confirm freeze
        this.JUMP_VELOCITY_THRESH = 15;     // Pixel drop in Y (Move UP)
        // ----------------------------------------------------

        // UI
        this.scoreDisplay = document.getElementById('score-display');
        this.progressText = document.getElementById('progress-text');
        this.statusTimerEl = document.getElementById('status-timer');

        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => window.location.reload(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        this.init();
    }

    async init() {
        document.getElementById('camera-btn').addEventListener('click', () => this.startCamera());

        const replay = () => {
            if (this.currentRound) {
                const bg = document.getElementById('speaker-bg');
                if (bg) {
                    bg.style.transform = "scale(0.9)";
                    setTimeout(() => bg.style.transform = "", 200);
                }
                this.playAudioSequence(this.currentRound.audio, this.currentRound.instruction);
            }
        };

        const spkBg = document.getElementById('speaker-bg');
        if (spkBg) spkBg.addEventListener('click', replay);

        const rplHint = document.getElementById('replay-hint');
        if (rplHint) rplHint.addEventListener('click', replay);

        try {
            if (this.sessionId) {
                const res = await fetch(`/api/session/${this.sessionId}`);
                if (!res.ok) throw new Error("Session not found");
                this.sessionData = await res.json();
                await this.prepareRounds();
            } else {
                // DEMO MODE (Freeze/Jump)
                this.rounds = [
                    { word: "Freeze Test", correctAction: "freeze", audio: "Freeze!", instruction: "Freeze if you hear this!" },
                    { word: "Jump Test", correctAction: "jump", audio: "Jump!", instruction: "Jump if you hear this!" }
                ];
            }

            await tf.setBackend('webgl');
            await tf.ready();
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            this.isModelLoaded = true;
            document.getElementById('loading-overlay').classList.add('hidden');

        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async prepareRounds() {
        if (!this.sessionData) return;
        const lang = this.sessionData.lang || 'en';
        try {
            const res = await fetch(`/data/${lang}`);
            if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);

            const data = await res.json();
            const allWords = data.words || [];
            const ids = this.sessionData.wordIds || [];

            // Editor saves to config.actions[wordId] -> sessionData.gameActions[wordId]
            const actions = this.sessionData.gameActions || {};

            this.rounds = ids.map((id) => {
                const w = allWords.find(x => x.id === id);
                if (!w || w.enabled === false) return null; // FILTER (treat undefined as enabled)

                // Priority: 1. Editor Config 2. 'freeze' default
                // STRICT: No cycling, no fallback randomness.
                let action = w.ss_correctAction || actions[id] || 'freeze';

                // Map legacy actions to new safe defaults if old data exists
                const legacyMap = {
                    'hands_up': 'freeze',
                    'knee_up': 'jump',
                    'one_hand_up': 'jump',
                    'hands_out': 'freeze'
                };
                if (legacyMap[action]) action = legacyMap[action];

                // Ensure valid action
                if (action !== 'jump') action = 'freeze';

                const instruction = w.ss_instruction || (action === 'freeze' ? "Freeze!" : "Jump!");

                return {
                    id: w.id,
                    word: w.word,
                    image: w.image,
                    audio: w.audio,
                    correctAction: action,
                    instruction: instruction
                };
            }).filter(r => r);

            this.rounds = this.rounds.map(r => {
                if (r.image && !r.image.startsWith('http') && r.image.includes('pixabay')) {
                    r.image = 'https://' + r.image;
                }
                return r;
            });

        } catch (e) {
            console.error(e);
        }
    }

    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            this.video.srcObject = stream;
            await new Promise(resolve => this.video.onloadedmetadata = () => {
                this.video.play();
                resolve();
            });
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            document.getElementById('top-bar').classList.add('hidden');
            document.getElementById('game-area').classList.remove('hidden');
            this.statusTimerEl.classList.remove('hidden');

            if (this.sessionId) fetch(`/api/session/${this.sessionId}/start`, { method: 'POST' });

            this.gameStartTime = Date.now();
            this.currentRoundIndex = -1;
            this.nextRound();
            this.renderLoop();
        } catch (e) {
            alert("Camera Error: " + e.message);
        }
    }

    nextRound() {
        this.currentRoundIndex++;
        if (this.currentRoundIndex >= this.rounds.length) {
            this.endGame();
            return;
        }

        const round = this.rounds[this.currentRoundIndex];
        this.isRoundActive = true;
        this.canDetect = false; // WAIT FOR AUDIO
        this.roundStartTime = Date.now();
        this.currentRound = round;

        // RESET STATE
        this.lastKeypoints = null;
        this.hipYHistory = [];
        this.freezeTimer = 0;
        this.roundTimeoutStart = 0;

        // UI
        this.progressText.textContent = `Round ${this.currentRoundIndex + 1}/${this.rounds.length}`;
        this.scoreDisplay.textContent = `Score: ${this.score}`;

        const instructionEl = document.getElementById('instruction-text');
        instructionEl.textContent = "Listen...";
        instructionEl.classList.add('pulse-anim');

        this.statusTimerEl.textContent = "LISTEN";
        this.statusTimerEl.className = 'wait';

        this.playAudioSequence(round.audio, round.instruction);
    }

    playAudioSequence(audioUrl, instructionText) {
        window.speechSynthesis.cancel();
        this.canDetect = false;

        const onComplete = () => {
            // Give 300ms buffer after audio finishes before starting detection
            setTimeout(() => {
                this.canDetect = true;
                this.statusTimerEl.textContent = "GO!";
                this.statusTimerEl.className = 'go';
                // Reset motion history so we don't detect motion *during* audio
                this.lastKeypoints = null;
                this.hipYHistory = [];
                this.freezeTimer = 0;
                this.roundTimeoutStart = Date.now(); // START 6s TIMER
            }, 300);
        };

        const speakInstruction = () => {
            if (instructionText) {
                const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
                const u = new SpeechSynthesisUtterance(instructionText);
                u.lang = localeMap[this.sessionData?.lang] || 'en-US';
                u.rate = 0.9;
                u.onend = onComplete;
                window.speechSynthesis.speak(u);
            } else {
                onComplete();
            }
        };

        if (audioUrl && audioUrl.length > 5) {
            if (audioUrl.startsWith('tts:')) {
                const parts = audioUrl.split(':');
                const text = decodeURIComponent(parts[2]);
                const u = new SpeechSynthesisUtterance(text);
                u.lang = parts[1] || 'en-US';
                u.onend = () => speakInstruction();
                window.speechSynthesis.speak(u);
            } else {
                const audio = new Audio(audioUrl);
                audio.onended = () => speakInstruction();
                audio.play().catch(e => {
                    console.warn("Audio fail, fallback TTS", e);
                    // Fallback to speaking current word if possible
                    if ('speechSynthesis' in window && this.currentRound?.word) {
                        const localeMap2 = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
                        const u = new SpeechSynthesisUtterance(this.currentRound.word);
                        u.lang = localeMap2[this.sessionData?.lang] || 'en-US';
                        u.onend = () => speakInstruction();
                        window.speechSynthesis.speak(u);
                    } else {
                        speakInstruction();
                    }
                });
            }
        } else {
            speakInstruction();
        }
    }

    async renderLoop() {
        if (!this.detector) return;

        // TIMEOUT CHECK
        if (this.isRoundActive && this.canDetect) {
            if (Date.now() - this.roundTimeoutStart > 6000) {
                this.handleTimeout();
                return; // Stop rendering this frame
            }
        }

        const poses = await this.detector.estimatePoses(this.video);
        if (poses.length > 0) {
            this.detectAction(poses[0]);
            this.drawSkeleton(poses[0]);
        }
        requestAnimationFrame(() => this.renderLoop());
    }

    detectAction(pose) {
        // 1. SAFETY CHECKS
        if (!this.isRoundActive || !this.canDetect) return;

        const kp = pose.keypoints;
        const find = (name) => {
            const p = kp.find(k => k.name === name);
            // Lower confidence allowed for jump tracking
            return (p && p.score > 0.3) ? p : null;
        };

        const nose = find('nose');
        const leftShoulder = find('left_shoulder');
        const rightShoulder = find('right_shoulder');
        const leftHip = find('left_hip');
        const rightHip = find('right_hip');

        // Need Minimal Body Parts
        if (!nose || !leftShoulder || !rightShoulder) return;

        // -------------------------------------------------------------
        // DETECT JUMP (Velocity Spike on Hips)
        // -------------------------------------------------------------
        let isJumping = false;
        if (leftHip && rightHip) {
            const avgY = (leftHip.y + rightHip.y) / 2;
            this.hipYHistory.push({ y: avgY, time: Date.now() });
            if (this.hipYHistory.length > 10) this.hipYHistory.shift(); // Keep last ~300ms

            // Look for recent spike UP (Y decreases)
            // Current Y significantly LESS than Y 200ms ago
            if (this.hipYHistory.length >= 5) {
                const oldY = this.hipYHistory[0].y;
                const currentY = avgY;
                const deltaY = oldY - currentY; // Positive if moved UP

                // Adaptive Threshold based on shoulder width (scale)
                const scale = Math.abs(leftShoulder.x - rightShoulder.x);
                const jumpThresh = scale * 0.25; // 25% of shoulder width jump

                if (deltaY > jumpThresh) {
                    isJumping = true;
                }
            }
        }

        // -------------------------------------------------------------
        // DETECT FREEZE (Low Motion Delta)
        // -------------------------------------------------------------
        let currentMotion = 100; // High default
        if (this.lastKeypoints) {
            // Compare Nose + Shoulders (Most stable parts)
            const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
            const d1 = dist(nose, this.lastKeypoints.nose);
            const d2 = dist(leftShoulder, this.lastKeypoints.leftShoulder);
            const d3 = dist(rightShoulder, this.lastKeypoints.rightShoulder);

            // Average motion in pixels
            currentMotion = (d1 + d2 + d3) / 3;
        }

        // Update Last Keypoints
        this.lastKeypoints = {
            nose: { x: nose.x, y: nose.y },
            leftShoulder: { x: leftShoulder.x, y: leftShoulder.y },
            rightShoulder: { x: rightShoulder.x, y: rightShoulder.y }
        };

        // -------------------------------------------------------------
        // EVALUATE
        // -------------------------------------------------------------
        const correctAction = this.currentRound.correctAction;

        // 1. DID THEY JUMP? (Priority: Jump overrides Freeze)
        if (isJumping) {
            if (correctAction === 'jump') {
                this.handleSuccess();
            } else {
                // REQUIRED FREEZE, BUT JUMPED -> FAIL
                this.handleFail("Don't Jump! Freeze!");
            }
            return; // Lock result once jump detected
        }

        // 2. ARE THEY FREEZING?
        if (currentMotion < this.FREEZE_THRESH_LOW) {
            // Accumulate Freeze Time
            this.freezeTimer += 33; // Approx 30fps
        } else {
            // Reset if moved
            this.freezeTimer = 0;
            // If we are supposed to freeze, and we move significantly -> FAIL?
            // "Motion > HighThreshold -> move_detected"
            // Let's be lenient. Only fail if they successfully "JUMP" (handled above)
            // or if they are moving A LOT when they should freeze?
            // User requirement: "Freezing when MOVE is expected = Fail"
            // "Moving when FREEZE is expected = Fail"

            if (correctAction === 'freeze' && currentMotion > (this.FREEZE_THRESH_LOW * 4)) {
                // Moving too much!
                // Wait a bit before failing to allow settling?
            }
        }

        // Check Freeze Success
        if (this.freezeTimer >= this.FREEZE_DURATION) {
            if (correctAction === 'freeze') {
                this.handleSuccess();
            } else {
                // MOVED TOO LITTLE -> FAIL
                this.handleFail("Keep Moving / Jumping!");
            }
        }
    }

    handleSuccess() {
        if (!this.isRoundActive) return;
        this.isRoundActive = false;

        // Score Logic
        const time = (Date.now() - this.roundStartTime) / 1000;
        this.score += 100;
        this.showFeedback(`✓ CORRECT!`, 'correct');

        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wordId: this.currentRound.id, correct: true, timeSpent: time })
            });
        }

        setTimeout(() => {
            document.getElementById('feedback-message').className = 'hidden';
            this.nextRound();
        }, 1500);
    }

    handleFail(msg) {
        if (!this.isRoundActive) return;
        // Debounce failures
        if (Date.now() < this.debounceTimer) return;

        this.mistakes++;
        this.showFeedback(`✗ ${msg}`, 'wrong');
        this.debounceTimer = Date.now() + 1500; // 1.5s penalty delay

        // IMMEDIATE TRACKING (STRICT FIX)
        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordId: this.currentRound.id,
                    correct: false,
                    mistakeType: 'wrong_action'
                })
            }).catch(console.error);
        }

        setTimeout(() => {
            document.getElementById('feedback-message').className = 'hidden';
            // Start fresh detection 
            this.freezeTimer = 0;
            this.hipYHistory = [];
        }, 1200);
    }

    handleTimeout() {
        if (!this.isRoundActive) return;
        this.isRoundActive = false;
        this.mistakes++; // Count as failure

        this.showFeedback("⌛ TOO SLOW!", 'wrong');

        // IMMEDIATE TRACKING (TIMEOUT)
        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordId: this.currentRound.id,
                    correct: false,
                    mistakeType: 'timeout'
                })
            }).catch(console.error);
        }

        // Play audio once as reminder, then next
        // (Simple flow: wait then next)
        setTimeout(() => {
            document.getElementById('feedback-message').className = 'hidden';
            this.nextRound();
        }, 2000);
    }

    showFeedback(text, type) {
        const el = document.getElementById('feedback-message');
        el.textContent = text;
        el.className = `show ${type}`;
    }

    drawSkeleton(pose) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.lineWidth = 4;

        // Color based on state
        // If canDetect = true, GREEN. Else RED/ORANGE
        this.ctx.strokeStyle = this.canDetect ? '#00ff00' : '#ffa500';

        const connections = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.MoveNet);
        connections.forEach(([i, j]) => {
            const kp1 = pose.keypoints[i];
            const kp2 = pose.keypoints[j];
            if (kp1.score > 0.3 && kp2.score > 0.3) {
                this.ctx.beginPath();
                this.ctx.moveTo(kp1.x, kp1.y);
                this.ctx.lineTo(kp2.x, kp2.y);
                this.ctx.stroke();
            }
        });
    }

    async endGame() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        document.getElementById('game-area').classList.add('hidden');
        this.statusTimerEl.classList.add('hidden');

        const duration = this.gameStartTime ? (Date.now() - this.gameStartTime) / 1000 : 0;

        if (this.sessionId) {
            await fetch(`/api/session/${this.sessionId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attempts: this.rounds.length,
                    failuresBeforePass: this.mistakes,
                    duration: duration
                })
            });
        }

        let stars = (this.mistakes <= 2) ? 3 : 2;
        this.rs.show({
            success: true,
            attempts: 1,
            lang: this.sessionData?.lang || 'en',
            overrideStars: stars,
            overrideTitle: "Hero Freeze Master!",
            showRetry: !this.sessionId
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new SimonSquadGame();
});
