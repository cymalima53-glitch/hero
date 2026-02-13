// Universal Touch-Click Handler for iPad/Mobile Compatibility
function addTouchClick(element, handler) {
    let touchStarted = false;
    
    addTouchClick(element, handler);
    
    element.addEventListener('touchstart', (e) => {
        touchStarted = true;
        e.preventDefault();
    }, { passive: false });
    
    element.addEventListener('touchend', (e) => {
        if (touchStarted) {
            e.preventDefault();
            handler(e);
            touchStarted = false;
        }
    }, { passive: false });
    
    element.addEventListener('touchcancel', () => {
        touchStarted = false;
    });
}
class HeroFreezeGame {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.ctx = this.canvas.getContext('2d');

        this.detector = null;
        this.isModelLoaded = false;
        this.sessionId = new URLSearchParams(window.location.search).get('session');
        this.sessionData = null;
        this.rounds = [];

        // Game State
        this.currentRoundIndex = 0;
        this.score = 0;
        this.mistakes = 0;
        this.isRoundActive = false;
        this.roundStartTime = 0;
        this.gameStartTime = Date.now();

        // Detection State (CRITICAL: Keep separate from skeleton drawing)
        this.canDetect = false;
        this.lastPose = null;
        this.motionHistory = [];
        this.freezeCounter = 0;
        this.jumpDetected = false;
        this.detectStartTime = 0;  // Track when detection began
        this.wrongAttempts = 0;  // Track wrong attempts (max 3)
        this.roundAttemptStartTime = 0;  // Track when attempt started

