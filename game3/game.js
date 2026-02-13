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

class MatchPairsGame {
    constructor() {
        this.words = [];
        this.cards = [];
        this.flippedCards = [];
        this.matchedPairs = 0;
        this.isLocked = false;

        this.hero = document.getElementById('hero');
        this.gridArea = document.getElementById('grid-area');
        this.startScreen = document.getElementById('start-screen');
        // Local end-screen ignored
        this.startBtn = document.getElementById('start-btn');
        // Restart logic in RS

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
        this.startBtn.addEventListener('click', () => {
            this.unlockTTS();
            this.startGame();
        });
    }

    // ...

    unlockTTS() {
        if (!window.__ttsUnlocked && 'speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(u);
            window.__ttsUnlocked = true;
        }
    }

    // ...

    resetGame() {
        const localEnd = document.getElementById('end-screen');
        if (localEnd) localEnd.classList.add('hidden');
        this.startGame();
    }

    // ... inside gameWin ...

    gameWin() {
        this.setHeroState(GAME_STATE.CELEBRATE);

        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attempts: (this.matchedPairs) + (this.sessionStats?.wrongAttempts || 0),
                    failuresBeforePass: this.sessionStats?.wrongAttempts || 0
                })
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const lang = urlParams.get('lang') || 'en';

        // Wait a small moment for final match celebration visibility
        setTimeout(() => {
            this.rs.show({
                success: true,
                attempts: 1,
                lang: lang
            });
        }, 1000);
    }

    async loadData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session');

            // === LMS SESSION BRANCH ===
            if (sessionId) {
                // 1. Fetch Session
                const sessionRes = await fetch(`/api/session/${sessionId}`);
                if (!sessionRes.ok) throw new Error('Session not found');
                const session = await sessionRes.json();

                // 2. Emit Start
                await fetch(`/api/session/${sessionId}/start`, { method: 'POST' });
                this.sessionId = sessionId;

                // 3. Load Words
                const lang = session.lang || 'en';
                this.currentLang = lang; // Store for TTS
                const response = await fetch(`/data/${lang}?t=${Date.now()}`);
                const data = await response.json();

                const validIds = new Set(session.wordIds);
                this.words = data.words.filter(w => validIds.has(w.id));

                // Shuffle
                this.words.sort(() => Math.random() - 0.5);

                this.sessionStats = { wrongAttempts: 0 };

                this.startScreen.classList.remove('hidden');
                this.startBtn.style.display = 'inline-block';
                return;
            }
            // === END LMS SESSION BRANCH ===

            const lang = urlParams.get('lang') || 'en';
            const gameId = urlParams.get('gameId') || 'matchPairs';

            // Cache-busting
            const response = await fetch(`/data/${lang}?t=${Date.now()}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            // PURE ID-BASED LOADING
            const ids = data.gameConfig?.[gameId]?.questions || [];
            let questions = ids
                .map(id => data.words.find(w => w.id === id))
                .filter(Boolean);

            // STRICT FILTER
            questions = questions.filter(w => w.enabled !== false);

            if (questions.length === 0) {
                this.words = [];
                this.startScreen.innerHTML = '<h1>No words enabled</h1>';
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
        if (this.hero) {
            Object.values(GAME_STATE).forEach(s => this.hero.classList.remove(s));
            this.hero.classList.add(state);
        }
    }

    resetGame() {
        this.endScreen.classList.add('hidden');
        this.startGame();
    }

    startGame() {
        this.gameStartTime = Date.now();
        this.startScreen.classList.add('hidden');
        this.setHeroState(GAME_STATE.IDLE);
        this.setupGrid();
    }

    setupGrid() {
        this.gridArea.innerHTML = '';
        this.flippedCards = [];
        this.matchedPairs = 0;
        this.isLocked = false;
        this.startTime = Date.now();

        // Pick up to 20 random words (for 40 cards max)
        // Shuffle words and slice
        const gameWords = [...this.words].sort(() => Math.random() - 0.5).slice(0, 20);

        // Create pairs
        let deck = [];
        gameWords.forEach(w => {
            // Card 1: Text
            deck.push({
                id: w.word + '-text',
                matchId: w.word,
                type: 'text',
                content: w.word
            });
            // Card 2: Audio
            deck.push({
                id: w.word + '-audio',
                matchId: w.word,
                type: 'audio',
                content: '🔊', // Speaker icon
                image: w.image || null // Pass image if exists
            });
        });

        // Shuffle deck
        deck.sort(() => Math.random() - 0.5);
        this.cards = deck;

        // Render
        deck.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.matchId = item.matchId;
            card.dataset.type = item.type;
            card.dataset.content = item.content; // Helper for audio trigger

            const inner = document.createElement('div');
            inner.className = 'card-inner';

            const front = document.createElement('div');
            front.className = 'card-front';

            if (item.image) {
                const img = document.createElement('img');
                img.src = item.image;
                front.appendChild(img);
            } else {
                front.textContent = item.content;
                if (item.type === 'audio') front.classList.add('icon');
            }

            const back = document.createElement('div');
            back.className = 'card-back';
            back.textContent = '?';

            inner.appendChild(front);
            inner.appendChild(back);
            card.appendChild(inner);

            card.addEventListener('click', () => this.handleCardClick(card, item));
            this.gridArea.appendChild(card);
        });
    }

    handleCardClick(card, item) {
        if (this.isLocked) return;
        if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

        // Flip logic
        this.flipCard(card);

        // Play audio if it's an audio card being revealed
        if (item.type === 'audio') {
            // Find the original word object to get the audio URL
            // item.matchId is the word string
            const wordObj = this.words.find(w => w.word === item.matchId);
            const audioUrl = wordObj ? wordObj.audio : '';
            this.playAudio(item.matchId, audioUrl);
        }

        this.flippedCards.push({ card, item });

        if (this.flippedCards.length === 2) {
            this.checkForMatch();
        }
    }

    flipCard(card) {
        card.classList.add('flipped');
    }

    unflipCard(card) {
        card.classList.remove('flipped');
    }

    checkForMatch() {
        this.isLocked = true;
        const [first, second] = this.flippedCards;

        // Find ID
        const wordObj = this.words.find(w => w.word === first.item.matchId);
        const currentId = wordObj ? wordObj.id : null;

        if (first.item.matchId === second.item.matchId) {
            // Match
            first.card.classList.add('matched');
            second.card.classList.add('matched');
            this.setHeroState(GAME_STATE.HAPPY);
            this.matchedPairs++;

            if (this.sessionId && currentId) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: currentId, correct: true, timeSpent })
                });
            }

            this.resetTurn();

            // Check win
            if (this.matchedPairs === (this.cards.length / 2)) { // Dynamic check
                setTimeout(() => this.gameWin(), 500);
            }
        } else {
            // No Match
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

            setTimeout(() => {
                this.unflipCard(first.card);
                this.unflipCard(second.card);
                this.setHeroState(GAME_STATE.IDLE);
                this.resetTurn();
            }, 1000);
        }
    }

    resetTurn() {
        this.startTime = Date.now();
        this.flippedCards = [];
        this.isLocked = false;
    }

    playAudio(text, audioUrl) {
        if (!window.__ttsUnlocked && 'speechSynthesis' in window) {
            const u0 = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(u0);
            window.__ttsUnlocked = true;
        }

        // Determine Locale
        const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
        const locale = localeMap[this.currentLang] || 'en-US'; // urlParams.get('lang') logic is in loadData so this.currentLang might be missing if not set in class?
        // Wait, MatchPairsGame doesn't explicitly store this.currentLang in all branches of loadData?
        // Checking loadData: Line 126 in Game 3 gets lang, but doesn't set `this.currentLang` in the non-session branch??
        // Line 126: const lang = ... 
        // Logic check: I need to ensure this.currentLang is set.
        // Actually, let's just parse it again if missing, or default to en-US.
        // Better: use urlParams.get('lang') fallback.

        if (audioUrl && audioUrl.startsWith('tts:')) {
            const [, lang, content] = audioUrl.split(':');
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(decodeURIComponent(content));
            u.lang = lang || locale;
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
            return;
        }

        if (audioUrl) {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            new Audio(audioUrl).play().catch(e => {
                console.warn("Audio play failed", e);
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = locale;
                    window.speechSynthesis.speak(utterance);
                }
            });
        } else if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = locale;
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    }

    async gameWin() {
        this.setHeroState(GAME_STATE.CELEBRATE);
        // this.endScreen.classList.remove('hidden'); // Removed manual handling

        const duration = this.gameStartTime ? (Date.now() - this.gameStartTime) / 1000 : 0;

        if (this.sessionId) {
            try {
                await fetch(`/api/session/${this.sessionId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        attempts: this.words.length + (this.sessionStats?.wrongAttempts || 0),
                        failuresBeforePass: this.sessionStats?.wrongAttempts || 0,
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

document.addEventListener('DOMContentLoaded', () => {
    new MatchPairsGame();
});
