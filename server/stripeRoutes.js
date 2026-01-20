const fs = require('fs').promises;
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');

async function getTeachers() {
    try {
        const data = await fs.readFile(TEACHERS_FILE, 'utf8');
        return JSON.parse(data).teachers || [];
    } catch (e) {
        return [];
    }
}

async function saveTeachers(teachers) {
    try {
        await fs.writeFile(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
    } catch (e) {
        console.error('Failed to save teachers', e);
    }
}

module.exports = function (app, requireAuth) {

    // Create Stripe Checkout Session
    app.post('/api/stripe/create-checkout', requireAuth, async (req, res) => {
        try {
            const teacherId = req.teacherId;
            const teachers = await getTeachers();
            const teacher = teachers.find(t => t.id === teacherId);

            if (!teacher) {
                return res.status(404).json({ error: 'Teacher not found' });
            }

            const appUrl = req.headers.origin || 'http://localhost:3000';
            const priceId = process.env.STRIPE_PRICE_ID;
            const secretKey = process.env.STRIPE_SECRET_KEY;

            // Defensive logging
            const keyType = secretKey?.startsWith('sk_test_') ? 'TEST/SANDBOX' :
                secretKey?.startsWith('sk_live_') ? 'LIVE/PRODUCTION' : 'UNKNOWN';

            console.log('[STRIPE CHECKOUT] Configuration:', {
                keyType,
                priceId,
                teacherEmail: teacher.email,
                appUrl
            });

            // Create checkout session using customer_email ONLY
            // This prevents "No such customer" errors from sandbox/live mismatches
            const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                customer_email: teacher.email,
                success_url: `${appUrl}/dashboard/success.html?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appUrl}/dashboard/cancel.html`,
                metadata: {
                    teacherId: teacher.id
                }
            });

            console.log('[STRIPE CHECKOUT] Session created:', {
                sessionId: session.id,
                url: session.url
            });

            res.json({ url: session.url });

        } catch (error) {
            console.error('[STRIPE CHECKOUT ERROR]', {
                message: error.message,
                type: error.type,
                code: error.code,
                stack: error.stack
            });
            res.status(500).json({
                error: 'Failed to create checkout session',
                details: error.message
            });
        }
    });

    // Stripe Webhook Handler
    app.post('/api/stripe/webhook', async (req, res) => {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        // Debug logging
        console.log('[WEBHOOK DEBUG] Received webhook request');
        console.log('[WEBHOOK DEBUG] Signature present:', !!sig);
        console.log('[WEBHOOK DEBUG] Secret loaded:', !!webhookSecret);
        console.log('[WEBHOOK DEBUG] Secret value:', webhookSecret ? `${webhookSecret.substring(0, 15)}...` : 'UNDEFINED');
        console.log('[WEBHOOK DEBUG] Body type:', typeof req.body);
        console.log('[WEBHOOK DEBUG] Body is Buffer:', Buffer.isBuffer(req.body));

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                webhookSecret
            );
            console.log('[WEBHOOK DEBUG] Signature verified successfully');
        } catch (err) {
            console.error('[WEBHOOK ERROR] Signature verification failed:', err.message);
            console.error('[WEBHOOK ERROR] Error type:', err.type);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        console.log('Stripe webhook event:', event.type);

        try {
            const teachers = await getTeachers();

            switch (event.type) {
                case 'checkout.session.completed': {
                    const session = event.data.object;
                    const customerId = session.customer;
                    const subscriptionId = session.subscription;
                    const customerEmail = session.customer_email || session.customer_details?.email;

                    console.log('[WEBHOOK] Checkout session completed:', {
                        sessionId: session.id,
                        customerId,
                        subscriptionId,
                        customerEmail
                    });

                    // Match teacher by email (not by stored customer ID)
                    const teacher = teachers.find(t => t.email === customerEmail);
                    if (teacher) {
                        teacher.subscriptionActive = true;
                        teacher.stripeSubscriptionId = subscriptionId;
                        teacher.stripeCustomerId = customerId; // Store for future webhooks
                        teacher.aiCredits = 100;

                        await saveTeachers(teachers);
                        console.log(`[WEBHOOK] Subscription activated for teacher ${teacher.email}`);
                    } else {
                        console.warn(`[WEBHOOK] No teacher found with email ${customerEmail}`);
                    }
                    break;
                }

                case 'customer.subscription.created':
                case 'customer.subscription.updated': {
                    const subscription = event.data.object;
                    const customerId = subscription.customer;

                    const teacher = teachers.find(t => t.stripeCustomerId === customerId);
                    if (teacher) {
                        teacher.subscriptionActive = subscription.status === 'active';
                        teacher.stripeSubscriptionId = subscription.id;

                        // Reset AI credits on new subscription
                        if (subscription.status === 'active' && event.type === 'customer.subscription.created') {
                            teacher.aiCredits = 100;
                        }

                        await saveTeachers(teachers);
                        console.log(`Subscription ${subscription.status} for teacher ${teacher.email}`);
                    }
                    break;
                }

                case 'customer.subscription.deleted': {
                    const subscription = event.data.object;
                    const customerId = subscription.customer;

                    console.log('[WEBHOOK] Subscription deleted event:', {
                        customerId,
                        subscriptionId: subscription.id
                    });

                    const teacher = teachers.find(t => t.stripeCustomerId === customerId);
                    if (teacher) {
                        console.log('[WEBHOOK] Deactivating subscription for teacher:', teacher.email);

                        // Subscription period has ended - deactivate and clear credits
                        teacher.subscriptionActive = false;
                        teacher.stripeSubscriptionId = null;
                        teacher.aiCredits = 0;

                        // Clear cancellation tracking fields
                        teacher.subscriptionCancelledAt = null;
                        teacher.subscriptionEndDate = null;

                        await saveTeachers(teachers);

                        console.log('[WEBHOOK] Subscription fully deactivated:', {
                            email: teacher.email,
                            active: false,
                            credits: 0
                        });
                    } else {
                        console.warn('[WEBHOOK] No teacher found for deleted subscription:', customerId);
                    }
                    break;
                }

                case 'invoice.payment_succeeded': {
                    const invoice = event.data.object;
                    const customerId = invoice.customer;

                    const teacher = teachers.find(t => t.stripeCustomerId === customerId);
                    if (teacher) {
                        // Reset AI credits monthly on successful payment
                        teacher.aiCredits = 100;
                        teacher.subscriptionActive = true;
                        await saveTeachers(teachers);
                        console.log(`Payment succeeded for teacher ${teacher.email}, credits reset to 100`);
                    }
                    break;
                }

                case 'invoice.payment_failed': {
                    const invoice = event.data.object;
                    const customerId = invoice.customer;

                    const teacher = teachers.find(t => t.stripeCustomerId === customerId);
                    if (teacher) {
                        teacher.subscriptionActive = false;
                        await saveTeachers(teachers);
                        console.log(`Payment failed for teacher ${teacher.email}`);
                    }
                    break;
                }
            }

            res.json({ received: true });

        } catch (error) {
            console.error('Webhook processing error:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    });

    // Cancel Subscription (at period end)
    app.post('/api/stripe/cancel-subscription', requireAuth, async (req, res) => {
        try {
            const teacherId = req.teacherId;
            const teachers = await getTeachers();
            const teacher = teachers.find(t => t.id === teacherId);

            console.log('[CANCEL] Cancellation request from teacher:', teacher?.email);

            if (!teacher) {
                console.error('[CANCEL] Teacher not found:', teacherId);
                return res.status(404).json({ error: 'Teacher not found' });
            }

            if (!teacher.stripeSubscriptionId) {
                console.warn('[CANCEL] No active subscription for teacher:', teacher.email);
                return res.status(404).json({ error: 'No active subscription found' });
            }

            // Check if already cancelled
            if (teacher.subscriptionCancelledAt) {
                console.warn('[CANCEL] Subscription already cancelled:', teacher.email);
                return res.status(400).json({
                    error: 'Subscription already cancelled',
                    endsAt: teacher.subscriptionEndDate
                });
            }

            console.log('[CANCEL] Cancelling subscription in Stripe:', teacher.stripeSubscriptionId);

            // Cancel at period end (user keeps access until paid period expires)
            const subscription = await stripe.subscriptions.update(
                teacher.stripeSubscriptionId,
                { cancel_at_period_end: true }
            );

            console.log('[CANCEL] Stripe cancellation successful:', {
                subscriptionId: subscription.id,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
            });

            // Update database
            const now = new Date().toISOString();
            const endDate = new Date(subscription.current_period_end * 1000).toISOString();

            teacher.subscriptionCancelledAt = now;
            teacher.subscriptionEndDate = endDate;
            // Keep subscriptionActive = true until period ends
            // Keep aiCredits until period ends

            await saveTeachers(teachers);

            console.log('[CANCEL] Database updated:', {
                email: teacher.email,
                cancelledAt: now,
                endsAt: endDate,
                stillActive: teacher.subscriptionActive
            });

            res.json({
                success: true,
                message: 'Subscription will be cancelled at the end of the billing period',
                endsAt: endDate,
                cancelledAt: now
            });

        } catch (error) {
            console.error('[CANCEL ERROR]', {
                message: error.message,
                type: error.type,
                code: error.code,
                stack: error.stack
            });

            res.status(500).json({
                error: 'Failed to cancel subscription',
                details: error.message
            });
        }
    });

    // Get subscription status
    app.get('/api/stripe/subscription-status', requireAuth, async (req, res) => {
        try {
            const teacherId = req.teacherId;
            const teachers = await getTeachers();
            const teacher = teachers.find(t => t.id === teacherId);

            if (!teacher) {
                return res.status(404).json({ error: 'Teacher not found' });
            }

            const { getSubscriptionStatus } = require('./subscriptionMiddleware');
            const status = getSubscriptionStatus(teacher);

            res.json({
                hasAccess: status.hasAccess,
                reason: status.reason,
                aiCredits: status.aiCredits || 0,
                trialDaysRemaining: status.trialDaysRemaining || 0,
                subscriptionActive: teacher.subscriptionActive || false,
                emailVerified: teacher.emailVerified || false
            });

        } catch (error) {
            console.error('Get subscription status error:', error);
            res.status(500).json({ error: 'Failed to get subscription status' });
        }
    });
};
