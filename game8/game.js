class SoundDragGame {
    constructor() {
        this.words = [];
        this.questions = [];
        this.currentQ = null;
        this.stats = { correct: 0, wrong: 0, total: 0 };
        this.isDragging = false;
        this.currentAttempts = 0; // Track attempts per question (max 2)

        // Drag Physics
        this.dragOffset = { x: 0, y: 0 };
        this.startPos = { x: 0, y: 0 }; // Initial screen pos of container

        this.dragEl = document.getElementById('draggable-speaker');
        this.dropContainer = document.getElementById('drop-zones');
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

        // DRAG EVENTS (Mouse & Touch)
        const el = this.dragEl;

        el.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Fix left click drag & selection
            this.startDrag(e.clientX, e.clientY);
        });

        el.addEventListener('touchstart', (e) => {
            if (e.cancelable) e.preventDefault();
            this.startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) e.preventDefault();
            this.moveDrag(e.clientX, e.clientY);
        });

        document.addEventListener('touchmove', (e) => {
            if (this.isDragging && e.cancelable) e.preventDefault();
            this.moveDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        document.addEventListener('mouseup', () => this.endDrag());
        document.addEventListener('touchend', () => this.endDrag());
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
                const id = urlParams.get('gameId') || 'soundDrag';
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
        if (this.words.length < 2) count = this.words.length;
        this.questions = [];
        for (let i = 0; i < count; i++) {
            const target = this.words[Math.floor(Math.random() * this.words.length)];
            const choices = [target];
            // Add 2 distractors
            while (choices.length < 3 && choices.length < this.words.length) {
                const d = this.words[Math.floor(Math.random() * this.words.length)];
                if (!choices.find(c => c.id === d.id)) choices.push(d);
            }
            choices.sort(() => Math.random() - 0.5);
            this.questions.push({ target, choices });
        }
    }

    startGame() {
        this.gameStartTime = Date.now();
        if (this.questions.length === 0) return;
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-area').classList.remove('hidden');

        // Position Draggable in its visual container
        this.resetDraggablePosition();
        this.nextRound();
    }

    resetDraggablePosition() {
        const container = document.getElementById('drag-source-container');
        const rect = container.getBoundingClientRect();
        // Center it
        this.startPos = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };

        this.dragEl.style.left = (this.startPos.x - 40) + 'px'; // -40 for half width
        this.dragEl.style.top = (this.startPos.y - 40) + 'px';
        this.dragEl.classList.remove('returning');
    }

    nextRound() {
        this.startTime = Date.now();
        if (this.questions.length === 0) {
            this.gameOver();
            return;
        }

        this.currentQ = this.questions.pop();
        this.currentAttempts = 0; // Reset attempts for new question
        this.renderZones();

        // Snap back to start
        this.dragEl.classList.add('returning');
        this.resetDraggablePosition();
        setTimeout(() => this.dragEl.classList.remove('returning'), 300);

        // Play audio
        setTimeout(() => this.playCurrentAudio(), 500);
    }

    renderZones() {
        this.dropContainer.innerHTML = '';
        this.currentQ.choices.forEach(choice => {
            const div = document.createElement('div');
            div.className = 'drop-zone';
            div.dataset.id = choice.id;

            const img = document.createElement('img');
            img.src = choice.image || 'https://placehold.co/150';
            div.appendChild(img);

            this.dropContainer.appendChild(div);
        });
    }

    playCurrentAudio() {
        const text = this.currentQ.target.word;
        const url = this.currentQ.target.audio;

        // Visual Bounce
        this.dragEl.style.transform = 'scale(1.2)';
        setTimeout(() => this.dragEl.style.transform = 'scale(1)', 200);

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

    // --- DRAG LOGIC ---
    startDrag(cx, cy) {
        if (this.questions.length === 0 && !this.currentQ) return;
        this.isDragging = true;
        this.dragEl.classList.add('dragging');

        this.playCurrentAudio(); // Replay on touch

        // Calc offset
        const rect = this.dragEl.getBoundingClientRect();
        this.dragOffset.x = cx - rect.left;
        this.dragOffset.y = cy - rect.top;
    }

    moveDrag(cx, cy) {
        if (!this.isDragging) return;

        // Prevent default touch scrolling
        if (event.type === 'touchmove') event.preventDefault();

        const parentRect = this.dragEl.parentElement.getBoundingClientRect();

        // Calculate new position relative to parent
        // x = (viewportMouse - parentViewport) - mouseOffsetInsideElement
        const x = cx - parentRect.left - this.dragOffset.x;
        const y = cy - parentRect.top - this.dragOffset.y;

        this.dragEl.style.left = x + 'px';
        this.dragEl.style.top = y + 'px';

        // Check Highlight
        this.checkHover(cx, cy);
    }

    endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.dragEl.classList.remove('dragging');

        // Check Drop
        const drop = this.getDropZoneAt(this.dragEl.getBoundingClientRect());
        if (drop) {
            this.handleDrop(drop);
        } else {
            // Return home
            this.dragEl.classList.add('returning');
            this.resetDraggablePosition();
            setTimeout(() => this.dragEl.classList.remove('returning'), 300);
        }
    }

    checkHover(x, y) {
        document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('active'));
        // We check center of draggable
        const rect = this.dragEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        // Simple Hit Test
        const zones = document.querySelectorAll('.drop-zone');
        zones.forEach(z => {
            const zr = z.getBoundingClientRect();
            if (cx >= zr.left && cx <= zr.right && cy >= zr.top && cy <= zr.bottom) {
                z.classList.add('active');
            }
        });
    }

    getDropZoneAt(dragRect) {
        const cx = dragRect.left + dragRect.width / 2;
        const cy = dragRect.top + dragRect.height / 2;

        let found = null;
        document.querySelectorAll('.drop-zone').forEach(z => {
            const zr = z.getBoundingClientRect();
            if (cx >= zr.left && cx <= zr.right && cy >= zr.top && cy <= zr.bottom) {
                found = z;
            }
        });
        return found;
    }

    handleDrop(zone) {
        const choiceId = zone.dataset.id;
        const isCorrect = (choiceId === this.currentQ.target.id);

        if (isCorrect) {
            zone.classList.add('correct');
            this.stats.correct++;
            this.scoreEl.innerHTML = `⭐ ${this.stats.correct}`;
            this.trackResult(true);
            setTimeout(() => this.nextRound(), 1000);
        } else {
            this.currentAttempts++;
            zone.classList.add('wrong');
            this.trackResult(false);

            if (this.currentAttempts >= 2) {
                // 2nd wrong: Show correct and move on
                this.stats.wrong++;

                // Highlight correct drop zone
                document.querySelectorAll('.drop-zone').forEach(z => {
                    if (z.dataset.id === this.currentQ.target.id) {
                        z.classList.add('correct');
                    }
                });

                setTimeout(() => {
                    zone.classList.remove('wrong');
                    this.nextRound();
                }, 1500);
            } else {
                // 1st wrong: Return speaker and let them try again
                setTimeout(() => {
                    zone.classList.remove('wrong');
                    this.dragEl.classList.add('returning');
                    this.resetDraggablePosition();
                    setTimeout(() => this.dragEl.classList.remove('returning'), 300);
                }, 500);
            }
        }
    }

    trackResult(isCorrect) {
        this.stats.total++;
        if (this.sessionId) {
            const timeSpent = (Date.now() - this.startTime) / 1000;
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
        this.stats = { correct: 0, wrong: 0, total: 0 };
        this.scoreEl.innerHTML = `⭐ 0`;
        this.init();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new SoundDragGame();
});
