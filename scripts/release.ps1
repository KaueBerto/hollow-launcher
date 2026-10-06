param([switch]$Publish)
$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
$source = Split-Path $PSScriptRoot -Parent
Push-Location $source
try {
    if ((git remote get-url origin) -ne 'https://github.com/KaueBerto/hollow-launcher.git') { throw 'Repositório inesperado.' }
    if (git status --porcelain) { throw 'Faça commit antes de publicar.' }
    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use uma versão estável.' }
    $names = @("HollowSMP-Launcher-Setup-$version.exe", "HollowSMP-Launcher-Setup-$version.exe.blockmap", 'latest.yml', 'SHA256.txt', 'HollowSMP-Launcher-Windows.zip')
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
    try { $release = Invoke-RestMethod ($api+'/releases/tags/v'+$version) -Headers $headers }
    catch {
        if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
        $body = @{tag_name=('v'+$version); target_commitish=(git rev-parse HEAD); name=('Hollow Launcher '+$version); body='Instalador Windows com atualização automática pelo GitHub. Instale uma vez e abra pelo atalho. As próximas versões são baixadas em segundo plano: feche o Minecraft e clique em Atualizar e reiniciar. Dados do jogo preservados. Microsoft ainda depende do cadastro próprio aprovado do Hollow.'; draft=$true; prerelease=$false} | ConvertTo-Json
        $release = Invoke-RestMethod ($api+'/releases') -Method Post -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8'
    }
    if (-not $release.draft) { throw 'Release publicada: não substituir arquivos.' }
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
    foreach ($name in $names) { if ($release.assets.name -notcontains $name) { throw "Upload incompleto: $name" } }
    if ($Publish) { $release = Invoke-RestMethod ($api+'/releases/'+$release.id) -Method Patch -Headers $headers -Body (@{draft=$false; prerelease=$false; make_latest='true'} | ConvertTo-Json) -ContentType 'application/json' }
    Write-Output ('Release: '+$release.html_url)
    Write-Output ('Rascunho: '+$release.draft)
} finally { Pop-Location }
