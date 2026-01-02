class ResultScreen {
    constructor({ container, onRetry, onNext }) {
        this.containerSelector = container || 'body';
        this.onRetry = onRetry || (() => { });
        this.onNext = onNext || (() => { });

        this.init();
    }

    init() {
        // Prevent multiples
        if (document.getElementById('result-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'result-overlay';
        overlay.innerHTML = `
            <svg class="svg-defs">
                <defs>
                    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#FFD700;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#FFA500;stop-opacity:1" />
                    </linearGradient>
                </defs>
            </svg>
            <div class="result-card">
                <div class="result-content">
                    <div class="stars-container">
                        <svg class="star-icon star-1" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        <svg class="star-icon star-2" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        <svg class="star-icon star-3" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                    </div>
                    
                    <h1 class="result-title" id="rs-title">Title</h1>
                    <p class="result-msg" id="rs-msg">Message</p>
                    
                    <div class="result-actions">
                        <button class="rs-btn rs-btn-secondary" id="rs-retry">
                           ↺ Retry
                        </button>
                        <button class="rs-btn rs-btn-primary" id="rs-next">
                           Next ➔
                        </button>
                    </div>
                </div>
            </div>
        `;

        const target = document.querySelector(this.containerSelector) || document.body;
        target.appendChild(overlay);

        this.overlay = overlay;

        // Bind logic
        document.getElementById('rs-retry').addEventListener('click', () => {
            this.hide();
            this.onRetry();
        });
        document.getElementById('rs-next').addEventListener('click', () => {
            this.hide();
            this.onNext();
        });
    }

    /*
      Standard API
      success: boolean
      attempts: number
      lang: 'en' | 'fr'
    */
    show({ success, attempts, lang, overrideStars, overrideTitle, showRetry }) {
        // 1. Text Config (Strict EN/FR)
        const TEXT = {
            en: {
                winTitle: 'Awesome!',
                winMsg: 'You did it!',
                failTitle: 'Almost!',
                failMsg: 'Try again 💪',
                retry: 'Retry',
                next: 'Next'
            },
            fr: {
                winTitle: 'Bravo !',
                winMsg: 'Tu as réussi !',
                failTitle: 'Presque !',
                failMsg: 'Essaie encore 💪',
                retry: 'Réessayer',
                next: 'Suivant'
            }
        };

        const t = TEXT[lang] || TEXT.en;
        const titleEl = document.getElementById('rs-title');
        const msgEl = document.getElementById('rs-msg');
        const retryBtn = document.getElementById('rs-retry');
        const nextBtn = document.getElementById('rs-next');

        // 2. Logic: Dynamic Stars (Randomized + Weighted)
        let stars = 0;

        if (success) {
            // Success: 2 or 3 stars
            if (attempts <= 1) {
                // High chance of 3 stars for first try
                stars = Math.random() > 0.2 ? 3 : 2;
            } else {
                // good chance of 2 stars, small chance of 3
                stars = Math.random() > 0.6 ? 3 : 2;
            }
        } else {
            // Fail: 1 or 2 stars (Always encouraging)
            if (attempts <= 1) {
                // First fail: Encouraging 2 stars often
                stars = Math.random() > 0.4 ? 2 : 1;
            } else {
                // Repeat fail: mostly 1 star
                stars = 1;
            }
        }

        // 3. Render Text
        if (success) {
            titleEl.textContent = overrideTitle || t.winTitle; // Allow Override
            msgEl.textContent = t.winMsg;
            titleEl.style.color = 'var(--rs-purple)';
            nextBtn.style.display = 'flex';
        } else {
            titleEl.textContent = overrideTitle || t.failTitle; // Allow Override
            msgEl.textContent = t.failMsg;
            titleEl.style.color = '#555';
            nextBtn.style.display = 'none';
        }

        // Hide Retry if requested (e.g. Session Success)
        if (showRetry === false) {
            retryBtn.style.display = 'none';
        } else {
            retryBtn.style.display = 'flex';
        }

        // Apply Override Stars if provided
        if (overrideStars !== undefined) {
            stars = overrideStars;
        }

        // Update Button Text
        retryBtn.innerHTML = `↺ ${t.retry}`;
        nextBtn.innerHTML = `${t.next} ➔`;

        // 4. Animate Stars (Staggered)
        const starEls = document.querySelectorAll('.star-icon');
        starEls.forEach(s => s.classList.remove('earned', 'star-1', 'star-2', 'star-3'));

        // Force reflow for animation restart
        void this.overlay.offsetWidth;

        if (stars > 0) {
            // Stagger delays: 150ms, 300ms, 450ms
            setTimeout(() => {
                if (stars >= 1) starEls[0].classList.add('earned');
                if (stars >= 2) setTimeout(() => starEls[1].classList.add('earned'), 150);
                if (stars >= 3) setTimeout(() => starEls[2].classList.add('earned'), 300);
            }, 100);
        }

        // 5. Reveal
        this.overlay.classList.add('visible');
    }

    hide() {
        this.overlay.classList.remove('visible');
    }
}
