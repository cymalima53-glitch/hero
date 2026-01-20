const API_BASE = window.location.protocol.startsWith('file') ? 'http://localhost:3000' : '';

const elements = {
    subscribeBtn: document.getElementById('subscribe-btn'),
    btnText: document.getElementById('btn-text'),
    btnLoader: document.getElementById('btn-loader'),
    errorMessage: document.getElementById('error-message'),
    accessGranted: document.getElementById('access-granted'),
    pricingContent: document.getElementById('pricing-content')
};

async function checkSubscriptionStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/stripe/subscription-status`, {
            credentials: 'include'
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        if (data.hasAccess && (data.reason === 'paid' || data.reason === 'internal_free')) {
            elements.pricingContent.classList.add('hidden');
            elements.accessGranted.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Subscription status check failed:', error);
    }
}

async function handleSubscribe() {
    elements.subscribeBtn.disabled = true;
    elements.btnText.classList.add('hidden');
    elements.btnLoader.classList.remove('hidden');
    elements.errorMessage.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE}/api/stripe/create-checkout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create checkout session');
        }

        const data = await response.json();

        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('No checkout URL returned');
        }
    } catch (error) {
        elements.errorMessage.textContent = error.message;
        elements.errorMessage.classList.remove('hidden');

        elements.subscribeBtn.disabled = false;
        elements.btnText.classList.remove('hidden');
        elements.btnLoader.classList.add('hidden');
    }
}

elements.subscribeBtn.addEventListener('click', handleSubscribe);

checkSubscriptionStatus();
