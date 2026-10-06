$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1')
$exe = Join-Path $projectRoot 'dist\HollowSMP-Launcher.exe'
$testRoot = Join-Path $projectRoot ('dist\tests-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $testRoot | Out-Null
foreach ($check in @(@('--self-test','engine.txt'), @('--verify-reset','reset.txt'), @('--verify-selectors','ui.txt'), @('--preview','preview.png'))) {
    $output = Join-Path $testRoot $check[1]
    $process = Start-Process -FilePath $exe -ArgumentList @($check[0], ('"' + $output + '"')) -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        $errorFile = Join-Path $testRoot 'launcher-test-error.txt'
        if (Test-Path -LiteralPath $errorFile) { Get-Content -LiteralPath $errorFile }
        throw "Falha em $($check[0]). Consulte $testRoot"
    }
}
Get-Content -LiteralPath (Join-Path $testRoot 'engine.txt')
Get-Content -LiteralPath (Join-Path $testRoot 'reset.txt')
Get-Content -LiteralPath (Join-Path $testRoot 'ui.txt')
Write-Output "Verificações concluídas. Relatórios: $testRoot"
