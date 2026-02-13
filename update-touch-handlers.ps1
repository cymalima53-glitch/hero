# Batch add touch handlers to all game.js files (games 3-13)
$touchHandler = @'
// Universal Touch-Click Handler for iPad/Mobile Compatibility
function addTouchClick(element, handler) {
    let touchStarted = false;
    
    element.addEventListener('click', handler);
    
    element.addEventListener('touchstart', (e) => {
        touchStarted = true;
        e.preventDefault();
    }, { passive: false });
    
    element.addEventListener('touchend', (e) => {
        if (touchStarted) {
            e.preventDefault();
            handler(e);
            touchStarted = false;
        }
    }, { passive: false });
    
    element.addEventListener('touchcancel', () => {
        touchStarted = false;
    });
}

'@

$games = @('game3', 'game4', 'game5', 'game6', 'game7', 'game8', 'game9', 'game10', 'game11', 'game12', 'game13')

foreach ($game in $games) {
    $file = "$game\game.js"
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Add touch handler at the beginning if not already present
        if ($content -notmatch 'addTouchClick') {
            $content = $touchHandler + $content
            
            # Replace addEventListener('click' with addTouchClick(
            $content = $content -replace "(\w+)\.addEventListener\('click',\s*([^)]+)\)", 'addTouchClick($1, $2)'
            
            Set-Content $file -Value $content -NoNewline
            Write-Host "Updated $file" -ForegroundColor Green
        } else {
            Write-Host "Skipped $file (already has touch handler)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`nAll game.js files updated!" -ForegroundColor Cyan
