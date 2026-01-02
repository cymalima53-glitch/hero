const state = {
    student: null,
    assignments: []
};

// CONSTANTS
const isFile = window.location.protocol.startsWith('file') || window.location.origin === 'null';
const API_BASE = isFile ? 'http://localhost:3000' : '';

// Handle Login Page
if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch(`${API_BASE}/api/auth/student/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (res.ok) {
                // If local file, use relative path navigation
                if (isFile) window.location.href = 'index.html';
                else window.location.href = 'index.html';
                // (Actually index.html is relative so it works for both, but explicit is fine)
            } else {
                throw new Error('Login failed');
            }
        } catch (err) {
            const errEl = document.getElementById('error-msg');
            errEl.style.display = 'block';
            errEl.textContent = 'Incorrect username or password';
        }
    });
}


// Handle Dashboard
if (document.getElementById('student-dashboard')) {
    initializeDashboard();
}

async function initializeDashboard() {
    try {
        // 1. Load Assignments
        const res = await fetch(`${API_BASE}/api/assignments/my-list`);
        if (res.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        const json = await res.json();
        state.assignments = json.assignments || [];

        renderAssignments();
        handleAutoNext();
    } catch (e) {
        console.error("Failed to load dashboard", e);
    }
}

function renderAssignments() {
    const grid = document.getElementById('assignments-grid');
    grid.innerHTML = '';


    if (state.assignments.length === 0) {
        // Should be handled above, but double check
        return;
    }

    state.assignments.forEach(a => {
        const card = document.createElement('div');
        card.className = 'game-card';
        // Map Game ID to Name (Simple map for now, ideally fetch from config)
        const gameNames = {
            'game1': 'Memory Echo',
            'game2': 'Multiple Choice',
            'game3': 'Match Pairs',
            'game4': 'Fill in the Blank',
            'game5': 'Tap the Choice',
            'game6': 'Math Blaster',
            'game7': 'Number Runner',
            'game8': 'Word Pop',
            'game9': 'Match Master',
            'game10': 'Hero See Hero Do',
            'game11': 'Audio Detective',
            'motsMeles': '🔍 Word Search',
            'motsCroises': '✏️ Crossword'
        };
        const title = gameNames[a.gameId] || a.gameId;

        // Visual distinction for completed
        if (a.status === 'completed') card.classList.add('completed');

        card.innerHTML = `
            <div class="card-icon"><i class="fas fa-gamepad"></i></div>
            <h3>${title}</h3>
            <div class="card-status">
                ${a.status === 'completed'
                ? '<span class="tag success"><i class="fas fa-check"></i> Done</span>'
                : '<span class="tag active">Pending</span>'}
            </div>
            <button class="btn-play" onclick="playGame('${a.gameId}', '${a.id}')">
                ${a.status === 'completed' ? 'Play Again' : 'Play Now'}
            </button>
        `;
        grid.appendChild(card);
    });
}

function handleAutoNext() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('next') === 'true') {
        // Find first non-completed assignment
        const nextTask = state.assignments.find(a => a.status !== 'completed');

        if (nextTask) {
            // Auto play it
            console.log("Auto-playing next game:", nextTask.gameId);
            playGame(nextTask.gameId, nextTask.id);
        } else {
            // All done! Show celebration
            showCompletionScreen();
        }

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function showCompletionScreen() {
    // Basic celebration overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.color = 'white';
    overlay.style.textAlign = 'center';

    overlay.innerHTML = `
        <div style="font-size: 5rem; animation: bounce 1s infinite;">🎉</div>
        <h1 style="font-size: 3rem; margin: 1rem 0; color: gold; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">Good Job!</h1>
        <p style="font-size: 1.5rem; margin-bottom: 2rem;">Your homework is done!<br>Check if there's any games that's set.</p>
        <button onclick="document.body.removeChild(this.parentElement)" style="padding: 1rem 2rem; font-size: 1.2rem; cursor: pointer; background: white; border: none; border-radius: 50px; font-weight: bold; color: #333;">Close</button>
        <style>
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-20px); }
            }
        </style>
    `;

    document.body.appendChild(overlay);

    // Confetti effect (simple CSS fallback)
    // Could add complex canvas confetti if user wants, but this is good "dumb" start
}

async function playGame(gameId, assignmentId) {
    try {
        const btn = document.activeElement;
        // Check if button is actually a button before changing text
        if (btn && btn.tagName === 'BUTTON') {
            const originalText = btn.innerText;
            btn.innerText = 'Loading...';
            btn.disabled = true;
        }

        const res = await fetch(`${API_BASE}/api/assignments/${assignmentId}/start`, {
            method: 'POST'
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to start');
        }

        const data = await res.json();
        const sessionId = data.sessionId;

        // Redirect to game with session
        const gamePaths = {
            'memoryEcho': 'game',
            'multipleChoice': 'game2',
            'matchPairs': 'game3',
            // Default mapping if ID matches folder, else use map
            'fillBlank': 'game4',
            'tapChoice': 'game5',
            'soundSwipe': 'game6',
            'beatClock': 'game7',
            'soundDrag': 'game8',
            'moveMatch': 'game9',
            'simonSquad': 'game10',
            'audioDetective': 'game11',
            'motsMeles': 'game12',
            'motsCroises': 'game13'
        };

        const folder = gamePaths[gameId] || gameId;
        // Game 11 (Audio Detective) fix from conversation history check
        // The map covers it, but ensure 'game11' key works if gameId is 'game11'
        // Actually, if gameId passes through as 'game11' and not in map, it defaults to 'game11', which is correct folder.

        window.location.href = `../${folder}/index.html?session=${sessionId}`;

    } catch (e) {
        console.error(e);
        alert("Could not start game: " + e.message);
        // Reset button
        const btn = document.activeElement; // Might lose focus, but acceptable for now
        if (btn && btn.tagName === 'BUTTON') {
            btn.innerText = 'Play Now';
            btn.disabled = false;
        }
    }
}

// Logout
window.logout = function () {
    document.cookie = 'student_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    window.location.href = 'login.html';
}
