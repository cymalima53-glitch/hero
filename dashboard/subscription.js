// ===== Subscription Management JavaScript =====
// Production-grade subscription management with custom hooks pattern

// ===== Configuration =====
const API_BASE = '/api/stripe';
const ENDPOINTS = {
    status: `${API_BASE}/subscription-status`,
    cancel: `${API_BASE}/cancel-subscription`
};

// ===== State Management =====
class SubscriptionState {
    constructor() {
        this.data = null;
        this.loading = true;
        this.error = null;
        this.listeners = [];
    }

    setState(updates) {
        this.data = { ...this.data, ...updates };
        this.notifyListeners();
    }

    setLoading(loading) {
        this.loading = loading;
        this.notifyListeners();
    }

    setError(error) {
        this.error = error;
        this.notifyListeners();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this));
    }
}

const state = new SubscriptionState();

// ===== API Service =====
const api = {
    async fetchSubscriptionStatus() {
        try {
            const response = await fetch(ENDPOINTS.status, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Fetch subscription status failed:', error);
            throw error;
        }
    },

    async cancelSubscription() {
        try {
            const response = await fetch(ENDPOINTS.cancel, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Cancel subscription failed:', error);
            throw error;
        }
    }
};

// ===== UI Components =====
const UI = {
    // Toast Notifications
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = type === 'success'
            ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>';

        toast.innerHTML = `
            ${icon}
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.2s reverse';
            setTimeout(() => toast.remove(), 200);
        }, 4000);
    },

    // Modal Control
    openModal() {
        const modal = document.getElementById('cancel-modal');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeModal() {
        const modal = document.getElementById('cancel-modal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    },

    // Loading States
    showLoading() {
        document.getElementById('skeleton-loader').classList.remove('hidden');
        document.getElementById('subscription-content').classList.add('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('error-state').classList.add('hidden');
    },

    showContent() {
        document.getElementById('skeleton-loader').classList.add('hidden');
        document.getElementById('subscription-content').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('error-state').classList.add('hidden');
    },

    showEmptyState() {
        document.getElementById('skeleton-loader').classList.add('hidden');
        document.getElementById('subscription-content').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('error-state').classList.add('hidden');
    },

    showError(message) {
        document.getElementById('skeleton-loader').classList.add('hidden');
        document.getElementById('subscription-content').classList.add('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('error-state').classList.remove('hidden');
        document.getElementById('error-message').textContent = message;
    },

    // Button Loading State
    setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        const text = button.querySelector('.btn-text');
        const loader = button.querySelector('.btn-loader');

        if (loading) {
            button.disabled = true;
            if (text) text.classList.add('hidden');
            if (loader) loader.classList.remove('hidden');
        } else {
            button.disabled = false;
            if (text) text.classList.remove('hidden');
            if (loader) loader.classList.add('hidden');
        }
    }
};

// ===== Date Formatting =====
function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function calculateDaysRemaining(dateString) {
    if (!dateString) return 0;
    const endDate = new Date(dateString);
    const now = new Date();
    const diff = endDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ===== Render Functions =====
function renderSubscriptionStatus(data) {
    const statusBadge = document.getElementById('status-badge');
    const nextBillingItem = document.getElementById('next-billing-item');
    const nextBillingDate = document.getElementById('next-billing-date');
    const endDateItem = document.getElementById('end-date-item');
    const subscriptionEndDate = document.getElementById('subscription-end-date');
    const trialItem = document.getElementById('trial-item');
    const trialEndDate = document.getElementById('trial-end-date');

    // Determine status
    let status = 'inactive';
    let statusText = 'Inactive';

    if (data.subscriptionActive) {
        if (data.subscriptionCancelledAt) {
            status = 'cancelled';
            statusText = 'Ending Soon';
        } else {
            status = 'active';
            statusText = 'Active';
        }
    } else if (data.trialDaysRemaining > 0) {
        status = 'trial';
        statusText = 'Trial';
    }

    statusBadge.className = `badge ${status}`;
    statusBadge.textContent = statusText;

    // Show/hide relevant date fields
    if (data.subscriptionCancelledAt && data.subscriptionEndDate) {
        nextBillingItem.classList.add('hidden');
        endDateItem.classList.remove('hidden');
        subscriptionEndDate.textContent = formatDate(data.subscriptionEndDate);
    } else if (data.subscriptionActive) {
        nextBillingItem.classList.remove('hidden');
        endDateItem.classList.add('hidden');
        // Calculate next billing (30 days from now as placeholder)
        const nextBilling = new Date();
        nextBilling.setDate(nextBilling.getDate() + 30);
        nextBillingDate.textContent = formatDate(nextBilling.toISOString());
    } else {
        nextBillingItem.classList.add('hidden');
        endDateItem.classList.add('hidden');
    }

    // Trial info
    if (data.trialDaysRemaining > 0 && !data.subscriptionActive) {
        trialItem.classList.remove('hidden');
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + data.trialDaysRemaining);
        trialEndDate.textContent = `${data.trialDaysRemaining} days (${formatDate(trialEnd.toISOString())})`;
    } else {
        trialItem.classList.add('hidden');
    }
}

function renderAICredits(data) {
    const creditsCount = document.getElementById('credits-count');
    const progressFill = document.getElementById('progress-fill');
    const progressLabel = document.getElementById('progress-label');

    const credits = data.aiCredits || 0;
    const maxCredits = 100;
    const percentage = (credits / maxCredits) * 100;

    creditsCount.textContent = credits;
    progressFill.style.width = `${percentage}%`;
    progressFill.setAttribute('aria-valuenow', percentage);
    progressLabel.textContent = `${credits} of ${maxCredits} credits remaining`;
}

function renderActions(data) {
    const upgradeBtn = document.getElementById('upgrade-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const cancelledNotice = document.getElementById('cancelled-notice');
    const cancelledEndDate = document.getElementById('cancelled-end-date');

    // Show upgrade button if no active subscription
    if (!data.subscriptionActive && data.trialDaysRemaining <= 0) {
        upgradeBtn.classList.remove('hidden');
        upgradeBtn.onclick = () => window.location.href = '/dashboard/pricing.html';
    } else {
        upgradeBtn.classList.add('hidden');
    }

    // Show cancel button or cancelled notice
    if (data.subscriptionActive && !data.subscriptionCancelledAt) {
        cancelBtn.classList.remove('hidden');
        cancelledNotice.classList.add('hidden');
    } else if (data.subscriptionCancelledAt && data.subscriptionEndDate) {
        cancelBtn.classList.add('hidden');
        cancelledNotice.classList.remove('hidden');
        cancelledEndDate.textContent = formatDate(data.subscriptionEndDate);
    } else {
        cancelBtn.classList.add('hidden');
        cancelledNotice.classList.add('hidden');
    }
}

function renderUI(data) {
    // Check if user has any subscription history
    if (!data.subscriptionActive && !data.trialDaysRemaining && !data.subscriptionCancelledAt) {
        UI.showEmptyState();
        return;
    }

    UI.showContent();
    renderSubscriptionStatus(data);
    renderAICredits(data);
    renderActions(data);
}

// ===== Event Handlers =====
async function handleCancelClick() {
    const data = state.data;

    if (!data || !data.subscriptionEndDate) {
        // Calculate end date (30 days from now as placeholder)
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        document.getElementById('modal-end-date').textContent = formatDate(endDate.toISOString());
    } else {
        document.getElementById('modal-end-date').textContent = formatDate(data.subscriptionEndDate);
    }

    UI.openModal();
}

async function handleConfirmCancel() {
    UI.setButtonLoading('modal-confirm-btn', true);

    try {
        const result = await api.cancelSubscription();

        console.log('[CANCEL] Success:', result);

        UI.closeModal();
        UI.showToast('Subscription cancelled successfully. Access continues until period end.', 'success');

        // Refresh subscription data
        await loadSubscriptionData();

    } catch (error) {
        console.error('[CANCEL] Error:', error);
        UI.showToast(error.message || 'Failed to cancel subscription. Please try again.', 'error');
    } finally {
        UI.setButtonLoading('modal-confirm-btn', false);
    }
}

async function loadSubscriptionData() {
    UI.showLoading();
    state.setLoading(true);
    state.setError(null);

    try {
        const data = await api.fetchSubscriptionStatus();
        console.log('[DATA] Subscription status:', data);

        state.setState(data);
        state.setLoading(false);
        renderUI(data);

    } catch (error) {
        console.error('[DATA] Load error:', error);
        state.setError(error.message);
        state.setLoading(false);
        UI.showError(error.message || 'Unable to load subscription data');
    }
}

// ===== Event Listeners =====
function initializeEventListeners() {
    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancelClick);
    }

    // Modal buttons
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalOverlay = document.querySelector('.modal-overlay');

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', UI.closeModal);
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener('click', handleConfirmCancel);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', UI.closeModal);
    }

    // Retry button
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', loadSubscriptionData);
    }

    // Keyboard accessibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('cancel-modal');
            if (modal.classList.contains('active')) {
                UI.closeModal();
            }
        }
    });
}

// ===== Error Boundary =====
window.addEventListener('error', (event) => {
    console.error('[ERROR BOUNDARY]', event.error);
    UI.showToast('An unexpected error occurred', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[UNHANDLED REJECTION]', event.reason);
    UI.showToast('An unexpected error occurred', 'error');
});

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('[INIT] Subscription management page loaded');
    initializeEventListeners();
    loadSubscriptionData();
});

// ===== Export for testing (if needed) =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { api, UI, state, formatDate, calculateDaysRemaining };
}
