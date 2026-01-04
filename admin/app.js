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

// Load users on page load
loadUsers();
