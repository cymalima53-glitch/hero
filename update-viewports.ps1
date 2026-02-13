# Batch update viewport meta tags for games 4-13
$games = @('game4', 'game5', 'game6', 'game7', 'game8', 'game9', 'game10', 'game11', 'game12', 'game13')

foreach ($game in $games) {
    $file = "$game\index.html"
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Replace old viewport with new one
        $oldViewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        $newViewport = @"
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
"@
        
        $content = $content.Replace($oldViewport, $newViewport)
        Set-Content $file -Value $content -NoNewline
        
        Write-Host "Updated $file" -ForegroundColor Green
    }
}

Write-Host "`nAll HTML files updated!" -ForegroundColor Cyan
