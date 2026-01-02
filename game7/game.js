class BeatTheClockGame {
    constructor() {
        this.words = [];
        this.questions = []; // { target: word, choices: [word, word, word] }
        this.currentQ = null;
        this.stats = { correct: 0, wrong: 0, total: 0 };
        this.timer = null;
        this.timeLeft = 0;
        this.MAX_TIME = 5000; // 5 seconds per question
        this.isPaused = false;
        this.currentAttempts = 0; // Track attempts per question (max 2)

        this.grid = document.getElementById('grid-area');
        this.timerBar = document.getElementById('timer-bar');
        this.audioBtn = document.getElementById('audio-indicator');
        this.scoreEl = document.getElementById('score-display');

        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => this.restartGame(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        this.bindEvents();
        this.init();
    }

    unlockTTS() {
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(" ");
            window.speechSynthesis.speak(u);
        }
    }

    async init() {
        await this.loadData();
    }

    bindEvents() {
        document.getElementById('start-btn').addEventListener('click', () => {
            this.unlockTTS();
            this.startGame();
        });
        this.audioBtn.addEventListener('click', () => this.playCurrentAudio());
    }

    async loadData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session');

            let rawWords = [];

            if (sessionId) {
                this.sessionId = sessionId;
                const sessionRes = await fetch(`/api/session/${sessionId}`);
                const session = await sessionRes.json();
                await fetch(`/api/session/${sessionId}/start`, { method: 'POST' });

                this.currentLang = session.lang || 'en';
                const res = await fetch(`/data/${this.currentLang}?t=${Date.now()}`);
                const data = await res.json();

                const validIds = new Set(session.wordIds);
                rawWords = data.words.filter(w => validIds.has(w.id));
            } else {
                this.currentLang = urlParams.get('lang') || 'en';
                const id = urlParams.get('gameId') || 'beatClock';
                const res = await fetch(`/data/${this.currentLang}?t=${Date.now()}`);
                const data = await res.json();

                // Config or Empty
                const ids = data.gameConfig?.[id]?.questions || [];
                if (ids.length > 0) {
                    rawWords = data.words.filter(w => ids.includes(w.id));
                } else {
                    rawWords = [];
                }
            }

            // STRICT FILTER
            this.words = rawWords.filter(w => w.enabled !== false);

            if (this.words.length === 0) {
                document.getElementById('start-screen').innerHTML = '<h1>No words enabled</h1>';
                return;
            }
            this.generateQuestions(10);

            document.getElementById('start-screen').classList.remove('hidden');
        } catch (e) {
            console.error(e);
            alert('Error loading game');
        }
    }

    generateQuestions(count) {
        if (this.words.length < 2) return; // Not enough data

        this.questions = [];
        // Loop count times
        for (let i = 0; i < count; i++) {
            const target = this.words[Math.floor(Math.random() * this.words.length)];

            // Pick distractors
            const choices = [target];
            while (choices.length < 4 && choices.length < this.words.length) {
                const d = this.words[Math.floor(Math.random() * this.words.length)];
                if (!choices.find(c => c.id === d.id)) {
                    choices.push(d);
                }
            }
            // Shuffle choices
            choices.sort(() => Math.random() - 0.5);

            this.questions.push({ target, choices });
        }
    }

    startGame() {
        this.gameStartTime = Date.now();
        if (this.questions.length === 0) {
            alert('Not enough words assigned to play grid!');
            return;
        }
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-area').classList.remove('hidden');
        this.nextRound();
    }

    nextRound() {
        if (this.questions.length === 0) {
            this.gameOver();
            return;
        }

        this.currentQ = this.questions.pop();
        this.currentAttempts = 0; // Reset attempts for new question
        this.renderGrid();

        // Reset Timer
        clearInterval(this.timer);
        this.timerBar.style.width = '100%';
        this.timerBar.classList.remove('danger');
        this.timeLeft = this.MAX_TIME;
        this.isPaused = false;

        // Auto play audio then start timer
        setTimeout(() => {
            this.playCurrentAudio();
            this.startTimer();
        }, 500);
    }

    renderGrid() {
        this.grid.innerHTML = '';
        this.currentQ.choices.forEach(choice => {
            const div = document.createElement('div');
            div.className = 'grid-item';

            const img = document.createElement('img');
            img.src = choice.image || 'https://placehold.co/150';
            div.appendChild(img);

            div.addEventListener('click', () => this.handleChoice(choice, div));
            this.grid.appendChild(div);
        });
    }

    playCurrentAudio() {
        if (!this.currentQ) return;
        const text = this.currentQ.target.word;
        const url = this.currentQ.target.audio;

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

    startTimer() {
        const step = 50; // ms
        this.timer = setInterval(() => {
            if (this.isPaused) return;

            this.timeLeft -= step;
            const pct = (this.timeLeft / this.MAX_TIME) * 100;
            this.timerBar.style.width = `${pct}%`;

            if (this.timeLeft <= 1500) {
                this.timerBar.classList.add('danger');
            }

            if (this.timeLeft <= 0) {
                this.handleTimeout();
            }
        }, step);
    }

    handleChoice(choice, div) {
        if (this.isPaused) return;
        this.isPaused = true;
        clearInterval(this.timer);

        const isCorrect = (choice.id === this.currentQ.target.id);

        if (isCorrect) {
            div.classList.add('correct');
            this.stats.correct++;
            this.scoreEl.innerHTML = `⭐ ${this.stats.correct}`;
            this.trackResult(true);
            setTimeout(() => this.nextRound(), 1000);
        } else {
            this.currentAttempts++;
            div.classList.add('wrong');
            this.trackResult(false);

            if (this.currentAttempts >= 2) {
                // 2nd wrong: Highlight correct one and move on
                this.stats.wrong++;

                // Find and highlight correct choice
                const gridItems = this.grid.querySelectorAll('.grid-item');
                const correctIndex = this.currentQ.choices.findIndex(c => c.id === this.currentQ.target.id);
                if (gridItems[correctIndex]) {
                    gridItems[correctIndex].classList.add('correct');
                }

                setTimeout(() => this.nextRound(), 1500);
            } else {
                // 1st wrong: Allow retry (just shake visual feedback)
                this.isPaused = false; // Resume timer
            }
        }
    }

    handleTimeout() {
        this.isPaused = true;
        clearInterval(this.timer);
        this.stats.wrong++;
        this.trackResult(false);
        // Show timeout msg?
        // Just go next
        setTimeout(() => this.nextRound(), 500);
    }

    trackResult(isCorrect) {
        this.stats.total++;
        if (this.sessionId) {
            let timeSpent = 0;
            if (this.MAX_TIME && this.timeLeft !== undefined) {
                const elapsed = this.MAX_TIME - this.timeLeft;
                timeSpent = Math.max(0, elapsed) / 1000;
            }

            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordId: this.currentQ.target.id,
                    correct: isCorrect,
                    timeSpent: timeSpent
                })
            });
        }
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

    restartGame() {
        this.init();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new BeatTheClockGame();
});
