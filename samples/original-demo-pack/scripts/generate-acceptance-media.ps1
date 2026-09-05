$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$packRoot = Split-Path -Parent $PSScriptRoot
$audioDirectory = Join-Path $packRoot 'media\audio'
$imageDirectory = Join-Path $packRoot 'media\images'
[System.IO.Directory]::CreateDirectory($audioDirectory) | Out-Null
[System.IO.Directory]::CreateDirectory($imageDirectory) | Out-Null

$tonePath = Join-Path $audioDirectory 'original-demo-tones.wav'
$sampleRate = 16000
$durationSeconds = 4
$sampleCount = $sampleRate * $durationSeconds
$dataLength = $sampleCount * 2
$stream = [System.IO.File]::Open($tonePath, [System.IO.FileMode]::Create)
$writer = [System.IO.BinaryWriter]::new($stream)
try {
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
    $writer.Write([uint32](36 + $dataLength))
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes('fmt '))
    $writer.Write([uint32]16)
    $writer.Write([uint16]1)
    $writer.Write([uint16]1)
    $writer.Write([uint32]$sampleRate)
    $writer.Write([uint32]($sampleRate * 2))
    $writer.Write([uint16]2)
    $writer.Write([uint16]16)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
    $writer.Write([uint32]$dataLength)

    $notes = @(440.0, 554.37, 659.25, 880.0)
    for ($sample = 0; $sample -lt $sampleCount; $sample++) {
        $second = $sample / $sampleRate
        $slot = [Math]::Floor($second)
        $withinSlot = $second - $slot
        $amplitude = if ($withinSlot -lt 0.62) { 0.28 } else { 0.0 }
        $frequency = $notes[[Math]::Min($slot, $notes.Count - 1)]
        $value = [int16]([Math]::Round(32767 * $amplitude * [Math]::Sin(2 * [Math]::PI * $frequency * $second)))
        $writer.Write($value)
    }
}
finally {
    $writer.Dispose()
    $stream.Dispose()
}

$chartPath = Join-Path $imageDirectory 'original-workshop-attendance.png'
$bitmap = [System.Drawing.Bitmap]::new(900, 560)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$titleFont = [System.Drawing.Font]::new('Segoe UI', 19, [System.Drawing.FontStyle]::Bold)
$labelFont = [System.Drawing.Font]::new('Segoe UI', 10)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 9)
$axisPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(65, 73, 88), 2)
$gridPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(220, 224, 231), 1)
$textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38, 45, 58))
$series = @(
    @{ Name = 'Repair cafe'; Color = [System.Drawing.Color]::FromArgb(48, 104, 126); Values = @(42, 55, 61) },
    @{ Name = 'Seed exchange'; Color = [System.Drawing.Color]::FromArgb(218, 139, 80); Values = @(68, 64, 79) },
    @{ Name = 'Bicycle skills'; Color = [System.Drawing.Color]::FromArgb(105, 139, 105); Values = @(35, 47, 46) }
)
$months = @('January', 'February', 'March')

try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(249, 248, 244))
    $graphics.DrawString('Attendance at Alderwick community workshops', $titleFont, $textBrush, 90, 24)
    $plotLeft = 92
    $plotTop = 96
    $plotWidth = 720
    $plotHeight = 350
    for ($value = 0; $value -le 90; $value += 10) {
        $y = $plotTop + $plotHeight - ($value / 90.0 * $plotHeight)
        $graphics.DrawLine($gridPen, $plotLeft, $y, $plotLeft + $plotWidth, $y)
        $graphics.DrawString([string]$value, $smallFont, $textBrush, 55, $y - 8)
    }
    $graphics.DrawLine($axisPen, $plotLeft, $plotTop, $plotLeft, $plotTop + $plotHeight)
    $graphics.DrawLine($axisPen, $plotLeft, $plotTop + $plotHeight, $plotLeft + $plotWidth, $plotTop + $plotHeight)

    $groupWidth = 190
    $barWidth = 42
    for ($monthIndex = 0; $monthIndex -lt $months.Count; $monthIndex++) {
        $groupLeft = $plotLeft + 55 + ($monthIndex * 235)
        for ($seriesIndex = 0; $seriesIndex -lt $series.Count; $seriesIndex++) {
            $item = $series[$seriesIndex]
            $attendance = $item.Values[$monthIndex]
            $height = $attendance / 90.0 * $plotHeight
            $x = $groupLeft + ($seriesIndex * ($barWidth + 8))
            $y = $plotTop + $plotHeight - $height
            $brush = [System.Drawing.SolidBrush]::new($item.Color)
            try { $graphics.FillRectangle($brush, $x, $y, $barWidth, $height) } finally { $brush.Dispose() }
            $graphics.DrawString([string]$attendance, $smallFont, $textBrush, $x + 10, $y - 19)
        }
        $graphics.DrawString($months[$monthIndex], $labelFont, $textBrush, $groupLeft + 33, $plotTop + $plotHeight + 12)
    }

    $legendX = 112
    for ($seriesIndex = 0; $seriesIndex -lt $series.Count; $seriesIndex++) {
        $item = $series[$seriesIndex]
        $x = $legendX + ($seriesIndex * 240)
        $brush = [System.Drawing.SolidBrush]::new($item.Color)
        try { $graphics.FillRectangle($brush, $x, 512, 18, 13) } finally { $brush.Dispose() }
        $graphics.DrawString($item.Name, $smallFont, $textBrush, $x + 25, 508)
    }
    $bitmap.Save($chartPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $titleFont.Dispose()
    $labelFont.Dispose()
    $smallFont.Dispose()
    $axisPen.Dispose()
    $gridPen.Dispose()
    $textBrush.Dispose()
}

@(
    [ordered]@{
        output = $tonePath
        kind = 'audio/wav'
        durationMs = $durationSeconds * 1000
        bytes = (Get-Item -LiteralPath $tonePath).Length
        sha256 = (Get-FileHash -LiteralPath $tonePath -Algorithm SHA256).Hash.ToLowerInvariant()
    },
    [ordered]@{
        output = $chartPath
        kind = 'image/png'
        width = 900
        height = 560
        bytes = (Get-Item -LiteralPath $chartPath).Length
        sha256 = (Get-FileHash -LiteralPath $chartPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
) | ConvertTo-Json
