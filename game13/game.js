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
/**
 * Game 13: Mots Croisés (Crossword)
 * Classic crossword with text/image/audio clues
 */

class CrosswordGame {
    constructor() {
        this.words = [];
        this.grid = [];
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.placedWords = [];
        this.selectedWord = null;
        this.selectedCell = null;
        this.completedWords = new Set();
        this.timer = null;
        this.timeLeft = 180;
        this.sessionId = null;
        this.sessionStats = { wrongAttempts: 0 };
        this.currentLang = 'en';

        // Elements
        this.foundWords = new Set(); // Using Set for unique word IDs
        this.wordWrongCounts = {}; // NEW: Track mistakes per word
        this.startScreen = document.getElementById('start-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.crosswordGrid = document.getElementById('crossword-grid');
        this.clueDirection = document.getElementById('clue-direction');
        this.clueText = document.getElementById('clue-text');
        this.clueImage = document.getElementById('clue-image');
        this.audioBtn = document.getElementById('audio-btn');
        this.timeLeftEl = document.getElementById('time-left');
        this.wordsDoneEl = document.getElementById('words-done');
        this.wordsTotalEl = document.getElementById('words-total');
        this.suggestionBox = document.getElementById('suggestion-box');

        // Result Screen
        this.rs = new ResultScreen({
            container: '#game-container',
            onRetry: () => this.resetGame(),
            onNext: () => window.location.href = '/student/index.html?next=true'
        });

        // Events
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        addTouchClick(this.audioBtn, () => this.playAudio());

        // Keyboard events
        document.querySelectorAll('#keyboard button').forEach(btn => {
            addTouchClick(btn, () => this.onKeyPress(btn.dataset.key));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') this.onKeyPress('⌫');
            else if (/^[a-zA-ZÀ-ÿ]$/.test(e.key)) this.onKeyPress(e.key.toUpperCase());
        });

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
                // If checking gameId for preview mode
                const gameId = urlParams.get('gameId');
                if (gameId) {
                    // 2. OPEN MODE
                    this.currentLang = urlParams.get('lang') || 'en';
                    const res = await fetch(`/data/${this.currentLang}?t=${Date.now()}`);
                    const data = await res.json();

                    // If config exists use it, else use all
                    const ids = data.gameConfig?.[gameId]?.questions || [];
                    let words = [];
                    if (ids.length > 0) {
                        words = data.words.filter(w => ids.includes(w.id));
                    } else {
                        // If no config, maybe empty or all? Let's default to empty to be safe or grab random?
                        // For preview, let's grab random 20 if none selected
                        words = data.words.slice(0, 20);
                    }
                    this.processWords(words);
                    return;
                }

                this.startScreen.innerHTML = '<h1>Session Required</h1>';
                return;
            }

            const sRes = await fetch(`/api/session/${this.sessionId}`);
            if (!sRes.ok) throw new Error("Session not found");
            const sessionData = await sRes.json();

            this.currentLang = sessionData.lang || lang;

            let words = sessionData.wordIds ? [] : (sessionData.words || []);
            // If wordIds exists, we need to fetch data/lang to get word objects if they aren't in sessionData
            // Actually sessionData usually has words populated if using the right endpoint, but let's check.
            // The old code assumed sessionData.words.
            // If not, we might need to fetch /data/lang.
            // Let's stick to what was there: sessionData.words

            if (!words.length && sessionData.wordIds) {
                // Fetch words if only IDs
                const res = await fetch(`/data/${this.currentLang}?t=${Date.now()}`);
                const data = await res.json();
                const validIds = new Set(sessionData.wordIds);
                words = data.words.filter(w => validIds.has(w.id));
            }

            this.processWords(words);

        } catch (error) {
            console.error('Failed to load data:', error);
            this.startScreen.innerHTML = `<h1>Error: ${error.message}</h1>`;
        }
    }

    processWords(words) {
        words = words.filter(w => w.enabled !== false && w.word && w.word.length >= 2);

        if (!words.length) {
            this.startScreen.innerHTML = '<h1>No words available</h1>';
            return;
        }

        // Prepare words
        this.words = words.slice(0, 20).map(w => ({
            ...w,
            cleanWord: w.word.toUpperCase().replace(/[^A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/g, ''),
            clueType: w.clueType || (w.textClue ? 'text' : (w.image ? 'image' : 'audio'))
        })).filter(w => w.cleanWord.length >= 2);

        if (this.words.length === 0) {
            this.startScreen.innerHTML = '<h1>No valid words available</h1>';
            return;
        }

        this.startScreen.classList.remove('hidden');
    }

    startGame() {
        if (!this.words || this.words.length === 0) return;

        this.startScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');

        if (this.sessionId) {
            fetch(`/api/session/${this.sessionId}/start`, { method: 'POST' });
        }

        this.generateCrossword();
        if (this.placedWords.length === 0) {
            this.gameScreen.classList.add('hidden');
            this.startScreen.classList.remove('hidden');
            this.startScreen.innerHTML = '<h1>Could not generate crossword</h1>';
            return;
        }
        this.renderGrid();

        this.wordsTotalEl.textContent = this.placedWords.length;
        this.wordsDoneEl.textContent = '0';

        // Select first word
        if (this.placedWords.length > 0) {
            this.selectWord(this.placedWords[0]);
        }

        this.startTimer();
    }

    generateCrossword() {
        // Sort words by length (longest first for better placement)
        const sortedWords = [...this.words].sort((a, b) =>
            b.cleanWord.length - a.cleanWord.length
        );

        this.placedWords = [];

        // Simple crossword generation: place words one by one
        // Start with largest grid possible, then find bounds later
        const MAX = 60; // Increased for 20 words
        const tempGrid = Array(MAX).fill(null).map(() => Array(MAX).fill(null));
        const center = Math.floor(MAX / 2);

        for (let i = 0; i < sortedWords.length; i++) {
            const wordData = sortedWords[i];
            const word = wordData.cleanWord;

            if (i === 0) {
                // Place first word horizontally in center
                const startCol = center - Math.floor(word.length / 2);
                this.placeWordInTemp(tempGrid, wordData, center, startCol, 0, 1, i + 1);
            } else {
                // Try to find intersection with existing words
                let placed = false;

                for (const pw of this.placedWords) {
                    if (placed) break;

                    for (let pi = 0; pi < pw.cleanWord.length && !placed; pi++) {
                        for (let wi = 0; wi < word.length && !placed; wi++) {
                            if (pw.cleanWord[pi] === word[wi]) {
                                // Try perpendicular placement
                                const newDir = pw.direction === 'across' ? 'down' : 'across';
                                const rowDir = newDir === 'down' ? 1 : 0;
                                const colDir = newDir === 'across' ? 1 : 0;

                                const startRow = pw.cells[pi].row - wi * rowDir;
                                const startCol = pw.cells[pi].col - wi * colDir;

                                if (this.canPlaceInTemp(tempGrid, word, startRow, startCol, rowDir, colDir)) {
                                    this.placeWordInTemp(tempGrid, wordData, startRow, startCol, rowDir, colDir, i + 1);
                                    placed = true;
                                }
                            }
                        }
                    }
                }

                // If no intersection found, place adjacent
                if (!placed) {
                    const lastWord = this.placedWords[this.placedWords.length - 1];
                    const lastCell = lastWord.cells[lastWord.cells.length - 1];
                    const newRow = lastCell.row + 2;

                    // Ensure we don't go out of bounds
                    if (newRow < MAX && this.canPlaceInTemp(tempGrid, word, newRow, center - Math.floor(word.length / 2), 0, 1)) {
                        this.placeWordInTemp(tempGrid, wordData, newRow, center - Math.floor(word.length / 2), 0, 1, i + 1);
                    }
                }
            }
        }

        if (this.placedWords.length === 0) return;

        // Find bounds and create final grid
        let minRow = MAX, maxRow = 0, minCol = MAX, maxCol = 0;
        for (const pw of this.placedWords) {
            for (const cell of pw.cells) {
                minRow = Math.min(minRow, cell.row);
                maxRow = Math.max(maxRow, cell.row);
                minCol = Math.min(minCol, cell.col);
                maxCol = Math.max(maxCol, cell.col);
            }
        }

        // Add padding
        minRow = Math.max(0, minRow - 1);
        minCol = Math.max(0, minCol - 1);
        maxRow = Math.min(MAX - 1, maxRow + 1);
        maxCol = Math.min(MAX - 1, maxCol + 1);

        this.gridHeight = maxRow - minRow + 1;
        this.gridWidth = maxCol - minCol + 1;

        if (this.gridHeight <= 0 || this.gridWidth <= 0) return; // Safety check

        // Create final grid with offset
        this.grid = Array(this.gridHeight).fill(null).map(() =>
            Array(this.gridWidth).fill(null)
        );

        // Remap placed words to new coordinates
        for (const pw of this.placedWords) {
            pw.cells = pw.cells.map(c => ({
                row: c.row - minRow,
                col: c.col - minCol,
                letter: c.letter
            }));
        }

        // Fill grid
        for (const pw of this.placedWords) {
            for (const cell of pw.cells) {
                if (!this.grid[cell.row][cell.col]) {
                    this.grid[cell.row][cell.col] = { letter: cell.letter, userInput: '', number: null };
                }
            }
            // Set number on first cell
            const firstCell = pw.cells[0];
            if (this.grid[firstCell.row][firstCell.col]) {
                this.grid[firstCell.row][firstCell.col].number = pw.number;
            }
        }
    }

    canPlaceInTemp(grid, word, startRow, startCol, rowDir, colDir) {
        const MAX = grid.length;

        for (let i = 0; i < word.length; i++) {
            const r = startRow + i * rowDir;
            const c = startCol + i * colDir;

            if (r < 0 || r >= MAX || c < 0 || c >= MAX) return false;

            const existing = grid[r][c];
            if (existing && existing !== word[i]) return false;

            // Check perpendicular neighbors (avoid parallel adjacent words)
            if (rowDir === 1) { // vertical
                if (grid[r][c - 1] && !this.isPartOfExistingWord(r, c - 1)) return false;
                if (grid[r][c + 1] && !this.isPartOfExistingWord(r, c + 1)) return false;
            } else { // horizontal
                if (grid[r - 1] && grid[r - 1][c] && !this.isPartOfExistingWord(r - 1, c)) return false;
                if (grid[r + 1] && grid[r + 1][c] && !this.isPartOfExistingWord(r + 1, c)) return false;
            }
        }

        // Check cells before and after
        const beforeR = startRow - rowDir;
        const beforeC = startCol - colDir;
        const afterR = startRow + word.length * rowDir;
        const afterC = startCol + word.length * colDir;

        if (beforeR >= 0 && beforeR < MAX && beforeC >= 0 && beforeC < MAX && grid[beforeR][beforeC]) return false;
        if (afterR >= 0 && afterR < MAX && afterC >= 0 && afterC < MAX && grid[afterR][afterC]) return false;

        return true;
    }

    isPartOfExistingWord(row, col) {
        return this.placedWords.some(pw =>
            pw.cells.some(c => c.row === row && c.col === col)
        );
    }

    placeWordInTemp(grid, wordData, startRow, startCol, rowDir, colDir, number) {
        const word = wordData.cleanWord;
        const cells = [];
        const direction = colDir === 1 ? 'across' : 'down';

        for (let i = 0; i < word.length; i++) {
            const r = startRow + i * rowDir;
            const c = startCol + i * colDir;
            grid[r][c] = word[i];
            cells.push({ row: r, col: c, letter: word[i] });
        }

        this.placedWords.push({
            ...wordData,
            cells,
            direction,
            number,
            completed: false
        });
    }

    renderGrid() {
        this.crosswordGrid.style.gridTemplateColumns = `repeat(${this.gridWidth}, var(--cell-size))`;
        this.crosswordGrid.innerHTML = '';

        for (let r = 0; r < this.gridHeight; r++) {
            for (let c = 0; c < this.gridWidth; c++) {
                const cell = document.createElement('div');
                cell.className = 'cw-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;

                if (this.grid[r][c]) {
                    const data = this.grid[r][c];
                    if (data.number) {
                        const numSpan = document.createElement('span');
                        numSpan.className = 'cell-number';
                        numSpan.textContent = data.number;
                        cell.appendChild(numSpan);
                    }
                    addTouchClick(cell, () => this.onCellClick(r, c));
                } else {
                    cell.classList.add('blocked');
                }

                this.crosswordGrid.appendChild(cell);
            }
        }
    }

    onCellClick(row, col) {
        // Find word(s) that contain this cell
        const wordsAtCell = this.placedWords.filter(pw =>
            pw.cells.some(c => c.row === row && c.col === col)
        );

        if (wordsAtCell.length === 0) return;

        // Toggle between across/down if multiple words
        if (wordsAtCell.length > 1 && this.selectedWord &&
            wordsAtCell.includes(this.selectedWord)) {
            const other = wordsAtCell.find(w => w !== this.selectedWord);
            this.selectWord(other, row, col);
        } else {
            this.selectWord(wordsAtCell[0], row, col);
        }
    }

    selectWord(word, focusRow, focusCol) {
        this.selectedWord = word;

        // Clear previous highlights
        document.querySelectorAll('.cw-cell').forEach(c => {
            c.classList.remove('selected', 'active-word');
        });

        // Highlight word cells
        for (const cell of word.cells) {
            const elem = document.querySelector(
                `.cw-cell[data-row="${cell.row}"][data-col="${cell.col}"]`
            );
            if (elem) elem.classList.add('active-word');
        }

        // Select specific cell or first empty
        let targetCell = word.cells[0];
        if (focusRow !== undefined) {
            targetCell = word.cells.find(c => c.row === focusRow && c.col === focusCol) || targetCell;
        } else {
            // Find first empty cell
            for (const c of word.cells) {
                if (!this.grid[c.row][c.col].userInput) {
                    targetCell = c;
                    break;
                }
            }
        }

        this.selectedCell = targetCell;
        const selectedElem = document.querySelector(
            `.cw-cell[data-row="${targetCell.row}"][data-col="${targetCell.col}"]`
        );
        if (selectedElem) selectedElem.classList.add('selected');

        // Show clue
        this.showClue(word);
        this.updateSuggestions();
    }

    showClue(word) {
        const dir = word.direction === 'across' ? '→ Horizontal' : '↓ Vertical';
        this.clueDirection.textContent = `${word.number}. ${dir}`;

        // Hide all clue elements first
        this.clueText.classList.add('hidden');
        this.clueImage.classList.add('hidden');
        this.audioBtn.classList.add('hidden');

        // Show based on clue type
        if (word.clueType === 'text' && word.textClue) {
            this.clueText.textContent = word.textClue;
            this.clueText.classList.remove('hidden');
        } else if (word.clueType === 'image' && word.image) {
            this.clueImage.src = word.image;
            this.clueImage.classList.remove('hidden');
        } else if (word.clueType === 'audio' || word.audio || word.word) {
            this.audioBtn.classList.remove('hidden');
            // Auto-play audio clue
            this.playAudio();
        } else {
            // Fallback: show audio button
            this.audioBtn.classList.remove('hidden');
        }
    }

    playAudio() {
        if (this.selectedWord) {
            this.speak(this.selectedWord.word, this.selectedWord.audio);
        }
    }

    onKeyPress(key) {
        if (!this.selectedWord || !this.selectedCell) return;

        const row = this.selectedCell.row;
        const col = this.selectedCell.col;
        const cellData = this.grid[row][col];

        if (key === '⌫') {
            // Backspace
            cellData.userInput = '';
            this.updateCellDisplay(row, col);
            this.updateSuggestions();
            this.moveToPrev();
        } else {
            // Letter input
            cellData.userInput = key;
            this.updateCellDisplay(row, col);

            // Check if letter is correct
            const elem = document.querySelector(`.cw-cell[data-row="${row}"][data-col="${col}"]`);
            if (cellData.userInput === cellData.letter) {
                elem.classList.remove('wrong');
                elem.classList.add('correct');
            } else {
                elem.classList.remove('correct');
                elem.classList.add('wrong');
                this.sessionStats.wrongAttempts++;
                // Track per word
                if (this.selectedWord) {
                    const wid = this.selectedWord.id;
                    this.wordWrongCounts[wid] = (this.wordWrongCounts[wid] || 0) + 1;
                }
            }

            this.updateSuggestions();
            this.checkWordComplete();
            this.moveToNext();
        }
    }

    updateCellDisplay(row, col) {
        const elem = document.querySelector(`.cw-cell[data-row="${row}"][data-col="${col}"]`);
        const cellData = this.grid[row][col];

        // Find or create letter display
        let letterSpan = elem.querySelector('.cell-letter');
        if (!letterSpan) {
            letterSpan = document.createElement('span');
            letterSpan.className = 'cell-letter';
            elem.appendChild(letterSpan);
        }
        letterSpan.textContent = cellData.userInput || '';
    }

    moveToNext() {
        const cells = this.selectedWord.cells;
        const idx = cells.findIndex(c =>
            c.row === this.selectedCell.row && c.col === this.selectedCell.col
        );

        if (idx < cells.length - 1) {
            this.selectCell(cells[idx + 1]);
        }
    }

    moveToPrev() {
        const cells = this.selectedWord.cells;
        const idx = cells.findIndex(c =>
            c.row === this.selectedCell.row && c.col === this.selectedCell.col
        );

        if (idx > 0) {
            this.selectCell(cells[idx - 1]);
        }
    }

    selectCell(cell) {
        document.querySelectorAll('.cw-cell.selected').forEach(c => c.classList.remove('selected'));
        this.selectedCell = cell;
        const elem = document.querySelector(`.cw-cell[data-row="${cell.row}"][data-col="${cell.col}"]`);
        if (elem) elem.classList.add('selected');
    }

    checkWordComplete() {
        const word = this.selectedWord;

        const isComplete = word.cells.every(c => {
            const cellData = this.grid[c.row][c.col];
            return cellData.userInput === cellData.letter;
        });

        if (isComplete && !word.completed) {
            word.completed = true;
            this.completedWords.add(word.cleanWord);
            this.wordsDoneEl.textContent = this.completedWords.size;

            // Mark all cells as correct
            for (const c of word.cells) {
                const elem = document.querySelector(`.cw-cell[data-row="${c.row}"][data-col="${c.col}"]`);
                if (elem) {
                    elem.classList.remove('wrong', 'selected', 'active-word');
                    elem.classList.add('correct');
                }
            }

            // Track
            if (this.sessionId) {
                const wrongs = this.wordWrongCounts[word.id] || 0;
                fetch(`/api/session/${this.sessionId}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wordId: word.id, correct: true, wrong_action: wrongs })
                });
            }

            // Speak word
            this.speak(word.word, word.audio);

            // Check win
            if (this.completedWords.size >= this.placedWords.length) {
                setTimeout(() => this.gameWin(), 500);
            } else {
                // Move to next incomplete word
                const nextWord = this.placedWords.find(w => !w.completed);
                if (nextWord) setTimeout(() => this.selectWord(nextWord), 300);
            }
        }
    }

    startTimer() {
        this.timeLeft = 180;
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
        const accuracy = Math.round((this.completedWords.size / this.placedWords.length) * 100);

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
        this.completedWords.clear();
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


    updateSuggestions() {
        if (!this.suggestionBox) return;

        if (!this.selectedWord || this.selectedWord.completed) {
            this.suggestionBox.innerHTML = '';
            this.suggestionBox.classList.add('hidden');
            return;
        }

        // Build pattern
        let pattern = '';
        for (const cell of this.selectedWord.cells) {
            const val = this.grid[cell.row][cell.col].userInput;
            pattern += val ? val : '.';
        }

        // If empty, maybe don't show? Or show all matching length?
        // User said "Initial were just letters typed".
        // Let's show all matching length if empty.

        const regex = new RegExp(`^${pattern}$`);

        // Filter words (limit 5)
        const matches = this.words.filter(w =>
            w.cleanWord.length === pattern.length &&
            regex.test(w.cleanWord)
        ).slice(0, 5);

        if (matches.length === 0) {
            this.suggestionBox.innerHTML = '';
            this.suggestionBox.classList.add('hidden');
            return;
        }

        this.suggestionBox.classList.remove('hidden');
        this.suggestionBox.innerHTML = matches.map(w => `
            <div class="suggestion-item${w.cleanWord === this.selectedWord.cleanWord ? ' match' : ''}" 
                 onclick="window.game.fillFromSuggestion('${w.cleanWord}')">
                ${w.cleanWord}
            </div>
        `).join('');
    }

    fillFromSuggestion(wordStr) {
        if (!this.selectedWord) return;

        for (let i = 0; i < this.selectedWord.cells.length; i++) {
            const c = this.selectedWord.cells[i];
            const letter = wordStr[i];

            // Only fill if empty or different? No, force fill (autocorrect)
            this.grid[c.row][c.col].userInput = letter;
            this.updateCellDisplay(c.row, c.col);

            // Trigger validation
            const cell = document.querySelector(`.cw-cell[data-row="${c.row}"][data-col="${c.col}"]`);
            if (cell) {
                if (letter === this.grid[c.row][c.col].letter) {
                    cell.classList.remove('wrong');
                    cell.classList.add('correct');
                } else {
                    cell.classList.remove('correct');
                    cell.classList.add('wrong');

                    // Count error if it wasn't wrong before? 
                    // This counts as a "try".
                    if (this.sessionId) {
                        const wid = this.selectedWord.id;
                        this.wordWrongCounts[wid] = (this.wordWrongCounts[wid] || 0) + 1;
                        this.sessionStats.wrongAttempts++;
                    }
                }
            }
        }

        this.checkWordComplete();
        this.updateSuggestions();
    }
}

document.addEventListener('DOMContentLoaded', () => { window.game = new CrosswordGame(); });
