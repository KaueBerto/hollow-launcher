$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$project = Split-Path $PSScriptRoot -Parent
$logo = [System.Drawing.Image]::FromFile((Join-Path $project 'assets\averon-smp.png'))
try {
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $frames = @()
    foreach ($size in $sizes) {
        $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $canvas = [System.Drawing.Graphics]::FromImage($bitmap)
        $stream = [System.IO.MemoryStream]::new()
        try {
            $canvas.Clear([System.Drawing.Color]::Transparent)
            $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $canvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $scale = [Math]::Min($size / $logo.Width, $size / $logo.Height)
            $width = [int][Math]::Round($logo.Width * $scale)
            $height = [int][Math]::Round($logo.Height * $scale)
            $canvas.DrawImage($logo, [int](($size - $width) / 2), [int](($size - $height) / 2), $width, $height)
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $frames += ,$stream.ToArray()
        } finally { $stream.Dispose(); $canvas.Dispose(); $bitmap.Dispose() }
    }
    $file = [System.IO.File]::Create((Join-Path $project 'assets\averon.ico'))
    $writer = [System.IO.BinaryWriter]::new($file)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($index = 0; $index -lt $sizes.Count; $index++) {
            $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$index].Length); $writer.Write([uint32]$offset)
            $offset += $frames[$index].Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
    } finally { $writer.Dispose(); $file.Dispose() }
    Write-Output 'AVERON icon generated: 16, 24, 32, 48, 64, 128, 256 px; original aspect ratio and transparency preserved.'
} finally { $logo.Dispose() }
