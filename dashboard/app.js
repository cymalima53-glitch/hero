// --- AUTH & INIT ---
let currentTeacher = null;
let students = [];
let sessions = [];
let currentStudentId = null;

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        currentTeacher = data.teacher;
        // document.getElementById('user-info').textContent = currentTeacher.email;
        loadData();
    } catch (e) {
        window.location.href = 'login.html';
    }
}

window.logout = async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
}

// --- NAVIGATION ---
function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-tab="${viewId}"]`);
    if (navItem) navItem.classList.add('active');

    // Titles
    const titles = {
        'students': 'Class Overview',
        'sessions': 'Assignments Manager',
        'student-detail': 'Student Detail',
        'session-detail': 'Session Analysis'
    };
    if (titles[viewId]) document.getElementById('page-title').textContent = titles[viewId];
}

document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
        showView(el.dataset.tab);
    });
});

function goBackToStudent() {
    if (currentStudentId) {
        renderStudentDetail(currentStudentId);
    } else {
        showView('students');
    }
}

// --- DATA LOADING ---
async function loadData() {
    await Promise.all([loadStudents(), loadSessions(), loadFiles()]); // Added loadFiles
    renderStudentOverview(); // Initial View
}

let files = {}; // NEW

async function loadFiles() {
    try {
        const res = await fetch('/api/files/en'); // Default to EN for now
        files = await res.json();

        const sel = document.getElementById('session-file');
        if (sel) {
            sel.innerHTML = '<option value="">-- All Words (Master) --</option>';
            Object.values(files).forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = `📁 ${f.name}`;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error("Failed to load files", e); }
}

async function loadStudents() {
    const res = await fetch('/api/students');
    const json = await res.json();
    students = json.students || [];
    updateStudentSelect();
}
async function loadSessions() {
    try {
        const res = await fetch('/api/assignments/teacher');
        const json = await res.json();
        sessions = json.assignments || [];
        console.log("Loaded sessions:", sessions.length, sessions); // DEBUG
        renderAssignmentsTable(); // This is the new folder render function
    } catch (e) {
        console.error("Failed to load sessions", e);
    }
}

// ... (create-session-form handler update)
// HANDLE ASSIGNMENT
document.getElementById('create-session-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await createSessionOrAssignment('assign');
});

document.getElementById('btn-copy-link')?.addEventListener('click', async () => {
    await createSessionOrAssignment('link');
});

async function createSessionOrAssignment(mode) {
    const studentId = document.getElementById('session-student').value;
    const gameId = document.getElementById('session-game').value;
    const limit = document.getElementById('session-limit').value;
    const fileId = document.getElementById('session-file').value;

    if (!studentId || !gameId) {
        alert("Please select student and game");
        return;
    }

    // Settings for Assignment
    const settings = {
        limit: parseInt(limit),
        fileId: fileId
    };

    if (mode === 'assign') {
        const res = await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentIds: [studentId],
                gameId: gameId,
                settings: settings
            })
        });
        if (res.ok) {
            alert("Game Assigned Successfully!");
            const count = (await res.json()).count;
            console.log("Assigned to " + count + " students");
            await loadSessions();
        } else {
            alert("Failed to assign game.");
        }
    } else {
        // Legacy Link Mode (Test)
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, gameId, limit, fileId })
        });
        const json = await res.json();
        if (json.session) {
            const link = `${window.location.origin}/${gameId}/index.html?session=${json.session.id}`;
            prompt("Test Link:", link);
            loadSessions();
        }
    }
}

// --- RENDER: OVERVIEW ---
function renderStudentOverview() {
    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '';

    // Class Stats
    let totalSessions = 0;
    let totalCompleted = 0;

    students.forEach(s => {
        const studSessions = sessions.filter(sess => sess.studentId === s.id);
        const completed = studSessions.filter(sess => sess.status === 'completed');

        totalSessions += studSessions.length;
        totalCompleted += completed.length;

        // Calc Stats
        const avgAttempts = completed.length ? (completed.reduce((acc, c) => acc + (c.analytics.attempts || 0), 0) / completed.length).toFixed(1) : '-';
        const passRate = studSessions.length ? Math.round((completed.length / studSessions.length) * 100) : 0;

        const tr = document.createElement('tr');
        tr.className = 'clickable';
        tr.onclick = () => renderStudentDetail(s.id);
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--primary);">${s.name}</td>
            <td>${studSessions.length}</td>
            <td>${avgAttempts}</td>
            <td>
                <span class="badge ${passRate > 80 ? 'badge-success' : (passRate > 50 ? 'badge-warning' : 'badge-danger')}">
                    ${passRate}%
                </span>
            </td>
            <td><button class="sm secondary" onclick="event.stopPropagation(); renderStudentDetail('${s.id}')">View Details</button></td>
        `;
        tbody.appendChild(tr);
    });

    // Render Top Stats
    const statsContainer = document.getElementById('class-stats');
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-val">${students.length}</div>
            <div class="stat-label">Total Students</div>
        </div>
        <div class="stat-card">
            <div class="stat-val">${totalSessions}</div>
            <div class="stat-label">Total Assignments</div>
        </div>
        <div class="stat-card">
            <div class="stat-val" style="color: var(--success-text)">${totalCompleted}</div>
            <div class="stat-label">Completed Sessions</div>
        </div>
    `;

    // Also populate the "All Assignments" table in the other tab
    renderAssignmentsTable();
}


// --- RENDER: STUDENT FOLDERS (Assignments View) ---
function renderAssignmentsTable() {
    console.log("Rendering Folders...", sessions.length, students.length);
    // NOTE: This function name is kept for compatibility but now renders Folders
    const container = document.getElementById('student-list-container');
    if (!container) {
        console.error("Container #student-list-container not found!");
        return;
    }
    container.innerHTML = '';

    if (students.length === 0) {
        container.innerHTML = '<p class="text-muted">No students found. Add a student to start.</p>';
        return;
    }

    // Group By Student
    const map = {};
    students.forEach(s => map[s.id] = { student: s, assignments: [], stats: { active: 0, completed: 0, accuracySum: 0, accuracyCount: 0 } });

    // Populate Assigns
    sessions.forEach(sess => {
        if (map[sess.studentId]) {
            map[sess.studentId].assignments.push(sess);

            // Stats
            if (sess.status === 'completed') {
                map[sess.studentId].stats.completed++;
                if (sess.accuracy !== undefined) {
                    map[sess.studentId].stats.accuracySum += sess.accuracy;
                    map[sess.studentId].stats.accuracyCount++;
                }
            } else {
                map[sess.studentId].stats.active++;
            }
        }
    });

    // Totals for top bar
    let totalActive = 0;
    let totalCompleted = 0;

    Object.values(map).forEach(group => {
        totalActive += group.stats.active;
        totalCompleted += group.stats.completed;
        const avgAcc = group.stats.accuracyCount ? Math.round(group.stats.accuracySum / group.stats.accuracyCount) : 0;

        // --- SMART SUGGESTION LOGIC ---
        const hierarchy = ['memoryEcho', 'matchPairs', 'tapChoice', 'fillBlank', 'audioDetective'];

        let suggestion = null;
        if (group.stats.accuracyCount > 0 && avgAcc >= 80) {
            // Find highest mastered game
            let highestMasteredIndex = -1;

            // Check games user has completed with good score
            group.assignments.forEach(a => {
                if (a.status === 'completed' && (a.accuracy || 0) >= 80) {
                    const idx = hierarchy.indexOf(a.gameId);
                    if (idx > highestMasteredIndex) highestMasteredIndex = idx;
                }
            });

            // Suggest next
            if (highestMasteredIndex > -1 && highestMasteredIndex < hierarchy.length - 1) {
                const nextGameId = hierarchy[highestMasteredIndex + 1];
                const nextGameName = formatGameName(nextGameId);

                // Check if already active
                const alreadyHasIt = group.assignments.some(a => a.gameId === nextGameId && a.status !== 'completed');

                if (!alreadyHasIt) {
                    suggestion = {
                        text: `Ready for <strong>${nextGameName}</strong>`,
                        reason: `Mastered previous levels with ${avgAcc}% accuracy.`
                    };
                }
            }
        }

        // Render Folder
        const folder = document.createElement('div');
        folder.className = 'student-folder';
        folder.innerHTML = `
            <div class="folder-header" onclick="toggleFolder('${group.student.id}', this)">
                <div class="folder-info">
                    <div class="student-name">${group.student.name}</div>
                    <div class="folder-stats">
                        <span class="stat-badge" style="color:var(--primary)">${group.stats.active} Active</span>
                        <span class="stat-badge" style="color:var(--success-text)">${group.stats.completed} Done</span>
                        ${group.stats.accuracyCount ? `<span class="stat-badge" style="background:#e3f2fd; color:#1565c0">Avg ${avgAcc}%</span>` : ''}
                    </div>
                     ${suggestion ? '<i class="fas fa-star star-indicator" title="Recommendation Available"></i>' : ''}
                </div>
                <div class="toggle-icon"><i class="fas fa-chevron-down"></i></div>
            </div>
            <div class="folder-content" id="folder-${group.student.id}">
                ${suggestion ? `
                <div class="suggestion-box">
                    <div class="suggestion-icon"><i class="fas fa-lightbulb"></i></div>
                    <div class="suggestion-content">
                        <h4>Recommendation: Coming Soon</h4>
                        <p>${suggestion.reason}</p>
                    </div>
                </div>` : ''}
                
                <div class="folder-assignments">
                    ${group.assignments.length === 0 ? '<p class="text-muted">No assignments found.</p>' : ''}
                    ${group.assignments.map(a => renderAssignmentRow(a)).join('')}
                </div>
            </div>
        `;
        container.appendChild(folder);
    });

    document.getElementById('total-active').textContent = totalActive;
    document.getElementById('total-completed').textContent = totalCompleted;
}

function renderAssignmentRow(sess) {
    const gameName = formatGameName(sess.gameId);
    const isDone = sess.status === 'completed';
    const badgeClass = isDone ? 'badge-success' : 'badge-warning';

    let details = '';
    if (isDone) {
        details = `<span class="badge ${badgeClass}"><i class="fas fa-check"></i> ${sess.accuracy || 0}% Accuracy</span>`;
    } else {
        details = `<span class="badge ${badgeClass}"><i class="fas fa-clock"></i> Active</span>`;
    }

    return `
    <div class="assign-row">
        <div class="assign-info">
            <div class="game-icon"><i class="fas fa-gamepad"></i></div>
            <div>
                <div style="font-weight:600">${gameName}</div>
                <div class="text-muted" style="font-size:0.8rem">Created: ${new Date(sess.createdAt).toLocaleDateString()}</div>
            </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
             ${details}
             <button class="sm secondary" onclick="copyLink('${getMagicLink(sess)}')"><i class="fas fa-link"></i> Link</button>
             <button class="sm danger" onclick="deleteAssignment('${sess.id}')"><i class="fas fa-trash"></i></button>
        </div>
    </div>
    `;
}

window.toggleFolder = function (id, header) {
    const folder = header.parentElement;
    folder.classList.toggle('expanded');
}


// DELETE ASSIGNMENT
window.deleteAssignment = async function (id) {
    if (!confirm("Are you sure you want to delete this assignment? It will be removed from the student's list.")) return;

    try {
        const res = await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
        if (res.ok) {
            // Remove local
            sessions = sessions.filter(s => s.id !== id);
            renderAssignmentsTable();
            renderStudentOverview(); // Update stats
            alert("Assignment deleted.");
        } else {
            alert("Failed to delete.");
        }
    } catch (e) {
        console.error(e);
        alert("Error deleting.");
    }
}

// --- RENDER: STUDENT DETAIL ---
function renderStudentDetail(studentId) {
    currentStudentId = studentId;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // Header
    document.getElementById('sd-name').textContent = student.name;
    document.getElementById('sd-id').textContent = student.id;

    // Reset Password Button Injection
    const headerContainer = document.querySelector('#view-student-detail .view-header');
    // Check if button already exists to prevent duplicate (or just clear content if we had full control, but we are modifying snippets)
    // Actually, let's just append it to a container if it's not there, or clearer:
    // We can add a button container in the HTML, OR injecting it dynamically here.
    // Let's look for a place to put it. The view probably has a header.
    // Ideally I'd replace the whole view header logic, but I don't see the HTML.
    // I will add a button to the `sd-id` area or create a new "Student Actions" area.

    // For now, let's create a visual action bar.
    const actionContainer = document.getElementById('sd-actions') || document.createElement('div');
    actionContainer.id = 'sd-actions';
    actionContainer.style.marginTop = '1rem';

    // Clear previous
    actionContainer.innerHTML = '';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'secondary';
    resetBtn.innerHTML = '<i class="fas fa-key"></i> Reset Password';
    resetBtn.onclick = () => resetStudentPassword(student.id, student.name);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.style.marginLeft = '10px';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Student';
    deleteBtn.onclick = () => deleteStudent(student.id);

    actionContainer.appendChild(resetBtn);
    actionContainer.appendChild(deleteBtn);

    // Insert after ID
    const metaDiv = document.getElementById('sd-id').parentNode;
    if (!document.getElementById('sd-actions')) {
        metaDiv.parentNode.insertBefore(actionContainer, metaDiv.nextSibling);
    }

    // Session List
    const studSessions = sessions.filter(s => s.studentId === studentId);
    const listContainer = document.getElementById('sd-session-list');
    listContainer.innerHTML = '';

    if (studSessions.length === 0) {
        listContainer.innerHTML = '<p class="text-muted">No assignments yet.</p>';
    }

    studSessions.forEach(sess => {
        const isDone = sess.status === 'completed';
        const fails = sess.analytics.failuresBeforePass || 0;
        const attempts = sess.analytics.attempts || 0;

        let statusColor = 'var(--text-muted)';
        let statusIcon = 'fa-clock';
        let statusText = 'Pending';

        if (isDone) {
            statusIcon = 'fa-check-circle';
            statusText = 'Passed';
            if (fails === 0) statusColor = 'var(--success-text)';
            else if (fails < 3) statusColor = 'var(--warning-text)';
            else statusColor = 'var(--danger-text)';
        }

        const card = document.createElement('div');
        card.className = 'session-card';
        card.onclick = () => renderSessionDetail(sess.id);
        card.innerHTML = `
            <div class="session-info">
                <div class="session-title">${formatGameName(sess.gameId)}</div>
                <div class="session-meta">
                    <span><i class="fas ${statusIcon}" style="color: ${statusColor}"></i> ${statusText}</span>
                    <span><i class="fas fa-history"></i> ${attempts} Attempts</span>
                    <span><i class="fas fa-exclamation-triangle"></i> ${fails} Fails</span>
                </div>
            </div>
            <div style="color: var(--primary); font-size: 1.2rem;"><i class="fas fa-chevron-right"></i></div>
        `;
        listContainer.appendChild(card);
    });

    showView('student-detail');
}

window.resetStudentPassword = async function (id, name) {
    const newPass = prompt(`Enter new password for ${name}:`);
    if (!newPass) return;

    try {
        const res = await fetch(`/api/students/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPass })
        });

        if (res.ok) {
            alert('Password updated successfully!');
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to update password');
        }
    } catch (e) {
        console.error(e);
        alert('Error updating password');
    }
}

