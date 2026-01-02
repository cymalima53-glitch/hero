class MoveMatchGame {
    constructor() {
        console.log("Game Constructor");
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.ctx = this.canvas.getContext('2d');

        this.detector = null;
        this.rafId = null;
        this.isModelLoaded = false;

        // Game State
        this.words = [];
        this.currentWord = null;
        this.correctSide = null; // 'left' or 'right'
        this.selectionTimer = 0;
        this.SELECTION_THRESHOLD = 30; // Approx 1.0s (30 frames) - Slower for better control
        this.isRoundActive = false;
        this.isCommitting = false; // Prevent double commit
        this.waitForNeutral = false; // New: Must return to center before making a choice
        this.mistakes = 0; // Analytics tracking

        // UI
        this.leftZone = document.getElementById('left-zone');
        this.rightZone = document.getElementById('right-zone');
        this.instruction = document.getElementById('instruction-text');

        this.rs = new ResultScreen({
            container: '#game-ui',
            onRetry: () => window.location.reload(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        this.init();
    }

    async loadPoseDetection() {
        const updateStatus = (msg) => {
            console.log(msg);
            const el = document.querySelector('#loading-overlay p');
            if (el) el.textContent = msg;
        };

        try {
            updateStatus("Initializing Graphics (WebGL)...");
            await tf.setBackend('webgl');

            updateStatus("Waiting for TF Ready...");
            await tf.ready();

            updateStatus("Downloading AI Brain (MoveNet)... This may take 20s.");

            // Race condition constraint: 30s timeout
            const modelPromise = poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Download timed out. Check Internet.")), 30000)
            );

            this.detector = await Promise.race([modelPromise, timeoutPromise]);

            updateStatus("AI Loaded!");
            this.isModelLoaded = true;
            document.getElementById('loading-overlay').classList.add('hidden');
            this.instruction.textContent = "Enable Camera to Start";

        } catch (e) {
            updateStatus("Error: " + e.message);
            alert("AI Load Failed:\n" + e.message);
            console.error(e);
        }
    }

    async init() {
        document.getElementById('camera-btn').addEventListener('click', () => this.startCamera());

        // Global error trap for render loop crashes
        window.addEventListener('error', (e) => {
            document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;top:0;left:0;background:red;color:white;z-index:9999;padding:20px;font-size:20px;">CRASH: ${e.message}</div>`);
        });

        // Parallel Load: Data + AI
        try {
            await Promise.all([
                this.loadData(),
                this.loadPoseDetection()
            ]);
        } catch (e) {
            console.error("Critical Init Fail:", e);
            document.querySelector('#loading-overlay p').textContent = "INIT ERROR: " + e.message;
        }
    }

    async loadData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            this.sessionId = urlParams.get('session');

            if (!this.sessionId) {
                document.getElementById('instruction').textContent = "Session Required";
                return;
            }

            const sessionRes = await fetch(`/api/session/${this.sessionId}`);
            if (!sessionRes.ok) throw new Error('Session not found (' + sessionRes.status + ')');
            const session = await sessionRes.json();

            // Store language for TTS
            this.currentLang = session.lang || 'en';

            await fetch(`/api/session/${this.sessionId}/start`, { method: 'POST' });

            // STRICT: Use session.words ONLY
            let rawWords = session.words || [];

            // STRICT FILTER
            this.rounds = rawWords.filter(w => w.enabled !== false);

            if (this.rounds.length === 0) {
                alert("No words enabled");
                document.getElementById('instruction').textContent = "No words enabled";
                return;
            }

            // Limit rounds if needed or just use all
            // The original code had a limit logic, let's keep it simple or respect session limit if it existed? 
            // User guidance: "Build game words ONLY from: session.words.filter..."
            // I'll stick to that.

            this.words = this.rounds;
            document.getElementById('progress-text').textContent = `0/${this.words.length}`;

        } catch (e) {
            console.error(e);
            this.instruction.textContent = "Error loading game data: " + e.message;
            alert("DATA ERROR: " + e.message);
        }
    }

    async startCamera() {
        this.gameStartTime = Date.now();
        // UNLOCK TTS (MANDATORY)
        if ('speechSynthesis' in window) {
            const unlock = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(unlock);
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            this.video.srcObject = stream;

            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });

            // Adjust Canvas match video
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            document.getElementById('game-ui').classList.remove('hidden');

            this.startGame();
            this.renderLoop();

        } catch (e) {
            console.error(e);
            let msg = "Camera Error: " + e.message;
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                msg = "PERMISSION DENIED. Please click the lock icon 🔒 and Allow Camera.";
            } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
                msg = "NO CAMERA FOUND. Please connect a webcam.";
            } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
                msg = "CAMERA IN USE by another app/tab. Close it and refresh.";
            }
            alert(msg);
            this.instruction.textContent = msg;
        }
    }

    startGame() {
        this.score = 0;
        this.mistakes = 0; // Reset mistakes
        this.roundIndex = 0;
        this.nextRound();
    }

    nextRound() {
        this.startTime = Date.now();
        console.log(">>> nextRound called. roundIndex:", this.roundIndex);

        // Reset commit flag
        this.isCommitting = false; // Unlock for next try

        if (this.roundIndex >= this.words.length) {
            this.endGame();
            return;
        }

        this.isRoundActive = true;
        this.selectionTimer = 0;
        this.waitForNeutral = true; // FORCE RETURN TO CENTER
        this.updateZoneVisuals(null); // Fix: Remove extra arg


        this.currentWord = this.words[this.roundIndex];
        const target = this.currentWord;
        console.log("New Target Word:", target.word);

        // Pick Distractor
        const others = this.words.filter(w => w.id !== target.id);
        const distractor = others.length > 0
            ? others[Math.floor(Math.random() * others.length)]
            : { image: '', word: 'Wrong' };

        // Randomize Sides
        this.correctSide = Math.random() < 0.5 ? 'left' : 'right';
        console.log("Correct Side:", this.correctSide);

        const leftImg = document.getElementById('left-img');
        const rightImg = document.getElementById('right-img');

        // Apply Images
        if (this.correctSide === 'left') {
            leftImg.src = target.image || '';
            rightImg.src = distractor.image || '';
        } else {
            leftImg.src = distractor.image || '';
            rightImg.src = target.image || '';
        }

        // Play Audio
        this.playAudio(target.word, target.audio);
        this.instruction.textContent = `Find: "${target.word}"`;

        // Update Progress
        const progressText = `${this.roundIndex + 1}/${this.words.length}`;
        document.getElementById('progress-text').textContent = progressText;
        console.log("Progress Updated:", progressText);
    }

    playAudio(text, url) {
        // PER-GAME TTS ONLY
        try {
            if (!window.__ttsUnlocked && 'speechSynthesis' in window) {
                const u0 = new SpeechSynthesisUtterance(" ");
                window.speechSynthesis.speak(u0);
                window.__ttsUnlocked = true;
            }

            if (url && url.startsWith('tts:')) {
                const [, lang, content] = url.split(':');
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(decodeURIComponent(content));
                u.lang = lang || 'en-US';
                u.rate = 0.9;
                window.speechSynthesis.speak(u);
                return;
            }

            if (url) {
                // Ensure no TTS overlap
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                new Audio(url).play().catch(e => console.error("Audio play error:", e));
            } else if ('speechSynthesis' in window) {
                // Cancel ONLY before speaking new text
                window.speechSynthesis.cancel();
                const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
                const u = new SpeechSynthesisUtterance(text);
                u.lang = localeMap[this.currentLang] || 'en-US';
                u.rate = 0.9;
                window.speechSynthesis.speak(u);
            }
        } catch (e) {
            console.error("playAudio error:", e);
        }
    }

    async renderLoop() {
        if (!this.detector) return;

        try {
            const poses = await this.detector.estimatePoses(this.video);

            // Draw debug (optional, can remove later)
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            if (poses.length > 0) {
                const nose = poses[0].keypoints.find(k => k.name === 'nose');
                if (nose && nose.score > 0.3) {
                    // Draw nose dot (Visual Feedback)
                    this.ctx.fillStyle = 'red';
                    this.ctx.beginPath();
                    this.ctx.arc(nose.x, nose.y, 20, 0, 2 * Math.PI); // Bigger dot
                    this.ctx.fill();

                    // Debug Text on screen
                    this.ctx.fillStyle = 'white';
                    this.ctx.font = '20px Arial';
                    this.ctx.fillText(`X: ${Math.round(nose.x)} / ${this.canvas.width}`, nose.x + 25, nose.y);

                    if (this.isRoundActive) {
                        this.checkZone(nose.x);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }

        this.rafId = requestAnimationFrame(() => this.renderLoop());
    }

    // Using normalized coordinates (0 to 1) makes resizing safe
    checkZone(x) {
        // Force sync canvas size to video (handles window resizing)
        if (this.canvas.width !== this.video.videoWidth) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        }

        const w = this.canvas.width;
        // Normalize X (0.0 to 1.0)
        const xNorm = x / w;

        // Debug: Show Normalized X
        this.ctx.fillStyle = 'cyan';
        this.ctx.font = '20px Monospace';
        this.ctx.fillText(`NormX: ${xNorm.toFixed(2)}`, 10, 80);

        if (this.waitForNeutral) {
            this.ctx.fillStyle = 'yellow';
            this.ctx.fillText("RETURN TO CENTER", 10, 130);

            // Neutral Zone: 0.40 to 0.60
            if (xNorm > 0.40 && xNorm < 0.60) {
                this.waitForNeutral = false; // Unlocked!
            } else {
                return; // Ignore inputs until centered
            }
        }

        let visualSide = null;

        // UPDATED THRESHOLDS: WIDER NEUTRAL ZONE
        // Left Side: > 0.60 (was 0.55)
        // Right Side: < 0.40 (was 0.45)

        if (xNorm > 0.60) visualSide = 'left';
        if (xNorm < 0.40) visualSide = 'right';

        // DEBUG: Show active zone
        if (visualSide) {
            this.ctx.fillStyle = 'lime';
            this.ctx.font = '50px Arial';
            this.ctx.fillText(`ZONE: ${visualSide.toUpperCase()} !!!`, 10, 130);
        }

        this.updateZoneVisuals(visualSide);

        if (visualSide === 'left' || visualSide === 'right') {
            this.selectionTimer++;
            // Update loader bar
            const pct = Math.min((this.selectionTimer / this.SELECTION_THRESHOLD) * 100, 100);

            if (visualSide === 'left') {
                document.querySelector('#left-loader').style.opacity = 1;
                document.querySelector('#left-loader .loader-bar').style.width = pct + '%';
            } else {
                document.querySelector('#right-loader').style.opacity = 1;
                document.querySelector('#right-loader .loader-bar').style.width = pct + '%';
            }

            if (this.selectionTimer > this.SELECTION_THRESHOLD) {
                this.commitSelection(visualSide);
            }
        } else {
            this.selectionTimer = 0;
            document.querySelectorAll('.loader').forEach(l => l.style.opacity = 0);
        }
    }

    updateZoneVisuals(side) {
        this.leftZone.classList.remove('active');
        this.rightZone.classList.remove('active');
        if (side === 'left') this.leftZone.classList.add('active');
        if (side === 'right') this.rightZone.classList.add('active');
    }

    // NUCLEAR FIX: Completely synchronous, no async/await
    commitSelection(side) {
        // Debounce: Prevent multiple calls
        if (this.isCommitting) {
            console.log("Commit blocked - already committing");
            return;
        }
        this.isCommitting = true;

        console.log("=== COMMIT START ===", side);

        this.isRoundActive = false;

        // Remove active highlight
        this.leftZone.classList.remove('active');
        this.rightZone.classList.remove('active');

        const correct = (side === this.correctSide);
        console.log("Correct?", correct, "correctSide:", this.correctSide);

        // Visual Feedback
        const zone = side === 'left' ? this.leftZone : this.rightZone;
        zone.classList.add(correct ? 'correct' : 'wrong');

        if (correct) {
            this.score++;
        } else {
            this.mistakes++; // Track mistake
        }

        // Play audio (fire and forget, don't wait)
        this.playAudio(correct ? "Correct" : "Try Again", null);

        // Track (fire and forget)
        if (this.sessionId && this.currentWord) {
            const timeSpent = (Date.now() - this.startTime) / 1000;
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordId: this.currentWord.id,
                    correct: correct,
                    mistakeType: correct ? null : 'wrong_action',
                    timeSpent: timeSpent
                })
            }).catch(e => console.error("Track Error", e));
        }

        // CRITICAL: Move to next round after delay
        const self = this;
        window.setTimeout(function () {
            zone.classList.remove('correct', 'wrong');
            self.roundIndex++;
            self.nextRound();
        }, 1500);
    }

    async endGame() {
        const duration = this.gameStartTime ? (Date.now() - this.gameStartTime) / 1000 : 0;
        if (this.sessionId) {
            await fetch(`/api/session/${this.sessionId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attempts: this.words.length,
                    failuresBeforePass: this.mistakes, // Reporting Mistakes
                    duration: duration
                })
            });
        }

        let stars = (this.mistakes <= 2) ? 3 : 2; // Simple star logic
        this.rs.show({
            success: true,
            attempts: 1,
            overrideStars: stars,
            showRetry: !this.sessionId
        });
    }



}


// Start
window.onload = () => new MoveMatchGame();
