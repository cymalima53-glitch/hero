/**
 * Game 12: Mots Mêlés (Word Search)
 * Classic word search with tap/drag selection and image/audio clues
 */

class WordSearchGame {
    constructor() {
        this.words = [];
        this.grid = [];
        this.gridSize = 10;
        this.foundWords = new Set();
        this.placedWords = [];
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionCells = [];
        this.timer = null;
        this.timeLeft = 120;
        this.sessionId = null;
        this.sessionStats = { wrongAttempts: 0 };
        this.currentLang = 'en';
        this.startTime = null;

        // Elements
        this.startScreen = document.getElementById('start-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.wordGrid = document.getElementById('word-grid');
        this.wordList = document.getElementById('word-list');
        this.clueImage = document.getElementById('clue-image');
        this.audioBtn = document.getElementById('audio-btn');
        this.timeLeftEl = document.getElementById('time-left');
        this.wordsFoundEl = document.getElementById('words-found');
        this.wordsTotalEl = document.getElementById('words-total');

        // Result Screen
        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => this.resetGame(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        // Events
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        this.audioBtn.addEventListener('click', () => this.playCurrentClue());

        this.init();
    }

    async init() {
        await this.loadData();
    }

    async loadData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            this.sessionId = urlParams.get('session');
            const lang = urlParams.get('lang') || 'en';
            this.currentLang = lang;

            if (!this.sessionId) {
                this.startScreen.innerHTML = '<h1>Session Required</h1>';
                return;
            }

            const sRes = await fetch(`/api/session/${this.sessionId}`);
            if (!sRes.ok) throw new Error("Session not found");
            const sessionData = await sRes.json();

            this.currentLang = sessionData.lang || lang;

            let words = sessionData.words || [];
            words = words.filter(w => w.enabled !== false && w.word && w.word.length >= 2);

            if (!words.length) {
                this.startScreen.innerHTML = '<h1>No words available</h1>';
                return;
            }

            // Limit and prepare words (uppercase, only letters, single words)
            words = words.slice(0, 8).map(w => {
                // Take only the first word if there are spaces
                const singleWord = w.word.split(/[\s_]+/)[0] || w.word;
                // Convert to uppercase and keep only letters
                const clean = singleWord.toUpperCase().replace(/[^A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/g, '');
                return {
                    ...w,
                    cleanWord: clean
                };
            }).filter(w => w.cleanWord.length >= 2 && w.cleanWord.length <= 12);

            this.words = words;
            this.startScreen.classList.remove('hidden');

        } catch (error) {
            console.error('Failed to load data:', error);
            this.startScreen.innerHTML = `<h1>Error: ${error.message}</h1>`;
        }
    }

    startGame() {
        this.startScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.startTime = Date.now();

        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/start`, { method: 'POST' });
        }

        // Calculate grid size
        const maxWordLen = Math.max(...this.words.map(w => w.cleanWord.length));
        this.gridSize = Math.max(8, Math.min(15, maxWordLen + 3));

        // Generate grid
        this.generateGrid();
        this.renderGrid();
        this.renderWordList();

        this.wordsTotalEl.textContent = this.words.length;
        this.wordsFoundEl.textContent = '0';

        this.startTimer();
    }

    generateGrid() {
        // Initialize empty grid
        this.grid = Array(this.gridSize).fill(null).map(() =>
            Array(this.gridSize).fill(null)
        );
        this.placedWords = [];

        // Directions: [rowDelta, colDelta]
        // Directions: [rowDelta, colDelta]
        const directions = [
            [0, 1],   // horizontal right (L->R)
            [1, 0],   // vertical down (Top->Bottom)
            [1, 1]    // diagonal down-right
        ];

        // Sort words by length (longest first)
        const sortedWords = [...this.words].sort((a, b) =>
            b.cleanWord.length - a.cleanWord.length
        );

        for (const wordData of sortedWords) {
            const word = wordData.cleanWord;
            let placed = false;

            // Try random positions and directions
            for (let attempts = 0; attempts < 100 && !placed; attempts++) {
                const dir = directions[Math.floor(Math.random() * directions.length)];
                const startRow = Math.floor(Math.random() * this.gridSize);
                const startCol = Math.floor(Math.random() * this.gridSize);

                if (this.canPlaceWord(word, startRow, startCol, dir[0], dir[1])) {
                    this.placeWord(wordData, startRow, startCol, dir[0], dir[1]);
                    placed = true;
                }
            }

            if (!placed) {
                console.warn(`Could not place word: ${word}`);
            }
        }

        // Fill remaining with random letters
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                if (!this.grid[r][c] || typeof this.grid[r][c] !== 'string') {
                    // Force single character
                    this.grid[r][c] = letters.charAt(Math.floor(Math.random() * letters.length));
                }
            }
        }
    }

    canPlaceWord(word, startRow, startCol, rowDir, colDir) {
        const endRow = startRow + (word.length - 1) * rowDir;
        const endCol = startCol + (word.length - 1) * colDir;

        // Check bounds
        if (endRow < 0 || endRow >= this.gridSize || endCol < 0 || endCol >= this.gridSize) {
            return false;
        }
        if (startRow < 0 || startRow >= this.gridSize || startCol < 0 || startCol >= this.gridSize) {
            return false;
        }

        // Check each cell
        for (let i = 0; i < word.length; i++) {
            const r = startRow + i * rowDir;
            const c = startCol + i * colDir;
            const existing = this.grid[r][c];
            if (existing && existing !== word[i]) {
                return false;
            }
        }

        return true;
    }

    placeWord(wordData, startRow, startCol, rowDir, colDir) {
        const word = wordData.cleanWord;
        const cells = [];

        for (let i = 0; i < word.length; i++) {
            const r = startRow + i * rowDir;
            const c = startCol + i * colDir;
            this.grid[r][c] = word[i];
            cells.push({ row: r, col: c });
        }

        this.placedWords.push({
            wordData,
            cells,
            found: false
        });
    }

    renderGrid() {
        this.wordGrid.style.gridTemplateColumns = `repeat(${this.gridSize}, var(--cell-size))`;
        this.wordGrid.innerHTML = '';

        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                // Enforce single character display (defensive fix)
                cell.textContent = String(this.grid[r][c]).charAt(0);
                cell.dataset.row = r;
                cell.dataset.col = c;

                cell.addEventListener('mousedown', (e) => this.onCellDown(e, r, c));
                cell.addEventListener('mouseover', (e) => this.onCellOver(e, r, c));
                cell.addEventListener('mouseup', () => this.onCellUp());
                cell.addEventListener('touchstart', (e) => this.onTouchStart(e, r, c));
                cell.addEventListener('touchmove', (e) => this.onTouchMove(e));
                cell.addEventListener('touchend', () => this.onCellUp());

                this.wordGrid.appendChild(cell);
            }
        }

        document.addEventListener('mouseup', () => this.onCellUp());
    }

    renderWordList() {
        this.wordList.innerHTML = '';

        for (const pw of this.placedWords) {
            const tag = document.createElement('span');
            tag.className = 'word-tag';
            tag.textContent = pw.wordData.word;
            tag.dataset.word = pw.wordData.cleanWord;

            tag.addEventListener('click', () => this.showClue(pw.wordData));

            this.wordList.appendChild(tag);
        }
    }

    showClue(wordData) {
        // Highlight active tag
        document.querySelectorAll('.word-tag').forEach(t => t.classList.remove('active'));
        const tag = document.querySelector(`.word-tag[data-word="${wordData.cleanWord}"]`);
        if (tag) tag.classList.add('active');

        // Show image clue
        if (wordData.image) {
            this.clueImage.src = wordData.image;
            this.clueImage.classList.remove('hidden');
        } else {
            this.clueImage.classList.add('hidden');
        }

        // Show audio button
        if (wordData.audio || wordData.word) {
            this.audioBtn.classList.remove('hidden');
            this.currentClueWord = wordData;
        } else {
            this.audioBtn.classList.add('hidden');
        }
    }

    playCurrentClue() {
        if (this.currentClueWord) {
            this.speak(this.currentClueWord.word, this.currentClueWord.audio);
        }
    }

    onCellDown(e, row, col) {
        e.preventDefault();
        this.isSelecting = true;
        this.selectionStart = { row, col };
        this.updateSelection(row, col);
    }

    onCellOver(e, row, col) {
        if (this.isSelecting) {
            this.updateSelection(row, col);
        }
    }

    onTouchStart(e, row, col) {
        e.preventDefault();
        this.isSelecting = true;
        this.selectionStart = { row, col };
        this.updateSelection(row, col);
    }

    onTouchMove(e) {
        if (!this.isSelecting) return;
        e.preventDefault();

        const touch = e.touches[0];
        const elem = document.elementFromPoint(touch.clientX, touch.clientY);
        if (elem && elem.classList.contains('grid-cell')) {
            const row = parseInt(elem.dataset.row);
            const col = parseInt(elem.dataset.col);
            this.updateSelection(row, col);
        }
    }

    updateSelection(endRow, endCol) {
        // Clear previous selection
        document.querySelectorAll('.grid-cell.selecting').forEach(c =>
            c.classList.remove('selecting')
        );

        const startRow = this.selectionStart.row;
        const startCol = this.selectionStart.col;

        // Calculate direction
        const rowDiff = endRow - startRow;
        const colDiff = endCol - startCol;
        const steps = Math.max(Math.abs(rowDiff), Math.abs(colDiff));

        if (steps === 0) {
            this.selectionCells = [{ row: startRow, col: startCol }];
        } else {
            // Normalize to valid directions only
            const rowDir = rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff);
            const colDir = colDiff === 0 ? 0 : colDiff / Math.abs(colDiff);

            this.selectionCells = [];
            for (let i = 0; i <= steps; i++) {
                this.selectionCells.push({
                    row: startRow + i * rowDir,
                    col: startCol + i * colDir
                });
            }
        }

        // Highlight cells
        for (const cell of this.selectionCells) {
            const elem = document.querySelector(
                `.grid-cell[data-row="${cell.row}"][data-col="${cell.col}"]`
            );
            if (elem) elem.classList.add('selecting');
        }
    }

    onCellUp() {
        if (!this.isSelecting) return;
        this.isSelecting = false;

        // Get selected word
        const selectedWord = this.selectionCells.map(c =>
            this.grid[c.row][c.col]
        ).join('');

        // Check if matches any placed word
        const match = this.placedWords.find(pw =>
            !pw.found && (
                pw.wordData.cleanWord === selectedWord ||
                pw.wordData.cleanWord === selectedWord.split('').reverse().join('')
            )
        );

        if (match) {
            this.foundWord(match);
        } else {
            this.sessionStats.wrongAttempts++;
            // Red flash
            document.querySelectorAll('.grid-cell.selecting').forEach(c => {
                c.style.background = '#fecaca';
                setTimeout(() => c.style.background = '', 300);
            });
        }

        // Clear selection
        document.querySelectorAll('.grid-cell.selecting').forEach(c =>
            c.classList.remove('selecting')
        );
        this.selectionCells = [];
    }

    foundWord(placedWord) {
        placedWord.found = true;
        this.foundWords.add(placedWord.wordData.cleanWord);

        // Mark cells as found
        for (const cell of placedWord.cells) {
            const elem = document.querySelector(
                `.grid-cell[data-row="${cell.row}"][data-col="${cell.col}"]`
            );
            if (elem) {
                elem.classList.remove('selecting');
                elem.classList.add('found');
            }
        }

        // Update word list
        const tag = document.querySelector(`.word-tag[data-word="${placedWord.wordData.cleanWord}"]`);
        if (tag) {
            tag.classList.add('found');
            tag.classList.remove('active');
        }

        // Update score
        this.wordsFoundEl.textContent = this.foundWords.size;

        // Track
        if (this.sessionId) {
            // Word Search tracks mistakes globally, so per-word is 0
            fetch(`/api/session/${this.sessionId}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wordId: placedWord.wordData.id, correct: true, wrong_action: 0 })
            });
        }

        // Speak word
        this.speak(placedWord.wordData.word, placedWord.wordData.audio);

        // Check win
        if (this.foundWords.size >= this.placedWords.length) {
            this.gameWin();
        }
    }

    startTimer() {
        this.timeLeft = 120;
        this.timeLeftEl.textContent = this.timeLeft;

        this.timer = setInterval(() => {
            this.timeLeft--;
            this.timeLeftEl.textContent = this.timeLeft;
            if (this.timeLeft <= 0) this.gameOver();
        }, 1000);
    }

    gameWin() {
        clearInterval(this.timer);

        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accuracy: 100, wrongAttempts: this.sessionStats.wrongAttempts })
            });
        }

        this.rs.show({ success: true, attempts: 1, lang: this.currentLang, showRetry: !this.sessionId });
    }

    gameOver() {
        clearInterval(this.timer);
        const accuracy = Math.round((this.foundWords.size / this.placedWords.length) * 100);

        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accuracy, wrongAttempts: this.sessionStats.wrongAttempts })
            });
        }

        this.rs.show({ success: accuracy >= 60, attempts: 1, lang: this.currentLang, showRetry: !this.sessionId });
    }

    resetGame() {
        this.foundWords.clear();
        clearInterval(this.timer);
        this.gameScreen.classList.add('hidden');
        this.startScreen.classList.remove('hidden');
        this.loadData();
    }

    speak(text, audioUrl) {
        const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES' };
        const locale = localeMap[this.currentLang] || 'en-US';

        if (audioUrl && audioUrl.length > 5 && !audioUrl.startsWith('tts:')) {
            new Audio(audioUrl).play().catch(() => {
                if ('speechSynthesis' in window) {
                    const u = new SpeechSynthesisUtterance(text);
                    u.lang = locale;
                    u.rate = 0.9;
                    window.speechSynthesis.speak(u);
                }
            });
        } else if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = locale;
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new WordSearchGame());