window.deleteStudent = async function (id) {
    if (!confirm("Are you sure you want to delete this student? All their data will be lost.")) return;

    try {
        const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert("Student deleted.");
            await loadStudents();
            showView('students');
        } else {
            alert("Failed to delete.");
        }
    } catch (e) {
        console.error(e);
        alert("Error deleting.");
    }
}

// --- RENDER: SESSION DETAIL ---
function renderSessionDetail(sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const student = students.find(st => st.id === session.studentId);
    const gameName = formatGameName(session.gameId);
    const timeSec = session.analytics.totalTimeSeconds ? Math.round(session.analytics.totalTimeSeconds) : 0;
    const fails = session.analytics.failuresBeforePass || 0;
    const attempts = session.analytics.attempts || 0;

    // Header Summary
    document.getElementById('sess-summary-title').textContent = `${gameName} - ${student ? student.name : 'Unknown'}`;

    let summaryText = "";
    if (session.status === 'completed') {
        const timeStr = timeSec > 60 ? `${Math.floor(timeSec / 60)}m ${timeSec % 60}s` : `${timeSec}s`;
        if (fails === 0) summaryText = `Perfect run! Passed in ${timeStr}.`;
        else summaryText = `Passed after ${fails} failure(s) in ${timeStr}.`;
    } else {
        summaryText = "Session is currently in progress or abandoned.";
    }
    document.getElementById('sess-summary-text').textContent = summaryText;

    // Stats
    document.getElementById('sess-time').textContent = timeSec + 's';
    document.getElementById('sess-attempts').textContent = attempts;
    document.getElementById('sess-fails').textContent = fails;

    // Question Breakdown
    const qContainer = document.getElementById('sess-questions');
    qContainer.innerHTML = '';

    const questions = session.analytics.questions || {};

    // We need to fetch word text if possible, but we don't have it easily here without fetching all data files.
    // However, `data/teachers.json` does NOT store words.
    // `session.wordIds` exists.
    // For "Polish Only" rule "Fast and Simple", we might just show ID if we can't map it.
    // BUT, we want "WOW". 
    // Optimization: We can deduce the word from the analytics key if we were logging word strings, but we log IDs.
    // Wait, in the `track` call we log `wordId`.
    // We can try to match `wordId` to a guess or just display ID.
    // Actually, we can fetch the `session.lang` file to map IDs to Words!
    // Let's do that for the "WOW" factor.

    fetch(`/data/${session.lang || 'en'}`).then(r => r.json()).then(data => {
        Object.entries(questions).forEach(([wId, stat]) => {
            const wordObj = data.words.find(w => w.id === wId);
            const wordText = wordObj ? wordObj.word : wId;
            const isCorrect = stat.correct;
            const wrongs = stat.wrong || 0;

            const qCard = document.createElement('div');
            qCard.className = `q-card ${isCorrect ? 'correct' : 'wrong'}`;
            qCard.innerHTML = `
                <span class="q-word">${wordText}</span>
                <div class="q-stats">
                    ${isCorrect ? '<i class="fas fa-check" style="color:var(--success-text)"></i> Solved' : '<i class="fas fa-times" style="color:var(--danger-text)"></i> Unsolved'}
                    <br>Mistakes: ${wrongs}
                </div>
            `;
            qContainer.appendChild(qCard);
        });
    });

    showView('session-detail');
}

