const GAME_STATE = {
    IDLE: 'idle',
    THINKING: 'thinking',
    HAPPY: 'happy',
    CELEBRATE: 'celebrate'
};

class MultipleChoiceGame {
    constructor() {
        this.words = [];
        this.currentWordIndex = 0;
        this.currentWord = null;
        this.isProcessing = false;
        this.currentAttempts = 0; // NEW: Track attempts per question (max 2)

        this.hero = document.getElementById('hero');
        this.questionText = document.getElementById('question-text');
        this.optionsArea = document.getElementById('options-area');
        this.startScreen = document.getElementById('start-screen');
        this.startBtn = document.getElementById('start-btn');

        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => this.resetGame(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        this.dataPath = '../game/data/en.json';
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

    async loadData() {
        try {
            // STRICT SESSION MODE - NO FALLBACK TO EN.JSON
            const urlParams = new URLSearchParams(window.location.search);
            this.sessionId = urlParams.get('session');
            const lang = urlParams.get('lang') || 'en';
            this.currentLang = lang;

            if (!this.sessionId) {
                this.startScreen.innerHTML = '<h1>Session ID Required</h1>';
                this.startScreen.classList.remove('hidden');
                this.startBtn.style.display = 'none';
                return;
            }

            // Load Session
            const sRes = await fetch(`/api/session/${this.sessionId}`);
            if (!sRes.ok) throw new Error("Session Not Found");
            const sessionData = await sRes.json();

            // Use session's language for TTS pronunciation
            this.currentLang = sessionData.lang || lang;

            // Stats
            this.sessionStats = { wrongAttempts: 0 };

            // CRITICAL FIX: Ensure we only use words that ACTUALLY EXIST in current database
            // Session API already filters deleted words, but double-check here
            let words = sessionData.words || [];

            // Filter out any null/undefined words (deleted from database)
            words = words.filter(w => w && w.id && w.word);

            // Filter: Only include enabled words (treat undefined as enabled)
            words = words.filter(w => w.enabled !== false);

            if (!words.length) {
                this.words = [];
                this.startScreen.innerHTML = '<h1>No words available</h1><p>All words have been deleted or disabled.</p>';
                this.startScreen.classList.remove('hidden');
                this.startBtn.style.display = 'none';
                return;
            }

            // Shuffle
            words.sort(() => Math.random() - 0.5);
            this.words = words;

            // Show start
            this.startScreen.classList.remove('hidden');
            this.startBtn.style.display = 'inline-block';
        } catch (error) {
            console.error('Failed to load data:', error);
            this.words = [];
            this.startScreen.innerHTML = `<h1>Error: ${error.message}</h1>`;
        }
    }

    setHeroState(state) {
        if (this.hero) {
            Object.values(GAME_STATE).forEach(s => this.hero.classList.remove(s));
            this.hero.classList.add(state);
        }
    }

    resetGame() {
        this.currentWordIndex = 0;
        this.startGame();
    }

    startGame() {
        this.gameStartTime = Date.now();
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

        this.currentWord = this.words[this.currentWordIndex];
        this.isProcessing = false;
        this.currentAttempts = 0; // Reset attempts for new question

        this.optionsArea.innerHTML = '';
        this.optionsArea.classList.remove('hidden');
        this.setHeroState(GAME_STATE.IDLE);

        // Show Image if available
        if (this.currentWord.image) {
            let img = document.getElementById('question-image');
            if (!img) {
                img = document.createElement('img');
                img.id = 'question-image';
                img.style.maxWidth = '250px';
                img.style.maxHeight = '250px';
                img.style.display = 'block';
                img.style.margin = '0 auto 1rem auto';
                const promptArea = document.getElementById('prompt-area');
                promptArea.insertBefore(img, promptArea.firstChild);
            }
            img.src = this.currentWord.image;
            img.classList.remove('hidden');
        } else {
            const img = document.getElementById('question-image');
            if (img) img.classList.add('hidden');
        }

        this.generateOptions();

        setTimeout(() => {
            this.playAudio(this.currentWord.word, this.currentWord.audio);
        }, 500);
    }

    generateOptions() {
        let options = [];

        if (this.currentWord.choices && Array.isArray(this.currentWord.choices) && this.currentWord.choices.length > 0) {
            // Use custom choices if defined - DON'T PAD, use exactly what's defined
            const rawChoices = [...this.currentWord.choices];

            // CRITICAL FIX: Ensure correct answer is always included
            if (!rawChoices.includes(this.currentWord.word)) {
                rawChoices.push(this.currentWord.word);
            }

            // Remove duplicates - use ONLY the custom choices, no padding
            const uniqueChoices = [...new Set(rawChoices)];

            options = uniqueChoices.map(w => ({ word: w }));

        } else {
            // Fallback: Generate from all available words
            // FLEXIBLE CHOICE COUNT: Use as many choices as there are words
            const numChoices = this.words.length;

            // Start with correct answer
            options = [this.currentWord];

            // Get other words as distractors
            const otherWords = this.words.filter(w => w.word !== this.currentWord.word);
            otherWords.sort(() => Math.random() - 0.5);

            // Add distractors (numChoices - 1 since we already have correct answer)
            const distractors = otherWords.slice(0, numChoices - 1);
            options = [this.currentWord, ...distractors];

            // Ensure exactly numChoices options
            options = options.slice(0, numChoices);
        }

        // Shuffle options
        options.sort(() => Math.random() - 0.5);

        // Render buttons
        options.forEach(opt => {
            const btn = document.createElement('div');
            btn.className = 'option-btn';
            btn.textContent = opt.word; // Show Text
            btn.addEventListener('click', (e) => this.handleOptionClick(btn, opt));
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
        const locale = localeMap[this.currentLang] || 'en-US';

        // 1. TTS Protocol (Priority)
        const cleanUrl = audioUrl ? audioUrl.trim() : '';
        if (cleanUrl && (cleanUrl.startsWith('tts:') || cleanUrl.match(/^tts:/i))) {
            const [, lang, content] = cleanUrl.split(':');
            if (window.speechSynthesis) window.speechSynthesis.cancel();

            const decodeSafe = (str) => { try { return decodeURIComponent(str); } catch { return str; } };
            const u = new SpeechSynthesisUtterance(decodeSafe(content));
            u.lang = lang || locale;
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
            return;
        }

        // 2. Real File (Defensive)
        // ONLY valid if NOT tts: and length > 4 (.mp3)
        if (cleanUrl && cleanUrl.length > 5 && !cleanUrl.toLowerCase().startsWith('tts:')) {
            if (window.speechSynthesis) window.speechSynthesis.cancel();

            const audio = new Audio(cleanUrl);
            audio.play().catch(e => {
                console.warn("Audio play failed, fallback TTS", e);
                // Fallback to text
                if ('speechSynthesis' in window) {
                    const u = new SpeechSynthesisUtterance(text);
                    u.lang = locale;
                    window.speechSynthesis.speak(u);
                }
            });
        } else if ('speechSynthesis' in window) {
            // 3. Last Resort TTS
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = locale;
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
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

        if (option.word === this.currentWord.word) {
            // Correct
            this.isProcessing = true;
            btn.classList.add('correct');
            this.setHeroState(GAME_STATE.HAPPY);

            if (this.sessionId && currentId) {
                const timeSpent = (Date.now() - this.startTime) / 1000;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: currentId, correct: true, timeSpent })
                });
            }

            setTimeout(() => {
                this.currentWordIndex++;
                this.nextRound();
            }, 1000);
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

                // Find and highlight the correct button
                const buttons = this.optionsArea.querySelectorAll('.option-btn');
                buttons.forEach(b => {
                    if (b.textContent === this.currentWord.word) {
                        b.classList.add('correct');
                    }
                });

                setTimeout(() => {
                    this.currentWordIndex++;
                    this.nextRound();
                }, 1500);
            }
            // If currentAttempts < 2, student can click another option (btn stays marked wrong)
        }
    }

    async gameWin() {
        this.setHeroState(GAME_STATE.CELEBRATE);
        this.optionsArea.classList.add('hidden');

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

        // Show universal celebration
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
    new MultipleChoiceGame();
});
