# Batch add credentials: 'include' to all game fetch requests
$games = @('game2', 'game3', 'game4', 'game5', 'game6', 'game7', 'game8', 'game9', 'game10', 'game11', 'game12', 'game13')

foreach ($game in $games) {
    $file = "$game\game.js"
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Pattern 1: fetch(`/data/${lang}?t=${Date.now()}`)
        $pattern1 = "fetch\(`/data/\$\{lang\}\?t=\$\{Date\.now\(\)\}`\)"
        $replacement1 = "fetch(`/data/`${lang}?t=`${Date.now()}`, { credentials: 'include' })"
        
        # Pattern 2: fetch(`/data/${lang}`)
        $pattern2 = "fetch\(`/data/\$\{lang\}`\)"
        $replacement2 = "fetch(`/data/`${lang}`, { credentials: 'include' })"
        
        # Pattern 3: fetch('/data/' + lang)
        $pattern3 = "fetch\('/data/' \+ lang\)"
        $replacement3 = "fetch('/data/' + lang, { credentials: 'include' })"
        
        $modified = $false
        
        if ($content -match $pattern1) {
            $content = $content -replace $pattern1, $replacement1
            $modified = $true
        }
        
        if ($content -match $pattern2) {
            $content = $content -replace $pattern2, $replacement2
            $modified = $true
        }
        
        if ($content -match $pattern3) {
            $content = $content -replace $pattern3, $replacement3
            $modified = $true
        }
        
        if ($modified) {
            Set-Content $file -Value $content -NoNewline
            Write-Host "✓ Updated $file" -ForegroundColor Green
        }
        else {
            Write-Host "⊘ No fetch patterns found in $file" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n✅ All games updated with credentials: 'include'" -ForegroundColor Cyan
