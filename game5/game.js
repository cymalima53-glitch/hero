const GAME_STATE = {
    IDLE: 'idle',
    THINKING: 'thinking',
    HAPPY: 'happy',
    CELEBRATE: 'celebrate'
};

class TapGame {
    constructor() {
        this.words = [];
        this.currentIndex = 0;
        this.currentWord = null;
        this.isLocked = false;
        this.currentAttempts = 0; // Track attempts per question (max 2)

        // Elements
        this.startScreen = document.getElementById('start-screen');
        this.endScreen = document.getElementById('end-screen');
        this.playArea = document.getElementById('play-area');
        this.sentenceText = document.getElementById('sentence-text');
        this.imageContainer = document.getElementById('image-container');
        this.questionImage = document.getElementById('question-image');
        this.choicesGrid = document.getElementById('choices-grid');
        this.progressFill = document.getElementById('progress-fill');
        this.hero = document.getElementById('hero');

        // Buttons
        document.getElementById('start-btn').addEventListener('click', () => {
            this.unlockTTS();
            this.startGame();
        });
        // Restart logic in RS

        // Result Screen
        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => this.resetGame(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        // Init
        this.loadData();
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
                let questions = data.words.filter(w => validIds.has(w.id));

                // Filter for '___' (required for tap-choice)
                questions = questions.filter(w => w.word && w.word.includes('___'));

                // Shuffle
                questions.sort(() => Math.random() - 0.5);
                this.words = questions;

                this.sessionStats = { wrongAttempts: 0 };

                this.startScreen.classList.remove('hidden');
                return;
            }
            // === END LMS SESSION BRANCH ===

            const lang = urlParams.get('lang') || 'en';
            const gameId = urlParams.get('gameId') || 'tapChoice';

            const res = await fetch(`/data/${lang}?t=${Date.now()}`); // CACHE BUSTING
            if (!res.ok) throw new Error("Load failed");
            const data = await res.json();

            // PURE ID-BASED LOADING
            const ids = data.gameConfig?.[gameId]?.questions || [];
            let questions = ids
                .map(id => data.words.find(w => w.id === id))
                .filter(Boolean);

            // STRICT FILTER
            questions = questions.filter(w => w.enabled !== false);

            // Filter for '___' (required for tap-choice)
            questions = questions.filter(w => w.word && w.word.includes('___'));

            if (questions.length === 0) {
                this.words = [];
                this.startScreen.innerHTML = '<h1>No words enabled</h1>';
                this.startScreen.classList.remove('hidden');
                if (document.getElementById('start-btn')) document.getElementById('start-btn').style.display = 'none';
                return;
            }

            // Shuffle
            questions.sort(() => Math.random() - 0.5);
            this.words = questions;

            // Show start
            this.startScreen.classList.remove('hidden');
        } catch (e) {
            console.error(e);
            this.words = [];
            this.startScreen.innerHTML = '<h1>Error loading game</h1>';
        }
    }

    unlockTTS() {
        // Unlock TTS on user interaction (iOS/Safari requirement)
        if (!this.ttsUnlocked && 'speechSynthesis' in window) {
            const unlock = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(unlock);
            this.ttsUnlocked = true;
        }
    }

    setHero(state) {
        // Just hook logic for now, no visuals required per instruction
        if (this.hero) {
            this.hero.className = `hero ${state} hidden`;
            // 'hidden' because visuals not requested, but state is tracked
        }
    }

    resetGame() {
        this.currentIndex = 0;
        const localEnd = document.getElementById('end-screen');
        if (localEnd) localEnd.classList.add('hidden');
        this.startGame();
    }

    startGame() {
        this.gameStartTime = Date.now();
        if (this.words.length === 0) return;
        this.startScreen.classList.add('hidden');

        // Shuffle questions
        this.words.sort(() => Math.random() - 0.5);

        this.setHero(GAME_STATE.IDLE);
        this.nextRound();
    }

    updateProgress() {
        const pct = (this.currentIndex / this.words.length) * 100;
        this.progressFill.style.width = `${pct}%`;
    }

    nextRound() {
        this.startTime = Date.now();
        if (this.currentIndex >= this.words.length) {
            this.gameWin();
            return;
        }

        this.updateProgress();
        this.currentWord = this.words[this.currentIndex];
        this.isLocked = false;
        this.currentAttempts = 0; // Reset attempts for new question

        // RENDER IMAGE
        if (this.currentWord.image) {
            this.questionImage.src = this.currentWord.image;
            this.imageContainer.classList.remove('hidden');
        } else {
            this.imageContainer.classList.add('hidden');
        }

        // RENDER SENTENCE (with blank)
        this.sentenceText.innerHTML = this.currentWord.word.replace('___', '<span class="blank-highlight">___</span>');

        // RENDER CHOICES
        this.renderChoices();

        // AUDIO (Play once)
        this.playAudio(this.currentWord.audio);
    }

    renderChoices() {
        this.choicesGrid.innerHTML = '';

        const choices = this.currentWord.choices || [];
        if (choices.length === 0) {
            this.choicesGrid.innerText = "Error: No choices defined.";
            return;
        }

        // Prepare choices objects: correct is index 0
        const correctText = choices[0];
        const allOptions = [
            { text: correctText, isCorrect: true },
            ...choices.slice(1).map(txt => ({ text: txt, isCorrect: false }))
        ];

        // Shuffle options
        allOptions.sort(() => Math.random() - 0.5);

        allOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = opt.text;
            btn.addEventListener('click', (e) => this.handleTap(e.target, opt));
            this.choicesGrid.appendChild(btn);
        });
    }

    handleTap(btn, option) {
        // UNLOCK TTS ON FIRST INTERACTION
        if (!this.ttsUnlocked && 'speechSynthesis' in window) {
            const unlock = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(unlock);
            this.ttsUnlocked = true;
        }

        if (this.isLocked) return;

        const currentId = this.currentWord.id;

        if (option.isCorrect) {
            // SUCCESS
            this.isLocked = true;
            btn.classList.add('correct');
            this.setHero(GAME_STATE.HAPPY);

            if (this.sessionId && currentId) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: currentId, correct: true, timeSpent })
                });
            }

            // Fill blank visually
            this.sentenceText.innerHTML = this.currentWord.word.replace('___', `<span class="blank-highlight">${option.text}</span>`);

            setTimeout(() => {
                this.currentIndex++;
                this.nextRound();
            }, 1000);

        } else {
            // FAIL
            this.currentAttempts++;
            btn.classList.add('wrong');
            this.setHero(GAME_STATE.THINKING);

            if (this.sessionStats) this.sessionStats.wrongAttempts++;

            if (this.sessionId && currentId) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: currentId, correct: false, mistakeType: 'wrong_action', timeSpent })
                });
            }

            if (this.currentAttempts >= 2) {
                // 2nd wrong: Show correct answer and move on
                this.isLocked = true;

                // Find correct answer (index 0 of choices) and highlight
                const correctAnswer = this.currentWord.choices[0];
                const buttons = this.choicesGrid.querySelectorAll('.choice-btn');
                buttons.forEach(b => {
                    if (b.textContent === correctAnswer) {
                        b.classList.add('correct');
                    }
                });

                // Fill blank with correct answer
                this.sentenceText.innerHTML = this.currentWord.word.replace('___', `<span class="blank-highlight">${correctAnswer}</span>`);

                setTimeout(() => {
                    this.currentIndex++;
                    this.nextRound();
                }, 1500);
            }
            // If currentAttempts < 2, student can click another option (btn stays marked wrong)
        }
    }

    playAudio(url) {
        if (!window.__ttsUnlocked && 'speechSynthesis' in window) {
            const u0 = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(u0);
            window.__ttsUnlocked = true;
        }

        // Determine Locale
        const urlParams = new URLSearchParams(window.location.search);
        const langCode = this.currentLang || urlParams.get('lang') || 'en'; // Ensure fallback
        const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
        const locale = localeMap[langCode] || 'en-US';

        if (url && url.startsWith('tts:')) {
            const [, lang, content] = url.split(':');
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(decodeURIComponent(content));
            u.lang = lang || locale;
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
            return;
        }

        if (url) {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            new Audio(url).play().catch(e => {
                console.log('Audio error, fallback TTS:', e);
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(this.currentWord.word.replace(/___/g, 'blank'));
                    utterance.lang = locale;
                    window.speechSynthesis.speak(utterance);
                }
            });
        } else if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Local cancel only
            const utterance = new SpeechSynthesisUtterance(this.currentWord.word.replace(/___/g, 'blank'));
            utterance.lang = locale;
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    }

    async gameWin() {
        this.progressFill.style.width = '100%';
        this.setHero(GAME_STATE.CELEBRATE);

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

        // Removed local end screen show: this.endScreen.classList.remove('hidden');

        const urlParams = new URLSearchParams(window.location.search);
        const lang = urlParams.get('lang') || 'en';

        this.rs.show({
            success: true,
            attempts: 1,
            lang: lang,
            showRetry: !this.sessionId
        });
    }
}

// Start
window.onload = () => {
    new TapGame();
};
