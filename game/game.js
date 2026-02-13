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

const GAME_STATE = {
    IDLE: 'idle',
    THINKING: 'thinking',
    HAPPY: 'happy',
    CELEBRATE: 'celebrate'
};

class MemoryEchoGame {
    constructor() {
        this.words = [];
        this.currentWordIndex = 0;
        this.currentWord = '';
        this.shuffledLetters = [];
        this.userAttempt = [];
        this.currentAttempts = 0; // Track attempts per question (max 2)

        this.hero = document.getElementById('hero');
        this.wordDisplay = document.getElementById('word-display');
        this.tilesArea = document.getElementById('tiles-area');
        this.startScreen = document.getElementById('start-screen');
        // Local end-screen no longer used, but element exists. We ignore it.

        this.startBtn = document.getElementById('start-btn');
        // Restart logic handled by RS

        // RESULT SCREEN INTEGRATION
        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => this.resetGame(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadData();
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startGame());
    }

    async loadData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session');

            // === LMS SESSION BRANCH ===
            if (sessionId) {
                console.log('Loading Session:', sessionId);
                this.sessionId = sessionId;

                // 1. Fetch Session
                const sessionRes = await fetch(`/api/session/${sessionId}`);
                if (!sessionRes.ok) throw new Error('Session not found');
                const session = await sessionRes.json();

                // 2. Emit Start
                await fetch(`/api/session/${sessionId}/start`, { method: 'POST' });
                this.sessionId = sessionId;

                // 3. Load Words (from lang file, then filter)
                const lang = session.lang || 'en';
                this.currentLang = lang; // Store for TTS
                const response = await fetch(`/data/${lang}?t=${Date.now()}`, {
                    credentials: 'include'
                });
                const data = await response.json();

                const validIds = new Set(session.wordIds);
                this.words = data.words.filter(w => validIds.has(w.id));

                // Shuffle
                this.words.sort(() => Math.random() - 0.5);

                // Initialize Stats
                this.sessionStats = { wrongAttempts: 0 };

                // APPLY BACKGROUND (Fixed)
                const gameId = session.gameId || 'memoryEcho'; // Fallback
                const sessionGameConfig = data.gameConfig?.[gameId] || {};

                if (sessionGameConfig.background) {
                    document.body.style.backgroundImage = `url('${sessionGameConfig.background}')`;
                    document.body.style.backgroundSize = 'cover';
                    document.body.style.backgroundPosition = 'center';
                    document.body.style.backgroundRepeat = 'no-repeat';
                    document.body.style.minHeight = '100vh';
                }

                // APPLY BACKGROUND FROM SESSION if enabled
                // Note: Session object usually has wordIds. Does it have gameConfig?
                // The server might not pass gameConfig in /api/session/:id response directly.
                // However, teacher preview usually loads via URL params or pure data load.
                // If this is a student session, we might need server update to pass bg.
                // FOR NOW: Let's assume if it is a session, we rely on default styles OR if session data has it.
                // Actually, let's leave session background for now unless requested, as it requires server change.
                // Update: To support preview in Editor (which uses local fallback usually, but "Play" button might use session),
                // we should check if data.gameConfig has it.
                // But here we are in "Session Branch". 
                // Let's stick to non-session first as requested for "Editor".

                this.startScreen.classList.remove('hidden');
                this.startBtn.style.display = 'inline-block';
                return;
            }
            // === END LMS SESSION BRANCH ===

            const lang = urlParams.get('lang') || 'en';
            this.currentLang = lang;
            const gameId = urlParams.get('gameId') || 'memoryEcho';

