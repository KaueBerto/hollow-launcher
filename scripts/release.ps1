param([switch]$Publish, [string]$NotesFile)
$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
$source = Split-Path $PSScriptRoot -Parent
Push-Location $source
try {
    if ((git remote get-url origin) -ne 'https://github.com/KaueBerto/hollow-launcher.git') { throw 'Repositório inesperado.' }
    if (git status --porcelain) { throw 'Faça commit antes de publicar.' }
    $metadata = Get-Content package.json -Raw | ConvertFrom-Json
    $version = $metadata.version
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use uma versão estável.' }
    $installer = $metadata.build.win.artifactName.Replace('${version}', $version)
    $names = @($installer, "$installer.blockmap", 'latest.yml', 'SHA256.txt', 'AveronSMP-Launcher-Windows.zip')
    foreach ($name in $names) { if (-not (Test-Path -LiteralPath "dist/$name")) { throw "Arquivo ausente: $name" } }
    if (-not (Select-String -LiteralPath 'dist/latest.yml' -Pattern ("^version: " + [regex]::Escape($version) + '$') -Quiet)) { throw 'Metadados de outra versão.' }
    $credentialData = @{}
    $lines = "protocol=https`nhost=github.com`n`n" | git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'Credencial indisponível.' }
    foreach ($line in $lines) { if ($line -match '^([^=]+)=(.*)$') { $credentialData[$matches[1]] = $matches[2] } }
    $headers = @{Authorization=('Bearer '+$credentialData.password); Accept='application/vnd.github+json'; 'User-Agent'='HollowLauncher-release'}
    $api = 'https://api.github.com/repos/KaueBerto/hollow-launcher'
    if ((Invoke-RestMethod $api -Headers $headers).private) { throw 'A atualização pública requer repositório público.' }
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar o código.' }
    $notes = if ($NotesFile) { [IO.File]::ReadAllText((Resolve-Path -LiteralPath $NotesFile).Path, [Text.Encoding]::UTF8) } else { 'Atualização do Averon Launcher. Instale ou reabra o launcher para atualizar automaticamente. Dados do jogo e preferências preservados.' }
    $releaseName = $metadata.build.productName+' '+$version
    try { $release = Invoke-RestMethod ($api+'/releases/tags/v'+$version) -Headers $headers }
    catch {
        if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
        $allReleases = Invoke-RestMethod ($api+'/releases') -Headers $headers
        $drafts = @($allReleases | Where-Object { $_.draft -and $_.name -eq $releaseName })
        if ($drafts.Count -gt 1) { throw 'Mais de um rascunho para a mesma versão.' }
        if ($drafts.Count -eq 1) { $release = $drafts[0] }
        else {
            $body = @{tag_name=('v'+$version); target_commitish=(git rev-parse HEAD); name=$releaseName; body=$notes; draft=$true; prerelease=$false} | ConvertTo-Json
            $release = Invoke-RestMethod ($api+'/releases') -Method Post -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8'
        }
    }
    if (-not $release.draft) { throw 'Release publicada: não substituir arquivos.' }
    if ($release.target_commitish -ne (git rev-parse HEAD)) { throw 'Rascunho de outro commit.' }
    $upload = $release.upload_url -replace '\{.*$', ''
    foreach ($name in $names) {
        $hash = (Get-FileHash -LiteralPath "dist/$name" -Algorithm SHA256).Hash.ToLowerInvariant()
        $existing = $release.assets | Where-Object { $_.name -eq $name }
        if ($existing) { if ($existing.digest -ne ('sha256:'+$hash)) { throw "Arquivo existente divergente: $name" }; continue }
        $asset = Invoke-RestMethod ($upload+'?name='+[Uri]::EscapeDataString($name)) -Method Post -Headers $headers -InFile "dist/$name" -ContentType 'application/octet-stream' -TimeoutSec 600
        if ($asset.digest -ne ('sha256:'+$hash)) { throw "Hash divergente: $name" }
        Write-Output ('Enviado: '+$name)
    }
    $release = Invoke-RestMethod ($api+'/releases/'+$release.id) -Headers $headers
    foreach ($name in $names) {
        $expectedHash = (Get-FileHash -LiteralPath "dist/$name" -Algorithm SHA256).Hash.ToLowerInvariant()
        $assets = @($release.assets | Where-Object { $_.name -eq $name })
        if ($assets.Count -ne 1 -or $assets[0].digest -ne ('sha256:'+$expectedHash)) { throw "Upload incompleto ou divergente: $name" }
    }
    if ($Publish) {
        $body = @{tag_name=('v'+$version); target_commitish=(git rev-parse HEAD); name=$releaseName; body=$notes; draft=$false; prerelease=$false; make_latest='true'} | ConvertTo-Json
        $release = Invoke-RestMethod ($api+'/releases/'+$release.id) -Method Patch -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8'
    }
    Write-Output ('Release: '+$release.html_url)
    Write-Output ('Rascunho: '+$release.draft)
} finally { Pop-Location }
