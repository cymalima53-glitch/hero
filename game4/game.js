const GAME_STATE = {
    IDLE: 'idle',
    THINKING: 'thinking',
    HAPPY: 'happy',
    CELEBRATE: 'celebrate'
};

class FillBlankGame {
    constructor() {
        this.words = [];
        this.currentWordIndex = 0;
        this.currentWord = null;
        this.isProcessing = false;
        this.currentAttempts = 0; // Track attempts per question (max 2)

        this.hero = document.getElementById('hero');
        this.sentenceDisplay = document.getElementById('sentence-display');
        this.optionsArea = document.getElementById('options-area');
        this.startScreen = document.getElementById('start-screen');
        this.startBtn = document.getElementById('start-btn');

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

    resetGame() {
        this.currentWordIndex = 0;
        const localEnd = document.getElementById('end-screen');
        if (localEnd) localEnd.classList.add('hidden');
        this.startGame();
    }

    async gameWin() {
        this.setHeroState(GAME_STATE.CELEBRATE);
        this.optionsArea.classList.add('hidden');
        this.sentenceDisplay.textContent = "";

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

                // Filter for sentence-based words only (containing '__' or '___')
                questions = questions.filter(w => w.word && w.word.includes('__'));

                // Shuffle
                questions.sort(() => Math.random() - 0.5);
                this.words = questions;

                this.sessionStats = { wrongAttempts: 0 };

                this.startScreen.classList.remove('hidden');
                this.startBtn.style.display = 'inline-block';
                return;
            }
            // === END LMS SESSION BRANCH ===

            const lang = urlParams.get('lang') || 'en';
            const gameId = urlParams.get('gameId') || 'fillBlank';

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

            // Filter for sentence-based words only (containing '__' or '___')
            questions = questions.filter(w => w.word && w.word.includes('__'));

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

    startGame() {
        this.gameStartTime = Date.now();
        if (this.words.length === 0) {
            alert("No questions available to play.");
            return;
        }
        this.startScreen.classList.add('hidden');
        this.setHeroState(GAME_STATE.IDLE);
        // Shuffle words for this session
        this.words.sort(() => Math.random() - 0.5);
        this.nextRound();
    }

    nextRound() {
        this.startTime = Date.now();
        if (this.currentWordIndex >= this.words.length) {
            this.gameWin();
            return;
        }

        this.currentWord = this.words[this.currentWordIndex];
        this.isProcessing = false;
        this.currentAttempts = 0; // Reset attempts for new question

        this.renderSentence(); // Show sentence
        this.generateOptions();
        this.setHeroState(GAME_STATE.IDLE);

        // Show Image if available
        if (this.currentWord.image) {
            let img = document.getElementById('question-image');
            if (!img) {
                img = document.createElement('img');
                img.id = 'question-image';
                img.style.maxWidth = '300px';
                img.style.maxHeight = '200px';
                img.style.display = 'block';
                img.style.margin = '0 auto 1rem auto';
                // Insert before sentence
                this.sentenceDisplay.parentNode.insertBefore(img, this.sentenceDisplay);
            }
            img.src = this.currentWord.image;
            img.classList.remove('hidden');
        } else {
            const img = document.getElementById('question-image');
            if (img) img.classList.add('hidden');
        }

        // Play audio automatically ONCE
        setTimeout(() => {
            this.playAudio(this.currentWord.word, this.currentWord.audio);
        }, 500);
    }

    renderSentence() {
        // Just display the text. The '___' is part of the string.
        this.sentenceDisplay.textContent = this.currentWord.word;
    }

    generateOptions() {
        this.optionsArea.innerHTML = '';
        this.optionsArea.classList.remove('hidden');

        let options = [];
        // Fixed: Ensure choices exists
        const choices = this.currentWord.choices || [];

        if (choices.length > 0) {
            // CONVENTION: Index 0 is the correct answer.
            const correct = choices[0];
            const others = choices.slice(1);

            // Create options array with objects { text, isCorrect }
            options.push({ text: correct, isCorrect: true });
            others.forEach(o => options.push({ text: o, isCorrect: false }));

            // Shuffle
            options.sort(() => Math.random() - 0.5);
        } else {
            console.warn("No choices found for word", this.currentWord);
            this.optionsArea.textContent = "Error: No choices defined.";
            return;
        }

        options.forEach(opt => {
            const btn = document.createElement('div');
            btn.className = 'option-btn';
            btn.textContent = opt.text;
            btn.addEventListener('click', () => this.handleOptionClick(btn, opt));
            this.optionsArea.appendChild(btn);
        });
    }

    playAudio(text, audioUrl) {
        if (!window.__ttsUnlocked && 'speechSynthesis' in window) {
            const u0 = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(u0);
            window.__ttsUnlocked = true;
        }

        // Determine Locale
        const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
        // Game 4 doesn't set this.currentLang explicitly in loadData non-session branch?
        // Let's check... Line 118: const lang = ...
        // It doesn't set global. So I should use URL param or ensure it's set.
        const urlParams = new URLSearchParams(window.location.search);
        const langCode = this.currentLang || urlParams.get('lang') || 'en';
        const locale = localeMap[langCode] || 'en-US';

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
                // Fallback
                if ('speechSynthesis' in window) {
                    const spokenText = text.replace(/_+/g, 'blank');
                    const utterance = new SpeechSynthesisUtterance(spokenText);
                    utterance.lang = locale;
                    window.speechSynthesis.speak(utterance);
                }
            });
        } else if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            // Let's replace underscores with 'blank' for TTS logic
            const spokenText = text.replace(/_+/g, 'blank');
            const utterance = new SpeechSynthesisUtterance(spokenText);
            utterance.lang = locale;
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    }

    unlockTTS() {
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(u);
        }
    }

    handleOptionClick(btn, option) {
        if (this.isProcessing) return;

        const currentId = this.currentWord.id;

        if (option.isCorrect) {
            // Correct
            this.isProcessing = true;
            btn.classList.add('correct');

            if (this.sessionId && currentId) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: currentId, correct: true, timeSpent })
                });
            }

            // Update sentence to show the filled word? Visual nicety.
            this.sentenceDisplay.textContent = this.currentWord.word.replace(/_+/g, option.text);

            this.setHeroState(GAME_STATE.HAPPY);

            setTimeout(() => {
                this.currentWordIndex++;
                this.nextRound();
            }, 1500);
        } else {
            // Wrong
            this.currentAttempts++;
            btn.classList.add('wrong');
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
                // 2nd wrong: Show correct answer and move on
                this.isProcessing = true;

                // Find correct answer and highlight it
                const correctAnswer = this.currentWord.choices[0];
                const buttons = this.optionsArea.querySelectorAll('.option-btn');
                buttons.forEach(b => {
                    if (b.textContent === correctAnswer) {
                        b.classList.add('correct');
                    }
                });

                // Fill blank with correct answer
                this.sentenceDisplay.textContent = this.currentWord.word.replace(/_+/g, correctAnswer);

                setTimeout(() => {
                    this.currentWordIndex++;
                    this.nextRound();
                }, 1500);
            }
            // If currentAttempts < 2, student can click another option (btn stays marked wrong)
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FillBlankGame();
});