// --- UTILS ---
function formatGameName(id) {
    const names = {
        'memoryEcho': 'Memory Echo',
        'multipleChoice': 'Multiple Choice',
        'matchPairs': 'Match Pairs',
        'fillBlank': 'Fill Blank',
        'tapChoice': 'Tap Choice'
    };
    return names[id] || id;
}

function getMagicLink(s) {
    const gamePaths = {
        memoryEcho: '/game/index.html',
        multipleChoice: '/game2/index.html',
        matchPairs: '/game3/index.html',
        fillBlank: '/game4/index.html',
        tapChoice: '/game5/index.html'
    };
    const path = gamePaths[s.gameId] || '/game/index.html';
    return `${window.location.origin}${path}?session=${s.id}`;
}

window.copyLink = function (link) {
    navigator.clipboard.writeText(link);
    alert('Copied Magic Link!');
}

// --- ACTIONS ---
// --- ACTIONS ---
function updateStudentSelect() {
    const sel = document.getElementById('session-student');
    sel.innerHTML = '<option value="">Select Student...</option>';
    students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (@${s.username || 'user'})`;
        sel.appendChild(opt);
    });
}

document.getElementById('add-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-student-name').value;
    const username = document.getElementById('new-student-username').value;
    const password = document.getElementById('new-student-password').value;

    try {
        const res = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, password })
        });
        const json = await res.json();

        if (res.ok) {
            alert('Student Added Successfully!');
            document.getElementById('add-student-form').reset();
            await loadStudents();
            renderStudentOverview();
        } else {
            alert(json.error || 'Failed to add student');
        }
    } catch (e) {
        console.error(e);
        alert('System Error: Failed to add student');
    }
});

// (Old create-session-form handler removed - logic moved up)

checkAuth();
