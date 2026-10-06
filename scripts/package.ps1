$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1')
$dist = Join-Path $projectRoot 'dist'
$stage = Join-Path $dist ('package-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item -LiteralPath (Join-Path $dist 'HollowSMP-Launcher.exe') -Destination $stage
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\LEIA-ME.txt') -Destination $stage
Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD-PARTY.txt') -Destination $stage
Copy-Item -LiteralPath (Join-Path $projectRoot 'licenses') -Destination $stage -Recurse
$zip = Join-Path $dist 'HollowSMP-Launcher-Windows.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $dist 'SHA256.txt'), "$hash  HollowSMP-Launcher-Windows.zip`r`n", [Text.UTF8Encoding]::new($false))
Write-Output "Pacote: $zip"
