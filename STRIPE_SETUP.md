# Stripe Subscription System - Setup Guide

## Overview

This implementation adds a secure Stripe subscription system with:
- **3-day FREE trial** with FULL ACCESS (starts after email verification)
- **$10/month subscription**
- **AI credit system** (100 credits/month)
- **Abuse prevention** (IP rate limiting + device fingerprinting)
- **Internal free teachers** (email allowlist)

---

## Setup Instructions

### 1. Install Dependencies

```bash
npm install stripe
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

**How to get Stripe credentials:**

1. Create a Stripe account at https://stripe.com
2. Go to Developers → API keys
3. Copy your Secret key and Publishable key
4. Create a product with $10/month recurring price
5. Copy the Price ID (starts with `price_`)
6. Set up webhook endpoint (see below)

### 3. Set Up Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Enter your webhook URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the Webhook signing secret and add to `.env` as `STRIPE_WEBHOOK_SECRET`

### 4. Configure Internal Free Teachers (Optional)

Edit `data/internal_free_teachers.json`:

```json
{
  "allowlist": [
    "admin@yourschool.edu",
    "principal@yourschool.edu"
  ]
}
```

Teachers with these emails will get unlimited access without Stripe.

### 5. Start the Server

```bash
node server.js
```

---

## How It Works

### Registration Flow

1. User registers → Email verification sent
2. User clicks verification link
3. **Trial starts** (3 days, FULL ACCESS, 100 AI credits)
4. User can use all features during trial

### After Trial Ends

- All protected routes blocked
- User redirected to `/dashboard/pricing.html`
- Must subscribe to continue

### Subscription Flow

1. User clicks "Subscribe Now" on pricing page
2. Redirected to Stripe Checkout
3. After payment → Webhook activates subscription
4. User gets full access + 100 AI credits/month

### AI Credit System

- **Trial users**: 100 credits
- **Paid users**: 100 credits/month (resets on payment)
- **Internal free**: Unlimited credits
- **Deduction**: 1 credit per AI content generation

### Abuse Prevention

- **IP Rate Limiting**: Max 3 registrations per IP per 24h
- **Device Fingerprinting**: Prevents re-trial from same device
- **Backend Validation**: Never trusts frontend flags

---

## Protected Routes

All these routes require active trial OR paid subscription:

- `/api/analytics/*` - Analytics and insights
- `/api/assignments` - Create/manage assignments
- `/api/students` - Student management
- `/data/:lang` (POST) - Content editor
- `/api/files/*` - File management
- `/api/generate-content` - AI content generator (also requires credits)

---

## Testing

### Test Stripe Checkout

Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Expiry: Any future date
- CVC: Any 3 digits

### Test Webhook Locally

Use Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### Test Trial Expiration

Manually edit `data/teachers.json` and set `trialEnd` to a past date:

```json
{
  "trialEnd": "2026-01-01T00:00:00.000Z"
}
```

Then try accessing protected routes → should redirect to pricing.

---

## Frontend Integration (Remaining Work)

### Add Device Fingerprinting to Registration

Update `/public/login.html` or registration form:

```javascript
// Generate device fingerprint
function getDeviceFingerprint() {
    const data = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset()
    ].join('|');
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash = hash & hash;
    }
    
    // Store in localStorage
    let fingerprint = localStorage.getItem('device_fp');
    if (!fingerprint) {
        fingerprint = 'fp_' + Math.abs(hash).toString(36);
        localStorage.setItem('device_fp', fingerprint);
    }
    
    return fingerprint;
}

// Include in registration request
const deviceFingerprint = getDeviceFingerprint();
fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceFingerprint })
});
```

### Add Trial Countdown to Dashboard

```javascript
// Fetch subscription status
fetch('/api/stripe/subscription-status', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        if (data.reason === 'trial' && data.trialDaysRemaining) {
            // Show trial banner
            const banner = document.createElement('div');
            banner.innerHTML = `
                <div style="background: #fff3cd; padding: 10px; text-align: center;">
                    Trial: ${data.trialDaysRemaining} days remaining
                    <a href="/dashboard/pricing.html">Upgrade Now</a>
                </div>
            `;
            document.body.prepend(banner);
        }
        
        // Show AI credits
        if (data.aiCredits !== undefined) {
            document.getElementById('aiCredits').textContent = data.aiCredits;
        }
    });
```

### Handle Subscription Errors

```javascript
// Catch 403 errors and redirect to pricing
fetch('/api/analytics/student/123', { credentials: 'include' })
    .then(r => {
        if (r.status === 403) {
            return r.json().then(data => {
                if (data.redirectTo) {
                    window.location.href = data.redirectTo;
                }
            });
        }
        return r.json();
    });
```

---

## Security Notes

- ✅ All subscription checks happen on backend
- ✅ Stripe webhooks are the single source of truth
- ✅ Frontend flags are NEVER trusted
- ✅ IP and device fingerprints prevent abuse
- ✅ Email verification required before trial
- ✅ Webhook signatures verified

---

## Troubleshooting

**Webhook not working:**
- Check `STRIPE_WEBHOOK_SECRET` is correct
- Verify webhook endpoint is publicly accessible
- Check server logs for signature verification errors

**Trial not starting:**
- Verify email verification link was clicked
- Check `data/teachers.json` for `emailVerified: true`
- Check server logs for trial start confirmation

**Credits not deducting:**
- Check `requireAICredits` middleware is applied
- Verify teacher is not `internal_free` role
- Check server logs for credit deduction messages

---

## Next Steps

1. Add device fingerprinting to registration form
2. Add trial countdown banner to dashboard
3. Add AI credits display to dashboard
4. Test full user journey (register → verify → trial → subscribe)
5. Set up production Stripe webhook endpoint
6. Switch to production Stripe keys before launch
