
import os

file_path = r'c:\Users\kamal\antigravity\living-homework-book\dashboard\app.js'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 0-indexed logic
# Keep 0 to 942 (Line 943 in 1-based)
part1 = lines[:943]

# Skip 943 to 955 (Lines 944-956 in 1-based) -> Garbage
# Helper section is 957-1002 (1-based) -> Indices 956-1002
# But lines list is 0-indexed.
# Line 957 (1-based) is index 956.
# So we take from index 956 (Line 957).
# Wait, check Step 293 view.
# 956: }
# 957: (Empty)
# 958: // ========== BULK DELETE LOG
# so index 957 is line 958.
# We want to keep from line 957 (index 956).
# up to line 1002 (index 1001).
# Line 1003 is function renderStudentDetail.

part2 = lines[956:1002] 

# New Function
new_function = """function renderStudentDetail(studentId) {
    state.currentStudentId = studentId;
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    // Header
    document.getElementById('sd-name').textContent = student.name;
    document.getElementById('sd-id').textContent = student.id.substring(0, 8) + '...';
    
    // Reset bulk btn
    document.getElementById('bulk-delete-btn').classList.add('hidden');

    // Session List
    const studSessions = state.sessions.filter(s => s.studentId === studentId);
    const listContainer = document.getElementById('sd-session-list');
    listContainer.innerHTML = '';

    // PENDING ASSIGNMENTS (New Logic)
    const pending = state.assignments.filter(a => a.studentId === studentId && a.status !== 'completed');

    // Clear "No assignments" if we have pending ones
    if (studSessions.length === 0 && pending.length > 0) {
        listContainer.innerHTML = '';
    }
    
    if (studSessions.length === 0 && pending.length === 0) {
         listContainer.innerHTML = '<p class="text-muted">No assignments yet.</p>';
    }

    pending.forEach(a => {
        const card = document.createElement('div');
        card.className = 'session-card';
        card.style.borderLeft = '4px solid var(--warning)';
        
        // ID for assignment: prefix with as_
        const delId = `as_${a.id}`;
        
        card.innerHTML = `
            <div style="display:flex; align-items:center; margin-right:1rem;">
                <input type="checkbox" class="bulk-chk" data-id="${delId}" onclick="event.stopPropagation(); toggleBulkDelete()" style="transform:scale(1.3); cursor:pointer;">
            </div>
            <div class="session-info" onclick="/* No action for pending */">
                <div class="session-title">${formatGameName(a.gameId)}</div>
                <div class="session-meta">
                    <span style="color:var(--warning)"><i class="fas fa-clock"></i> Pending</span>
                    <span><i class="fas fa-calendar"></i> ${new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
            </div>
            <div style="color: var(--text-muted); font-size: 0.9rem;">Not Started</div>
        `;
        listContainer.appendChild(card);
    });

    studSessions.forEach(sess => {
        const isDone = sess.status === 'completed';
        const fails = sess.analytics.failuresBeforePass || 0;
        const attempts = sess.analytics.attempts || 0;

        let statusColor = 'var(--text-muted)';
        let statusIcon = 'fa-clock';
        let statusText = 'Pending';
        let borderColor = 'var(--border)';

        if (isDone) {
            statusIcon = 'fa-check-circle';
            statusText = 'Passed';
            if (fails === 0) {
                statusColor = 'var(--success)';
                borderColor = 'var(--success)';
            } else if (fails < 3) {
                statusColor = 'var(--warning)';
                borderColor = 'var(--warning)';
            } else {
                statusColor = 'var(--danger)';
                borderColor = 'var(--danger)';
            }
        }

        const card = document.createElement('div');
        card.className = 'session-card';
        card.style.borderLeft = `4px solid ${borderColor}`;
        
        // Session ID is just id
        const delId = sess.id;
        
        // We wrap the content in a way that clicking the card goes to detail, but checkbox doesn't
        card.innerHTML = `
            <div style="display:flex; align-items:center; margin-right:1rem;">
                <input type="checkbox" class="bulk-chk" data-id="${delId}" onclick="event.stopPropagation(); toggleBulkDelete()" style="transform:scale(1.3); cursor:pointer;">
            </div>
            <div class="session-info" onclick="renderSessionDetail('${sess.id}')" style="flex:1; cursor:pointer;">
                <div class="session-title">${formatGameName(sess.gameId)}</div>
                <div class="session-meta">
                    <span style="color:${statusColor}"><i class="fas ${statusIcon}"></i> ${statusText}</span>
                    <span><i class="fas fa-history"></i> ${attempts} Attempts</span>
                    <span><i class="fas fa-exclamation-triangle"></i> ${fails} Fails</span>
                </div>
            </div>
            <div style="color: var(--primary); font-size: 1.2rem;"><i class="fas fa-chevron-right"></i></div>
        `;
        listContainer.appendChild(card);
    });

    // Load Analytics (NEW)
    renderStudentAnalytics(studentId);

    // View Switch
    document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-student-detail').classList.remove('hidden');
}
"""

# Part 3: From line 1113 onwards (Index 1112)
# Wait, old function ended at 1112.
# So we want to keep from 1113 (Index 1112).
part3 = lines[1112:]

new_content = "".join(part1) + "".join(part2) + "\n" + new_function + "\n" + "".join(part3)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Patch applied successfully.")
