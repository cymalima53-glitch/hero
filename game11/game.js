class AudioDetectiveGame {
    constructor() {
        console.log("AudioDetective Constructor");
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.ctx = this.canvas.getContext('2d');

        this.detector = null;
        this.rafId = null;
        this.isModelLoaded = false;

        // Game State
        this.questions = [];
        this.currentQuestion = null;
        this.score = 0;
        this.mistakes = 0;
        this.correctSide = null; // 'left' or 'right'

        // PHYSICS PARAMS (FROM GAME 9 - DO NOT CHANGE)
        this.selectionTimer = 0;
        this.SELECTION_THRESHOLD = 30; // Approx 1.0s (30 frames)
        this.isRoundActive = false;
        this.isCommitting = false;
        this.waitForNeutral = false;

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
            await tf.ready();

            updateStatus("Downloading AI Brain (MoveNet)...");

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

        // Replay Audio Listener
        const replay = () => {
            if (this.currentQuestion) {
                // Visual feedback
                const bg = document.getElementById('speaker-bg');
                bg.style.transform = "scale(0.9)";
                setTimeout(() => bg.style.transform = "", 200);

                this.playAudioSequence(this.currentQuestion.audio, this.currentQuestion.instruction);
            }
        };

        document.getElementById('speaker-bg').addEventListener('click', replay);
        document.getElementById('replay-hint').addEventListener('click', replay);

        window.addEventListener('error', (e) => {
            console.error("CRASH:", e.message);
        });

        try {
            await Promise.all([
                this.loadData(),
                this.loadPoseDetection()
            ]);
        } catch (e) {
            console.error("Critical Init Fail:", e);
        }
    }

    async loadData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            this.sessionId = urlParams.get('session');
            this.currentLang = urlParams.get('lang') || 'en';

            let rawQuestions = [];

            if (this.sessionId) {
                // SESSION MODE
                const sessionRes = await fetch(`/api/session/${this.sessionId}`);
                if (!sessionRes.ok) throw new Error('Session not found');
                const session = await sessionRes.json();

                await fetch(`/api/session/${this.sessionId}/start`, { method: 'POST' });

                this.currentLang = session.lang || 'en';
                const res = await fetch(`/data/${this.currentLang}.json?t=${Date.now()}`);
                const data = await res.json();

                // "questions" in this case are stored in audioDetective section
                // But for sessions, they might be referenced by ID in the main 'words' list?
                // Actually, the plan says we add a new section "audioDetective".
                // Let's assume for now we just load audioDetective config.
                // Wait, mixed mode? No, this is a dedicated game.

                const allRounds = data.audioDetective?.rounds || []; // Legacy demo array

                // MAPPING LOGIC: Merge Word Data with Game Config
                const words = data.words || [];
                const validIds = new Set(session.wordIds);

                // If the word exists in the main list, use its properties
                rawQuestions = words.filter(w => validIds.has(w.id) && w.enabled !== false).map(w => ({
                    id: w.id,
                    word: w.word,
                    audio: w.audio,
                    instruction: w.ad_instruction || "",
                    correctSide: w.ad_correctSide || "left"
                }));

                if (session.limit) rawQuestions = rawQuestions.slice(0, session.limit);

            } else {
                // DEMO MODE
                const res = await fetch(`/data/${this.currentLang}.json?t=${Date.now()}`);
                const data = await res.json();

                // Use main words list if audioDetective section is empty or legacy
                const words = data.words || [];

                // Filter words that have Audio Detective config?
                // Or just pick random words and fallback defaults
                rawQuestions = words
                    .filter(w => w.ad_instruction) // Only pick configured words?
                    .map(w => ({
                        id: w.id,
                        word: w.word,
                        audio: w.audio,
                        instruction: w.ad_instruction,
                        correctSide: w.ad_correctSide || "left"
                    }));

                // Fallback if no configured words found
                if (rawQuestions.length === 0) {
                    rawQuestions = [
                        { id: 'demo1', instruction: "If you hear YES, go LEFT", audio: "", correctSide: "left" },
                        { id: 'demo2', instruction: "If you hear NO, go RIGHT", audio: "", correctSide: "right" }
                    ];
                }

                // Shuffle and limit
                rawQuestions.sort(() => Math.random() - 0.5);
                rawQuestions = rawQuestions.slice(0, 10);
            }

            this.questions = rawQuestions;
            document.getElementById('progress-text').textContent = `0/${this.questions.length}`;

        } catch (e) {
            console.error(e);
            alert("DATA ERROR: " + e.message);
        }
    }

    async startCamera() {
        this.gameStartTime = Date.now();
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

            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            document.getElementById('game-ui').classList.remove('hidden');

            this.startGame();
            this.renderLoop();

        } catch (e) {
            alert("Camera Error: " + e.message);
        }
    }

    startGame() {
        this.score = 0;
        this.mistakes = 0;
        this.roundIndex = 0;

        // Play intro instruction once
        const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
        const u = new SpeechSynthesisUtterance("Listen carefully");
        u.lang = localeMap[this.currentLang] || 'en-US';
        u.rate = 0.9;

        u.onend = () => this.nextRound();
        window.speechSynthesis.speak(u);
    }

    nextRound() {
        this.startTime = Date.now();
        // Unlock
        this.isCommitting = false;

        if (this.roundIndex >= this.questions.length) {
            this.endGame();
            return;
        }

        this.isRoundActive = true;
        this.selectionTimer = 0;
        this.waitForNeutral = true; // FORCE RETURN TO CENTER
        this.updateZoneVisuals(null);

        this.currentQuestion = this.questions[this.roundIndex];
        const q = this.currentQuestion;

        // Set Logic
        this.correctSide = q.correctSide?.toLowerCase() || 'left';

        // UI: HIDE THE TEXT (Audio-only focus)
        this.instruction.textContent = "Listen..."; // Generic Prompt
        this.instruction.classList.add('pulse-anim'); // Add a pulse effect if defined, or just visual cue

        // Play Audio Sequence
        // Priority: 1. Audio File (q.audio) -> 2. TTS Instruction (q.instruction)
        // If both exist, play Audio then Speak Instruction (Chained)
        this.playAudioSequence(q.audio, q.instruction);

        // Update Progress
        const progressText = `${this.roundIndex + 1}/${this.questions.length}`;
        document.getElementById('progress-text').textContent = progressText;
    }

    playAudioSequence(audioUrl, instructionText) {
        // Cancel any pending speech
        window.speechSynthesis.cancel();
        this.roundTimeoutStart = 0; // Reset timer prevents premature timeout

        // Determine Locale
        const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
        const locale = localeMap[this.currentLang] || 'en-US';

        const startTimer = () => {
            this.roundTimeoutStart = Date.now();
        };

        const speakInstruction = () => {
            if (instructionText) {
                const u = new SpeechSynthesisUtterance(instructionText);
                u.lang = locale; // Use mapped locale
                u.rate = 0.9;
                u.onend = startTimer; // Start 6s timer after speech
                window.speechSynthesis.speak(u);
            } else {
                startTimer();
            }
        };

        if (audioUrl && audioUrl.length > 5) {
            try {
                if (audioUrl.startsWith('tts:')) {
                    const parts = audioUrl.split(':');
                    const text = decodeURIComponent(parts[2]);
                    const u = new SpeechSynthesisUtterance(text);
                    u.lang = parts[1] || locale; // Use parsed or locale fallback
                    u.onend = () => speakInstruction();
                    window.speechSynthesis.speak(u);
                } else {
                    const audio = new Audio(audioUrl);
                    audio.onended = () => speakInstruction();
                    audio.play().catch(e => {
                        console.warn("Audio file fail, fallback TTS", e);
                        // Fallback: Speak Word then Instruction
                        if ('speechSynthesis' in window && this.currentQuestion?.correctWord) {
                            const u = new SpeechSynthesisUtterance(this.currentQuestion.correctWord);
                            u.lang = locale; // Fix: Use locale
                            u.onend = () => speakInstruction();
                            window.speechSynthesis.speak(u);
                        } else {
                            speakInstruction();
                        }
                    });
                }
            } catch (e) {
                console.error(e);
                speakInstruction();
            }
        } else {
            speakInstruction();
        }
    }

    handleTimeout() {
        if (!this.isRoundActive) return;
        this.isRoundActive = false;
        this.mistakes++;

        // Show visual feedback for timeout
        const instruction = document.getElementById('instruction-text');
        if (instruction) instruction.textContent = "⌛ Too Slow!";

        // LOG TIMEOUT MISTAKE
        if (this.sessionId && this.currentQuestion) {
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordId: this.currentQuestion.id,
                    correct: false,
                    mistakeType: 'timeout'
                })
            }).catch(console.error);
        }

        setTimeout(() => {
            this.roundIndex++;
            this.nextRound();
        }, 2000);
    }

    async renderLoop() {
        if (!this.detector) return;

        // TIMEOUT CHECK
        if (this.isRoundActive && this.roundTimeoutStart > 0) {
            if (Date.now() - this.roundTimeoutStart > 6000) { // 6s Limit
                this.handleTimeout();
                return;
            }
        }

        try {
            const poses = await this.detector.estimatePoses(this.video);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            if (poses.length > 0) {
                const nose = poses[0].keypoints.find(k => k.name === 'nose');
                if (nose && nose.score > 0.3) {
                    // Draw nose dot
                    this.ctx.fillStyle = 'cyan';
                    this.ctx.beginPath();
                    this.ctx.arc(nose.x, nose.y, 15, 0, 2 * Math.PI);
                    this.ctx.fill();

                    if (this.isRoundActive) {
                        this.checkZone(nose.x);
                    }
                }
            }
        } catch (e) { console.error(e); }

        this.rafId = requestAnimationFrame(() => this.renderLoop());
    }

    // ============================================
    // PHYSICS ENGINE (COPIED FROM GAME 9 - DO NOT TOUCH!)
    // ============================================
    checkZone(x) {
        if (this.canvas.width !== this.video.videoWidth) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        }

        const width = this.canvas.width;
        const normalizedX = x / width;

        // THRESHOLDS (PRESERVED)
        const LEFT_THRESHOLD = 0.40;
        const RIGHT_THRESHOLD = 0.60;

        let detectedSide = null;

        // 1. NEUTRAL CHECK
        if (this.waitForNeutral) {
            const isNeutral = (normalizedX >= LEFT_THRESHOLD && normalizedX <= RIGHT_THRESHOLD);
            if (isNeutral) {
                console.log("Returned to center. Unlocked.");
                this.waitForNeutral = false;
                this.updateZoneVisuals(null); // Clear highlights
            }
            return; // IGNORE until neutral
        }

        // 2. ZONE DETECTION
        // MIRROR FIX: 
        // User moves RIGHT -> Camera sees objects move LEFT (x approaches 0).
        // User moves LEFT -> Camera sees objects move RIGHT (x approaches 1).
        // Since we visually mirror the video with CSS, we must invert the logic to match.

        if (normalizedX < LEFT_THRESHOLD) {
            detectedSide = 'right'; // Raw Left = User Right
        } else if (normalizedX > RIGHT_THRESHOLD) {
            detectedSide = 'left';  // Raw Right = User Left
        } else {
            // In neutral zone, reset timer
            this.selectionTimer = 0;
            this.updateZoneVisuals(null);
            return;
        }

        // 3. TIMER LOGIC
        if (detectedSide) {
            this.selectionTimer++;
            this.updateZoneVisuals(detectedSide, this.selectionTimer);

            if (this.selectionTimer >= this.SELECTION_THRESHOLD) {
                this.commitSelection(detectedSide);
            }
        }
    }

    updateZoneVisuals(side, timerVal = 0) {
        this.leftZone.classList.remove('active');
        this.rightZone.classList.remove('active');

        // Reset loader bars
        document.querySelector('#left-loader .loader-bar').style.width = '0%';
        document.querySelector('#right-loader .loader-bar').style.width = '0%';
        document.getElementById('left-loader').style.opacity = '0';
        document.getElementById('right-loader').style.opacity = '0';

        if (!side) return;

        const zone = side === 'left' ? this.leftZone : this.rightZone;
        const loader = side === 'left' ? document.getElementById('left-loader') : document.getElementById('right-loader');
        const bar = loader.querySelector('.loader-bar');

        zone.classList.add('active');
        loader.style.opacity = '1';

        const pct = Math.min((timerVal / this.SELECTION_THRESHOLD) * 100, 100);
        bar.style.width = `${pct}%`;
    }

    commitSelection(side) {
        if (this.isCommitting) return;
        this.isCommitting = true;
        this.isRoundActive = false; // Stop checking

        const isCorrect = (side === this.correctSide);
        const zone = side === 'left' ? this.leftZone : this.rightZone;

        if (isCorrect) {
            zone.classList.add('correct');
            // Sound?
            const audio = new Audio('../shared/correct.mp3'); // Assuming shared assets
            audio.play().catch(() => { });
            this.score++;
        } else {
            zone.classList.add('wrong');
            const audio = new Audio('../shared/wrong.mp3');
            audio.play().catch(() => { });
            this.mistakes++;
            // LOG MISTAKE
            if (this.sessionId && this.currentQuestion) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wordId: this.currentQuestion.id,
                        correct: false,
                        mistakeType: 'wrong_action',
                        timeSpent: timeSpent
                    })
                }).catch(e => console.error("Track Error", e));
            }
        }

        // LOG SUCCESS
        if (isCorrect && this.sessionId && this.currentQuestion) {
            const timeSpent = (Date.now() - this.startTime) / 1000;
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordId: this.currentQuestion.id,
                    correct: true,
                    timeSpent: timeSpent
                })
            }).catch(e => console.error("Track Error", e));
        }

        // Wait then Next
        setTimeout(() => {
            zone.classList.remove('correct', 'wrong');
            this.roundIndex++;
            this.nextRound();
        }, 1500);
    }

    async endGame() {
        const duration = this.gameStartTime ? (Date.now() - this.gameStartTime) / 1000 : 0;

        if (this.sessionId) {
            try {
                await fetch(`/api/session/${this.sessionId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        score: this.score,
                        mistakes: this.mistakes,
                        failuresBeforePass: this.mistakes, // Mapping for consistent analytics
                        duration: duration
                    })
                });
            } catch (e) { console.error(e); }
        }

        const total = this.questions.length;
        const accuracy = total > 0 ? this.score / total : 0;

        let stars = 1;
        if (accuracy === 1.0) stars = 3;
        else if (accuracy >= 0.5) stars = 2;

        let title = "Great Job!";
        if (stars === 3) title = "Awesome!";
        if (stars === 1) title = "Keep Practicing!";

        this.rs.show({
            success: true,
            overrideStars: stars,
            overrideTitle: title,
            showRetry: !this.sessionId
        });
    }

}

new AudioDetectiveGame();