        // Timers
        this.audioTimeout = null;
        this.gameTimeout = null;

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
                this.playAudioSequence(this.currentRound.audio, this.currentRound.instruction);
            }
        };

        const spkBg = document.getElementById('speaker-bg');
        if (spkBg) addTouchClick(spkBg, replay);

        const rplHint = document.getElementById('replay-hint');
        if (rplHint) addTouchClick(rplHint, replay);

        try {
            if (this.sessionId) {
                const res = await fetch(`/api/session/${this.sessionId}`);
                if (!res.ok) throw new Error("Session not found");
                this.sessionData = await res.json();
                await this.prepareRounds();
            } else {
                this.rounds = [
                    { word: "Freeze", correctAction: "freeze", audio: "Freeze!", instruction: "Freeze!" },
                    { word: "Jump", correctAction: "jump", audio: "Jump!", instruction: "Jump!" }
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
            const res = await fetch(`/data/${lang}`, { credentials: 'include' }`);
            if (!res.ok) throw new Error(`Data fetch failed`);

            const data = await res.json();
            const allWords = data.words || [];
            const ids = this.sessionData.wordIds || [];
            const actions = this.sessionData.gameActions || {};

            this.rounds = ids.map((id) => {
                const w = allWords.find(x => x.id === id);
                if (!w || w.enabled === false) return null;

                let action = w.ss_correctAction || actions[id] || 'freeze';
                if (action !== 'jump') action = 'freeze';

                return {
                    id: w.id,
                    word: w.word,
                    image: w.image,
                    audio: w.audio,
                    correctAction: action,
                    instruction: w.ss_instruction || (action === 'freeze' ? "Freeze!" : "Jump!")
                };
            }).filter(r => r);
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

            // 3-minute session timer - waits for round to finish
            this.sessionTimeout = setTimeout(() => {
                console.warn("Session timeout - 3 minutes reached");
                this.sessionTimeExpired = true;
                // Show indicator that time is up
                const instructionEl = document.getElementById('instruction-text');
                if (instructionEl && this.isRoundActive) {
                    instructionEl.textContent = "Last word...";
                }
            }, 180000);  // 180 seconds = 3 minutes

            this.nextRound();
            this.renderLoop();
        } catch (e) {
            alert("Camera Error: " + e.message);
        }
    }

    nextRound() {
        // Clear all timers
        if (this.audioTimeout) clearTimeout(this.audioTimeout);
        if (this.gameTimeout) clearTimeout(this.gameTimeout);

        this.currentRoundIndex++;
        if (this.currentRoundIndex >= this.rounds.length) {
            this.endGame();
            return;
        }

        // Check if session time expired - end game after round finishes
        if (this.sessionTimeExpired === true) {
            console.log("Session time expired - ending game after round completion");
            this.endGame();
            return;
        }

        const round = this.rounds[this.currentRoundIndex];
        this.currentRound = round;
        this.isRoundActive = true;
        this.canDetect = false;
        this.roundStartTime = Date.now();

        // Reset detection state
        this.lastPose = null;
        this.motionHistory = [];
        this.freezeCounter = 0;
        this.jumpDetected = false;
        this.detectStartTime = 0;  // Track when detection began
        this.wrongAttempts = 0;  // Reset wrong attempts
        this.roundAttemptStartTime = 0;

        // Update UI
        this.progressText.textContent = `${this.currentRoundIndex + 1}/${this.rounds.length}`;
        this.scoreDisplay.textContent = `Score: ${this.score}`;

        const instructionEl = document.getElementById('instruction-text');
        instructionEl.textContent = "Listen...";
        instructionEl.classList.add('pulse-anim');

        this.statusTimerEl.textContent = "LISTEN";
        this.statusTimerEl.className = 'wait';

        // Delay audio by 1 second so kids can see the word
        setTimeout(() => {
            this.playAudioSequence(round.audio, round.instruction);
        }, 1000);
    }

    playAudioSequence(audioUrl, instructionText) {
        window.speechSynthesis.cancel();
        this.canDetect = false;

        const enableDetection = () => {
            console.log("GO! Detection enabled");
            this.canDetect = true;
            this.detectStartTime = Date.now();
            this.roundAttemptStartTime = Date.now();
            this.statusTimerEl.textContent = "GO!";
            this.statusTimerEl.className = 'go';
            this.freezeCounter = 0;
            this.jumpDetected = false;
            this.motionHistory = [];
            this.lastPose = null;

            // 100 second timeout per word
            this.gameTimeout = setTimeout(() => {
                if (this.isRoundActive) this.handleTimeout();
            }, 100000);
        };

        // Force GO after 3 seconds (let kids listen fully)
        this.audioTimeout = setTimeout(() => {
            console.warn("Audio timeout - forcing GO");
            enableDetection();
        }, 3000);

        const onAudioComplete = () => {
            if (this.audioTimeout) {
                clearTimeout(this.audioTimeout);
                this.audioTimeout = null;
            }
            setTimeout(enableDetection, 300);
        };

        const speakInstruction = () => {
            if (!instructionText) {
                onAudioComplete();
                return;
            }

            const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
            const u = new SpeechSynthesisUtterance(instructionText);
            u.lang = localeMap[this.sessionData?.lang] || 'en-US';
            u.rate = 0.9;
            u.onend = onAudioComplete;
            window.speechSynthesis.speak(u);
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
                audio.onended = speakInstruction;
                audio.play().catch(() => speakInstruction());
            }
        } else {
            speakInstruction();
        }
    }

    async renderLoop() {
        if (!this.detector) return;

        // ALWAYS draw skeleton first - NEVER skip this
        try {
            const poses = await this.detector.estimatePoses(this.video);
            if (poses && poses.length > 0 && poses[0].keypoints) {
                this.drawSkeleton(poses[0]);

                // Then detect actions (if round active)
                if (this.isRoundActive && this.canDetect) {
                    this.detectAction(poses[0]);
                }

                this.lastPose = poses[0];
            } else {
                this.drawSkeleton({ keypoints: [] });
            }
        } catch (e) {
            console.error("RenderLoop error:", e.message);
            this.drawSkeleton({ keypoints: [] });
        }

        requestAnimationFrame(() => this.renderLoop());
    }

    detectAction(pose) {
        if (!pose || !pose.keypoints) return;

        try {
            const kp = pose.keypoints;

            // Get keypoints (MoveNet indices)
            const nose = this.getKeypoint(kp, 0);
            const leftShoulder = this.getKeypoint(kp, 5);
            const rightShoulder = this.getKeypoint(kp, 6);
            const leftHip = this.getKeypoint(kp, 11);
            const rightHip = this.getKeypoint(kp, 12);

            if (!nose || !leftShoulder || !rightShoulder) return;

            // ==================================================
            // DETECT JUMP (High threshold for hip movement)
            // ==================================================
            if (leftHip && rightHip && !this.jumpDetected) {
                const hipY = (leftHip.y + rightHip.y) / 2;

                this.motionHistory.push(hipY);
                if (this.motionHistory.length > 10) this.motionHistory.shift();

                // Need 4 frames for precise jump detection (like freeze precision)
                if (this.motionHistory.length >= 4) {
                    const oldHipY = this.motionHistory[0];
                    const newHipY = hipY;
                    const hipDelta = oldHipY - newHipY; // Positive = UP

                    // Higher threshold (15 pixels) = more precise, less false positives
                    if (hipDelta > 20) {  // Harder to jump - need bigger movement
                        console.log("JUMP DETECTED! Delta:", hipDelta);
                        this.jumpDetected = true;

                        if (this.currentRound.correctAction === 'jump') {
                            this.handleSuccess();
                        } else {
                            this.handleWrongAction("Don't Jump! Freeze!");
                        }
                    }
                }
            }

            // ==================================================
            // DETECT FREEZE (Low motion for 600ms - easier!)
            // ==================================================
            // Only start freeze detection after 200ms of GO! (short grace period)
            if (!this.jumpDetected && this.lastPose && (Date.now() - this.detectStartTime) > 200) {
                const motion = this.calcMotion(nose, leftShoulder, rightShoulder,
                    this.lastPose.keypoints[0],
                    this.lastPose.keypoints[5],
                    this.lastPose.keypoints[6]);

                // Low motion = freezing (very lenient)
                if (motion < 5) {  // Harder to freeze - less sensitive
                    this.freezeCounter += 33;
                    console.log("Motion:", Math.round(motion), "| Counter:", this.freezeCounter);

                    if (this.freezeCounter >= 600) {  // Only 600ms needed (was 800ms)
                        console.log("FREEZE CONFIRMED!");
                        console.log("Action expected:", this.currentRound.correctAction);

                        const action = this.currentRound.correctAction?.toLowerCase() || 'freeze';
                        if (action === 'freeze') {
                            this.handleSuccess();
                        } else {
                            this.handleWrongAction("Keep Moving!");
                        }
                    }
                } else {
                    if (this.freezeCounter > 0) console.log("Moving again, resetting freeze");
                    this.freezeCounter = 0; // Reset if moving
                }
            }
        } catch (e) {
            console.error("detectAction error:", e.message);
        }
    }

    getKeypoint(keypoints, index) {
        if (!keypoints || !keypoints[index]) return null;
        const kp = keypoints[index];
        return (kp.score > 0.3) ? { x: kp.x, y: kp.y, score: kp.score } : null;
    }

    calcMotion(p1, p2, p3, p1_old, p2_old, p3_old) {
        if (!p1_old || !p2_old || !p3_old) return 100;

        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const d1 = dist(p1, p1_old);
        const d2 = dist(p2, p2_old);
        const d3 = dist(p3, p3_old);

        return (d1 + d2 + d3) / 3;
    }

    drawSkeleton(pose) {
        try {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.lineWidth = 4;
            this.ctx.strokeStyle = this.canDetect ? '#00ff00' : '#ffa500';

            if (!pose.keypoints || pose.keypoints.length === 0) return;

            const connections = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.MoveNet);

            connections.forEach(([i, j]) => {
                const kp1 = pose.keypoints[i];
                const kp2 = pose.keypoints[j];

                if (kp1 && kp2 && kp1.score > 0.3 && kp2.score > 0.3) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(kp1.x, kp1.y);
                    this.ctx.lineTo(kp2.x, kp2.y);
                    this.ctx.stroke();
                }
            });
        } catch (e) {
            console.error("drawSkeleton error:", e.message);
        }
    }

    handleSuccess() {
        if (!this.isRoundActive) return;
        this.isRoundActive = false;

        const time = (Date.now() - this.roundStartTime) / 1000;
        this.score += 100;
        // Show different messages
        let msg = 'GOOD!';
        if (this.currentRound.correctAction === 'freeze') msg = 'FREEZE GOOD!';
        if (this.currentRound.correctAction === 'jump') msg = 'JUMP GOOD!';
        this.showFeedback(msg, 'correct');

        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wordId: this.currentRound.id, correct: true, timeSpent: time })
            }).catch(console.error);
        }

        setTimeout(() => {
            document.getElementById('feedback-message').className = 'hidden';
            this.nextRound();
        }, 1500);  // Feedback display
    }

    handleWrongAction(msg) {
        // BLOCK if already at 3 attempts - prevent 4th, 5th, 6th+ attempts
        if (this.wrongAttempts >= 3) {
            console.log("Already 3 attempts reached - blocking further attempts");
            this.isRoundActive = false;
            return;  // EXIT - don't process more
        }

        // Wrong action but keep detecting (don't end round)
        this.wrongAttempts++;
        console.log("Wrong attempt", this.wrongAttempts, "of 3");

        // Reset detection flags to allow trying opposite action
        this.jumpDetected = false;
        this.freezeCounter = 0;

        this.showFeedback(`✗ ${msg}`, 'wrong');

        // After 3 wrong attempts, end the round
        if (this.wrongAttempts >= 3) {
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
                this.isRoundActive = false;
                document.getElementById('feedback-message').className = 'hidden';
                this.nextRound();
            }, 1500);
        } else {
            // Hide message after 1 second and keep detecting
            setTimeout(() => {
                document.getElementById('feedback-message').className = 'hidden';
            }, 1000);
        }
    }

    handleFail(msg) {
        if (!this.isRoundActive) return;
        this.isRoundActive = false;
        this.mistakes++;

        this.showFeedback(`✗ ${msg}`, 'wrong');

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
            this.nextRound();
        }, 1500);  // Feedback display
    }

    handleTimeout() {
        if (!this.isRoundActive) return;
        this.isRoundActive = false;
        this.mistakes++;

        this.showFeedback("TOO SLOW!", 'wrong');

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

        setTimeout(() => {
            document.getElementById('feedback-message').className = 'hidden';
            this.nextRound();
        }, 1500);
    }

    showFeedback(text, type) {
        const el = document.getElementById('feedback-message');
        el.textContent = text;
        el.className = `show ${type}`;
    }

    async endGame() {
        // Let audio finish naturally - don't cancel it
        if (this.audioTimeout) clearTimeout(this.audioTimeout);
        if (this.gameTimeout) clearTimeout(this.gameTimeout);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        document.getElementById('game-area').classList.add('hidden');
        this.statusTimerEl.classList.add('hidden');

        const duration = (Date.now() - this.gameStartTime) / 1000;

        if (this.sessionId) {
            await fetch(`/api/session/${this.sessionId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attempts: this.rounds.length,
                    failuresBeforePass: this.mistakes,
                    duration: duration
                })
            }).catch(console.error);
        }

        const stars = (this.mistakes <= 2) ? 3 : 2;
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
    new HeroFreezeGame();
});