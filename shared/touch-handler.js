/**
 * Universal Touch-Click Handler for iPad/Mobile Compatibility
 * 
 * Adds both mouse click and touch event support to elements.
 * Prevents ghost clicks and handles touch cancellation properly.
 * 
 * Usage: Replace addEventListener('click', handler) with addTouchClick(element, handler)
 */

function addTouchClick(element, handler) {
    let touchStarted = false;

    // Mouse click (desktop)
    element.addEventListener('click', handler);

    // Touch start - mark that touch began
    element.addEventListener('touchstart', (e) => {
        touchStarted = true;
        e.preventDefault(); // Prevent ghost clicks
    }, { passive: false });

    // Touch end - trigger handler if touch started on this element
    element.addEventListener('touchend', (e) => {
        if (touchStarted) {
            e.preventDefault(); // Prevent ghost clicks
            handler(e);
            touchStarted = false;
        }
    }, { passive: false });

    // Touch cancel - reset if touch is cancelled (user drags away)
    element.addEventListener('touchcancel', () => {
        touchStarted = false;
    });
}

// Export for use in games
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { addTouchClick };
}
