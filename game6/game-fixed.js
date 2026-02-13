// Universal Touch-Click Handler for iPad/Mobile Compatibility
function addTouchClick(element, handler) {
    let touchStarted = false;

    element.addEventListener('click', handler);

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
class SoundSwipeGame {
    constructor() {
        this.words = [];
        this.queue = [];
        this.currentCard = null; // { actualWord, shownWord, isMatch }
        this.stats = { correct: 0, wrong: 0, total: 0 };
        this.isLocked = false;
        this.currentAttempts = 0; // Track attempts per card (max 2)

        this.card = document.getElementById('card');
        this.cardImg = document.getElementById('card-image');
        this.speaker = document.getElementById('speaker-icon');

        // Buttons
        this.btnNo = document.getElementById('btn-no');
        this.btnYes = document.getElementById('btn-yes');
        this.btnReplay = document.getElementById('btn-replay');

        // Init Result Screen
        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => this.restartGame(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        // Initialize Hammer.js for swipe
        this.hammer = new Hammer(this.card);
        this.hammer.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL });

        this.init();
    }

    unlockTTS() {
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(u);
        }
    }

    async init() {
        this.bindEvents();
        await this.loadData();
    }

    bindEvents() {
        console.log('[DEBUG] bindEvents called');
        const startBtn = document.getElementById('start-btn');
        console.log('[DEBUG] start-btn element:', startBtn);

        startBtn.addEventListener('click', () => {
            console.log('[DEBUG] Play button clicked!');
            this.unlockTTS();
            console.log('[DEBUG] Calling startGame...');
            this.startGame();
        });

        // HAMMER EVENTS
        this.hammer.on('pan', (e) => this.handlePan(e));
        this.hammer.on('panend', (e) => this.handlePanEnd(e));

        // CLICK FALLBACKS
        addTouchClick(this.btnNo, () => this.animateSwipe('left'));
        addTouchClick(this.btnYes, () => this.animateSwipe('right'));
        addTouchClick(this.btnReplay, () => this.playCurrentAudio());
        addTouchClick(this.speaker, () => this.playCurrentAudio());
    }

    async loadData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session');

            // 1. SESSION MODE
            if (sessionId) {
                this.sessionId = sessionId;
                const sessionRes = await fetch(`/api/session/${sessionId}`);
                const session = await sessionRes.json();
                await fetch(`/api/session/${sessionId}/start`, { method: 'POST' });

                this.currentLang = session.lang || 'en';
                const res = await fetch(`/data/${this.currentLang}?t=${Date.now()}`, { credentials: 'include' });
                const data = await res.json();

                const validIds = new Set(session.wordIds);
                this.words = data.words.filter(w => validIds.has(w.id));
            }
            // 2. OPEN MODE
            else {
                this.currentLang = urlParams.get('lang') || 'en';
                const id = urlParams.get('gameId') || 'soundSwipe';
                const res = await fetch(`/data/${this.currentLang}?t=${Date.now()}`, { credentials: 'include' });
                const data = await res.json();

                // If config exists use it, else use all
                const ids = data.gameConfig?.[id]?.questions || [];
                if (ids.length > 0) {
                    this.words = data.words.filter(w => ids.includes(w.id));
                } else {
                    this.words = []; // NO FALLBACK
                }
            }

            // STRICT FILTER
            this.words = this.words.filter(w => w.enabled !== false);

            if (this.words.length === 0) {
                document.getElementById('start-screen').innerHTML = '<h1>No words enabled</h1>';
                return;
            }

            // Prepare Queue (Make it interesting)
            // For each word, we create 2 scenarios: Match & No-Match? 
            // Or just random? Random stream is better for "Swipe".
            // Let's create a queue of 10-15 cards max per session.
            this.generateQueue(10); // 10 cards per round

            document.getElementById('start-screen').classList.remove('hidden');

        } catch (e) {
            console.error(e);
            alert('Error loading game data');
        }
    }

    generateQueue(count) {
        if (this.words.length < 2) count = this.words.length; // Need at least 2 for mismatches

        this.queue = [];
        for (let i = 0; i < count; i++) {
            // Pick a Target (Audio)
            const target = this.words[Math.floor(Math.random() * this.words.length)];

            // Coin flip for Match vs Mismatch
            const isMatch = Math.random() > 0.5;
            let shown = target;

            if (!isMatch && this.words.length > 1) {
                // Pick different
                do {
                    shown = this.words[Math.floor(Math.random() * this.words.length)];
                } while (shown.id === target.id);
            } else {
                // Forced match if only 1 word exists, or coin flip said match
                shown = target;
            }

            this.queue.push({
                target: target,
                shown: shown,
                isMatch: (target.id === shown.id)
            });
        }
    }

    startGame() {
        console.log('[DEBUG] startGame called');
        console.log('[DEBUG] queue length:', this.queue.length);
        this.gameStartTime = Date.now();
        if (this.queue.length === 0) {
            alert("No words available!");
            return;
        }
        console.log('[DEBUG] Hiding start screen, showing game area');
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-area').classList.remove('hidden');

        this.nextCard();
    }

    resetCardPosition() {
        this.card.style.transform = 'translateX(0) rotate(0deg)';
        this.card.classList.remove('swipe-left', 'swipe-right');
        document.getElementById('swipe-overlay').style.opacity = '0';
    }

    nextCard() {
        this.startTime = Date.now();
        if (this.queue.length === 0) {
            this.gameOver();
            return;
        }

        this.currentCard = this.queue.pop();
        this.isLocked = false;
        this.currentAttempts = 0; // Reset attempts for new card

        // Setup Visuals
        this.cardImg.src = this.currentCard.shown.image || 'https://placehold.co/300x300?text=No+Image';
        this.resetCardPosition();

        // Auto play audio after short delay
        setTimeout(() => this.playCurrentAudio(), 600);
    }

    playCurrentAudio() {
        const text = this.currentCard.target.word;
        const url = this.currentCard.target.audio;

        // Visual indicator
        this.speaker.classList.add('pulse-icon');
        setTimeout(() => this.speaker.classList.remove('pulse-icon'), 1000);

        if (window.speechSynthesis) window.speechSynthesis.cancel();

        if (url && url.startsWith('tts:')) {
            const parts = url.split(':');
            const ttsText = decodeURIComponent(parts[2]);
            const u = new SpeechSynthesisUtterance(ttsText);
            u.lang = parts[1] || 'en-US';
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
        } else if (url) {
            new Audio(url).play().catch(e => console.error(e));
        } else if ('speechSynthesis' in window) {
            const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
            const u = new SpeechSynthesisUtterance(text);
            u.lang = localeMap[this.currentLang] || 'en-US';
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
        }
    }

    // --- INTERACTION LOGIC ---

    handlePan(e) {
        if (this.isLocked) return;
        const deltaX = e.deltaX;
        const rotate = deltaX * 0.1; // Slight rotation

        this.card.style.transform = `translateX(${deltaX}px) rotate(${rotate}deg)`;

        // Visual Feedback during Drag
        const overlay = document.getElementById('swipe-overlay');
        if (deltaX > 50) {
            this.card.classList.add('swipe-right');
            this.card.classList.remove('swipe-left');
            overlay.style.opacity = Math.min(deltaX / 150, 1);
        } else if (deltaX < -50) {
            this.card.classList.add('swipe-left');
            this.card.classList.remove('swipe-right');
            overlay.style.opacity = Math.min(Math.abs(deltaX) / 150, 1);
        } else {
            this.card.classList.remove('swipe-left', 'swipe-right');
            overlay.style.opacity = 0;
        }
    }

    handlePanEnd(e) {
        if (this.isLocked) return;
        const deltaX = e.deltaX;
        const threshold = 100;

        if (deltaX > threshold) {
            this.commitSwipe('right');
        } else if (deltaX < -threshold) {
            this.commitSwipe('left');
        } else {
            // Snap back
            this.card.classList.add('resetting');
            this.resetCardPosition();
            setTimeout(() => this.card.classList.remove('resetting'), 300);
        }
    }

    animateSwipe(dir) {
        if (this.isLocked) return;
        const moveX = dir === 'right' ? 500 : -500;
        const rotate = dir === 'right' ? 30 : -30;

        this.card.style.transition = 'transform 0.4s ease-out';
        this.card.style.transform = `translateX(${moveX}px) rotate(${rotate}deg)`;

        // Add class for overlay color
        this.card.classList.add(dir === 'right' ? 'swipe-right' : 'swipe-left');
        document.getElementById('swipe-overlay').style.opacity = 1;

        this.commitSwipe(dir);
    }

    commitSwipe(dir) {
        this.isLocked = true;
        const didSayYes = (dir === 'right');
        const correctV = this.currentCard.isMatch; // True if they match

        // Rules:
        // Match=True, Yes=True -> Correct
        // Match=False, Yes=False (No) -> Correct
        const isCorrect = (didSayYes === correctV);

        if (isCorrect) {
            this.trackResult(true);
            setTimeout(() => {
                this.nextCard();
            }, 300);
        } else {
            this.currentAttempts++;
            this.trackResult(false);

            if (this.currentAttempts >= 2) {
                // 2nd wrong: Move to next card
                setTimeout(() => {
                    this.nextCard();
                }, 500);
            } else {
                // 1st wrong: Let them try again
                this.resetCardPosition();
                this.isLocked = false;
            }
        }
    }

    trackResult(isCorrect) {
        this.stats.total++;
        if (isCorrect) this.stats.correct++;
        else this.stats.wrong++;

        if (this.sessionId) {
            const timeSpent = (Date.now() - this.startTime) / 1000;
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordId: this.currentCard.target.id,
                    correct: isCorrect,
                    timeSpent: timeSpent
                })
            });
        }
    }

    restartGame() {
        this.init();
    }

    async gameOver() {
        const duration = this.gameStartTime ? (Date.now() - this.gameStartTime) / 1000 : 0;
        if (this.sessionId) {
            try {
                await fetch(`/api/session/${this.sessionId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        attempts: this.stats.total,
                        duration: duration
                    })
                });
            } catch (e) { console.error("Complete Error", e); }
        }

        this.rs.show({
            success: true,
            attempts: this.stats.total,
            showRetry: !this.sessionId
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new SoundSwipeGame();
});
