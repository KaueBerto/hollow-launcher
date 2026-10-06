$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Instale o .NET Framework 4.8 em um Windows de 64 bits.' }
$dist = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$exe = Join-Path $dist 'HollowSMP-Launcher.exe'
$assets = Join-Path $projectRoot 'assets'
$mod = Join-Path $assets 'automodpack-5.0.0-rc.2.jar'
if ((Get-FileHash -LiteralPath $mod -Algorithm SHA256).Hash -ne '96DC57F223B83850A1684EBB8283E1E6AA5CFB89AE5226464DE6D5FC85BB1F80') {
    throw 'AutoModpack diferente da versão verificada.'
}
$arguments = @(
    '/nologo', '/target:winexe', '/platform:x64', '/codepage:65001', "/out:$exe",
    "/win32icon:$(Join-Path $assets 'hollow.ico')",
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
    '/reference:System.Web.Extensions.dll', '/reference:System.Net.Http.dll',
    '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
    "/resource:$mod,AutoModpack.jar",
    "/resource:$(Join-Path $assets 'logo_smp.png'),HollowLogo.png",
    "/resource:$(Join-Path $assets 'Monocraft.ttf'),Monocraft.ttf",
    "/resource:$(Join-Path $assets 'Monocraft-Bold.ttf'),Monocraft-Bold.ttf",
    (Join-Path $projectRoot 'src\HollowLauncher.cs'),
    (Join-Path $projectRoot 'src\LauncherUI.cs')
)
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'A compilação falhou.' }
Write-Output "Criado: $exe"
