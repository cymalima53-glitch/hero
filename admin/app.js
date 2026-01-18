// Check authentication
const adminPassword = sessionStorage.getItem('adminPassword');

if (!adminPassword) {
    window.location.href = '/admin/login.html';
}

// Logout functionality
document.getElementById('logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('adminPassword');
    window.location.href = '/admin/login.html';
});

// Fetch and display users
async function loadUsers() {
    try {
        const res = await fetch('/admin/api/users', {
            headers: {
                'X-Admin-Password': adminPassword
            }
        });

        if (res.status === 401) {
            sessionStorage.removeItem('adminPassword');
            window.location.href = '/admin/login.html';
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to fetch users');
        }

        const data = await res.json();
        displayUsers(data.users, data.total);
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('users-tbody').innerHTML = `
            <tr>
                <td colspan="6" class="error-msg" style="display: table-cell;">
                    Failed to load users. Please refresh the page.
                </td>
            </tr>
        `;
    }
}

function displayUsers(users, total) {
    // Update total count
    document.getElementById('total-users').textContent = total;

    const tbody = document.getElementById('users-tbody');

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="no-users">No users found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${formatDate(user.createdAt)}</td>
            <td>${user.contentGeneratorUses}</td>
            <td>${formatDate(user.lastActiveAt)}</td>
            <td>
                <button 
                    class="btn-danger" 
                    onclick="deleteUser('${user.id}', '${escapeHtml(user.name)}')"
                >
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

async function deleteUser(userId, userName) {
    if (!confirm(`Are you sure you want to delete ${userName}? This will remove all their students and content.`)) {
        return;
    }

    try {
        const res = await fetch(`/admin/api/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'X-Admin-Password': adminPassword
            }
        });

        if (res.status === 401) {
            sessionStorage.removeItem('adminPassword');
            window.location.href = '/admin/login.html';
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to delete user');
        }

        // Reload users
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user. Please try again.');
    }
}

function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') {
        return 'N/A';
    }

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === GENERATOR MANAGEMENT FUNCTIONS ===

// Load generator limits
async function loadGeneratorLimits() {
    try {
        const res = await fetch('/admin/api/generator-teachers', {
            headers: { 'X-Admin-Password': adminPassword }
        });

        if (!res.ok) throw new Error('Failed to fetch generator data');

        const data = await res.json();
        displayGeneratorLimits(data.teachers);
    } catch (error) {
        console.error('Error loading generator limits:', error);
        document.getElementById('generator-tbody').innerHTML = `
            <tr><td colspan="6" class="error-msg">Failed to load generator data</td></tr>
        `;
    }
}

function displayGeneratorLimits(teachers) {
    const tbody = document.getElementById('generator-tbody');

    if (teachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No teachers found</td></tr>';
        return;
    }

    tbody.innerHTML = teachers.map(t => {
        const isUnlimited = t.unlimitedGenerator;
        const isBlocked = !isUnlimited && t.generatorUsesToday >= 5;

        let statusBadge = isUnlimited
            ? '<span class="badge-unlimited">UNLIMITED ✓</span>'
            : '<span class="badge-limited">LIMITED (5/day)</span>';

        if (isBlocked) {
            statusBadge += ' <span class="badge-blocked">BLOCKED</span>';
        }

        const usesToday = isUnlimited ? '∞' : `${t.generatorUsesToday}/5`;
        const lastUsed = t.generatorLastUsed === 'Never' ? 'Never' : formatDate(t.generatorLastUsed);

        return `
            <tr>
                <td>${escapeHtml(t.email)}</td>
                <td>${statusBadge}</td>
                <td>${usesToday}</td>
                <td>${t.generatorTotalUses}</td>
                <td>${lastUsed}</td>
                <td>
                    ${isUnlimited
                ? `<button class="btn-secondary" onclick="lockGenerator('${t.email}')">Lock</button>`
                : `<button class="btn-primary" onclick="unlockGenerator('${t.email}')">Unlock</button>
                           <button class="btn-secondary" onclick="resetGenerator('${t.email}')">Reset</button>`
            }
                </td>
            </tr>
        `;
    }).join('');
}

async function unlockGenerator(email) {
    try {
        const res = await fetch(`/admin/api/unlock-generator/${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: { 'X-Admin-Password': adminPassword }
        });

        if (!res.ok) throw new Error('Failed to unlock');

        alert(`Unlimited access granted to ${email}`);
        loadGeneratorLimits();
        loadAbuseReport();
    } catch (error) {
        console.error('Error unlocking generator:', error);
        alert('Failed to unlock generator');
    }
}

async function lockGenerator(email) {
    try {
        const res = await fetch(`/admin/api/lock-generator/${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: { 'X-Admin-Password': adminPassword }
        });

        if (!res.ok) throw new Error('Failed to lock');

        alert(`${email} limited to 3/day`);
        loadGeneratorLimits();
        loadAbuseReport();
    } catch (error) {
        console.error('Error locking generator:', error);
        alert('Failed to lock generator');
    }
}

async function resetGenerator(email) {
    try {
        const res = await fetch(`/admin/api/reset-generator/${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: { 'X-Admin-Password': adminPassword }
        });

        if (!res.ok) throw new Error('Failed to reset');

        alert(`Counter reset for ${email}`);
        loadGeneratorLimits();
        loadAbuseReport();
    } catch (error) {
        console.error('Error resetting generator:', error);
        alert('Failed to reset counter');
    }
}

// Load abuse report
async function loadAbuseReport() {
    try {
        const res = await fetch('/admin/api/generator-abuse-report', {
            headers: { 'X-Admin-Password': adminPassword }
        });

        if (!res.ok) throw new Error('Failed to fetch abuse report');

        const data = await res.json();
        displayAbuseReport(data.teachers);
    } catch (error) {
        console.error('Error loading abuse report:', error);
        document.getElementById('abuse-tbody').innerHTML = `
            <tr><td colspan="7" class="error-msg">Failed to load abuse report</td></tr>
        `;
    }
}

function displayAbuseReport(teachers) {
    const tbody = document.getElementById('abuse-tbody');

    if (teachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = teachers.map(t => {
        const riskClass = `risk-${t.riskLevel.toLowerCase()}`;
        const lastUsed = t.lastUsed === 'Never' ? 'Never' : formatDate(t.lastUsed);

        return `
            <tr class="${riskClass}">
                <td><strong>${t.riskLevel}</strong></td>
                <td>${escapeHtml(t.email)}</td>
                <td>${t.usesToday}/5</td>
                <td>${t.totalUses}</td>
                <td>${t.limitHits}</td>
                <td>${lastUsed}</td>
                <td>
                    <button class="btn-secondary" onclick="viewUsageDetails('${t.email}')">View Details</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewUsageDetails(email) {
    try {
        const res = await fetch(`/admin/api/generator-usage/${encodeURIComponent(email)}`, {
            headers: { 'X-Admin-Password': adminPassword }
        });

        if (!res.ok) throw new Error('Failed to fetch usage details');

        const data = await res.json();
        showUsageModal(data);
    } catch (error) {
        console.error('Error fetching usage details:', error);
        alert('Failed to load usage details');
    }
}

function showUsageModal(data) {
    const modal = document.getElementById('usage-modal');
    const details = document.getElementById('usage-details');

    const usageLog = data.generatorUsageLog || [];
    const logHtml = usageLog.length > 0
        ? usageLog.slice(-10).reverse().map(log => `
            <div class="usage-log-item">
                <strong>${log.date}</strong> - ${log.uses} uses at ${new Date(log.timestamp).toLocaleTimeString()}
            </div>
        `).join('')
        : '<p>No usage history available</p>';

    details.innerHTML = `
        <h3>${escapeHtml(data.email)}</h3>
        <p><strong>Uses Today:</strong> ${data.generatorUsesToday}/5</p>
        <p><strong>Total Uses:</strong> ${data.generatorTotalUses}</p>
        <p><strong>Limit Hits:</strong> ${data.generatorLimitHits}</p>
        <p><strong>Last Used:</strong> ${data.generatorLastUsed === 'Never' ? 'Never' : formatDate(data.generatorLastUsed)}</p>
        <p><strong>Status:</strong> ${data.unlimitedGenerator ? 'UNLIMITED' : 'LIMITED (5/day)'}</p>
        <hr>
        <h4>Recent Usage Log (Last 10)</h4>
        ${logHtml}
    `;

    modal.style.display = 'block';
}

function closeUsageModal() {
    document.getElementById('usage-modal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('usage-modal');
    if (event.target === modal) {
        closeUsageModal();
    }
}

// Load users on page load
loadUsers();
loadGeneratorLimits();
loadAbuseReport();