            // Cache-busting added to prevent stale data
            const response = await fetch(`/data/${lang}?t=${Date.now()}`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            // PURE ID-BASED LOADING
            const gameConfig = data.gameConfig?.[gameId] || {};
            const ids = gameConfig.questions || [];



            const questions = ids
                .map(id => data.words.find(w => w.id === id))
                .filter(Boolean);

            if (questions.length === 0) {
                this.words = [];
                this.startScreen.innerHTML = '<h1>No questions to play</h1>';
                this.startScreen.classList.remove('hidden');
                this.startBtn.style.display = 'none';
                return;
            }

            // Shuffle
            questions.sort(() => Math.random() - 0.5);
            this.words = questions;

            // Show start
            this.startScreen.classList.remove('hidden');
            this.startBtn.style.display = 'inline-block';
        } catch (error) {
            console.error('Failed to load data:', error);
            this.words = [];
            this.startScreen.innerHTML = '<h1>Error loading game</h1>';
        }
    }

    setHeroState(state) {
        // Remove all state classes
        Object.values(GAME_STATE).forEach(s => this.hero.classList.remove(s));
        // Add new state
        this.hero.classList.add(state);
    }

    resetGame() {
        this.currentWordIndex = 0;
        this.endScreen.classList.add('hidden');
        this.startGame();
    }

    startGame() {
        this.gameStartTime = Date.now();
        // GUARD: No celebration if no questions
        if (this.words.length === 0) {
            document.body.innerHTML = '<h2>No questions to play</h2>';
            return;
        }

        this.startScreen.classList.add('hidden');
        this.setHeroState(GAME_STATE.IDLE);
        this.nextRound();
    }

    nextRound() {
        this.startTime = Date.now();
        if (this.currentWordIndex >= this.words.length) {
            this.gameWin();
            return;
        }

        this.currentWord = this.words[this.currentWordIndex].word.toLowerCase();
        this.currentAttempts = 0; // Reset attempts for new question
        this.tilesArea.innerHTML = '';
        this.wordDisplay.classList.remove('hidden');
        this.tilesArea.classList.add('hidden');
        this.wordDisplay.textContent = this.currentWord;
        this.setHeroState(GAME_STATE.IDLE);

        // Show Image if available
        const currentItem = this.words[this.currentWordIndex];
        if (currentItem.image) {
            let img = document.getElementById('question-image');
            if (!img) {
                img = document.createElement('img');
                img.id = 'question-image';
                img.style.maxWidth = '200px';
                img.style.maxHeight = '200px';
                img.style.display = 'block';
                img.style.margin = '0 auto 1rem auto';
                // Insert before word display
                this.wordDisplay.parentNode.insertBefore(img, this.wordDisplay);
            }
            img.src = currentItem.image;
            img.classList.remove('hidden');
        } else {
            const img = document.getElementById('question-image');
            if (img) img.classList.add('hidden');
        }

        // Show word for a moment, then speak, then hide
        setTimeout(() => {
            const currentItem = this.words[this.currentWordIndex];
            this.playAudio(this.currentWord, currentItem.audio);
            setTimeout(() => {
                this.hideWordAndIdeallyStart();
            }, 1000); // Wait 1s after starting audio before hiding (or adjust timing)
        }, 1000); // Show word for 1s before audio
    }

    playAudio(text, audioUrl) {
        // Determine Locale
        const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
        const locale = localeMap[this.currentLang] || 'en-US';

        if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play().catch(e => {
                console.error("Audio play failed, fallback TTS", e);
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = locale;
                    window.speechSynthesis.speak(utterance);
                }
            });
        } else if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = locale;
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn('Web Speech API not supported');
        }
    }

    hideWordAndIdeallyStart() {
        this.wordDisplay.textContent = ''; // Clear text
        // Create placeholders
        this.userAttempt = [];
        this.updateWordDisplaySlots();

        // Prepare tiles
        this.shuffledLetters = this.currentWord.split('').sort(() => Math.random() - 0.5);
        this.renderTiles();

        this.tilesArea.classList.remove('hidden');
    }

    updateWordDisplaySlots() {
        this.wordDisplay.innerHTML = '';
        const slotsNeeded = this.currentWord.length;
        for (let i = 0; i < slotsNeeded; i++) {
            const slot = document.createElement('span');
            slot.className = 'slot';
            slot.textContent = this.userAttempt[i] || '';
            this.wordDisplay.appendChild(slot);
        }
    }

    renderTiles() {
        this.tilesArea.innerHTML = '';
        this.shuffledLetters.forEach((letter, index) => {
            // Count how many times this letter appears in shuffled array vs how many used
            // Simple approach: create a tile object for each specific instance
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.textContent = letter;
            tile.dataset.letter = letter;
            tile.dataset.index = index; // Unique ID for this tile instance

            addTouchClick(tile, () => this.handleTileClick(tile, letter));
            this.tilesArea.appendChild(tile);
        });
    }

    handleTileClick(tile, letter) {
        if (tile.classList.contains('used')) return;
        if (this.userAttempt.length >= this.currentWord.length) return;

        // Add letter to attempt
        this.userAttempt.push(letter);
        tile.classList.add('used');
        this.updateWordDisplaySlots();

        // Check if full
        if (this.userAttempt.length === this.currentWord.length) {
            this.checkAnswer();
        }
    }

    checkAnswer() {
        const attemptStr = this.userAttempt.join('');
        const currentId = this.words[this.currentWordIndex].id;

        if (attemptStr === this.currentWord) {
            // Correct
            this.setHeroState(GAME_STATE.HAPPY);

            if (this.sessionId && currentId) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: currentId, correct: true, timeSpent })
                });
            }

            // Play success sound or visual feedback?
            // "Correct -> hero = happy"
            // Wait a bit then next round
            setTimeout(() => {
                this.currentWordIndex++;
                this.nextRound();
            }, 2000);
        } else {
            // Wrong
            this.currentAttempts++;
            this.setHeroState(GAME_STATE.THINKING);
            if (this.sessionStats) this.sessionStats.wrongAttempts++;

            if (this.sessionId && currentId) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: currentId, correct: false, timeSpent })
                });
            }

            if (this.currentAttempts >= 2) {
                // 2nd wrong: Show correct word and move on
                this.wordDisplay.textContent = this.currentWord;
                setTimeout(() => {
                    this.currentWordIndex++;
                    this.nextRound();
                }, 1500);
            } else {
                // 1st wrong: Let student try again
                setTimeout(() => {
                    this.resetRoundState();
                }, 1000);
            }
        }
    }

    resetRoundState() {
        this.userAttempt = [];
        this.updateWordDisplaySlots();
        // Reset tiles
        const tiles = this.tilesArea.querySelectorAll('.tile');
        tiles.forEach(t => t.classList.remove('used'));
    }

    async gameWin() {
        this.setHeroState(GAME_STATE.CELEBRATE);
        this.tilesArea.classList.add('hidden');
        this.wordDisplay.classList.add('hidden');

        const duration = this.gameStartTime ? (Date.now() - this.gameStartTime) / 1000 : 0;

        if (this.sessionId) {
            try {
                await fetch(`/api/session/${this.sessionId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        attempts: this.words.length, // Rough estimate
                        duration: duration
                    })
                });
            } catch (e) { console.error("Complete Error", e); }
        }

        const urlParams = new URLSearchParams(window.location.search);
        this.rs.show({
            success: true,
            attempts: 1,
            lang: urlParams.get('lang') || 'en',
            showRetry: !this.sessionId
        });
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new MemoryEchoGame();
});
