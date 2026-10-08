# Готовит картинки портфолио: ресайз по длинной стороне и пережатие в JPEG.
# Оригиналы не изменяются. Результат — assets\works\<slug>-<N>.jpg (N с 1).
#
# Запуск:  powershell -ExecutionPolicy Bypass -File tools\build-images.ps1
# Обычно картинки удобнее добавлять через админку (Админка.bat) — она сама
# уменьшает файлы. Этот скрипт — для пакетной подготовки из D:\Дизайн.
# Порядок путей = порядок картинок в галерее, первая — обложка карточки.
# Файл держите в UTF-8 с BOM, иначе PowerShell 5.1 сломает кириллицу.

param(
    [int]$MaxSide = 1600,
    [int]$Quality = 80,
    [switch]$Force
)

Add-Type -AssemblyName System.Drawing

$D  = "D:\Дизайн"
$M  = "D:\Дизайн\Портфолио на мокапах"
$OutDir = Join-Path (Split-Path $PSScriptRoot -Parent) "assets\works"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

$Works = [ordered]@{
    # ---------- логотипы и фирстиль ----------
    "stroy-i-zhivi" = @(
        "$M\Логотипы\stroyzhivi-logo-gravirovka-derevo.png"
        "$M\Логотипы\stroyzhivi-kaska.png"
        "$M\Логотипы\stroyzhivi-futbolka.png"
        "$M\Визитки\stroyzhivi-vizitka.jpg"
    )
    "komfortny-remont" = @(
        "$M\Фирменный стиль\komfortniyremont-nabor-kaska-ruchka-vizitka.jpg"
        "$D\КЕЙСЫ JPG\Комфортный ремонт\Slide 16_9 - 22.png"
        "$D\КЕЙСЫ JPG\Комфортный ремонт\Slide 16_9 - 29.png"
        "$M\Логотипы\komfortniyremont-kaska.png"
        "$M\Логотипы\komfortniyremont-futbolka.png"
        "$M\Полиграфия и вывески\komfortniyremont-poster-stena-1.jpg"
    )
    "molkahete" = @(
        "$D\Проекты\2024\МОЙ САЙТ\Для сайта\Frame 2.png"
        "$M\Логотипы\molkahete-korobka-spetsiy.png"
        "$D\КЕЙСЫ JPG\Молкахете\Slide 16_9 - 6.png"
        "$D\КЕЙСЫ JPG\Молкахете\Slide 16_9 - 7.png"
    )
    "volontery" = @(
        "$M\Логотипы\volontery-birka.jpg"
        "$M\Логотипы\volontery-svitshot.png"
        "$M\Логотипы\volontery-kruzhki.jpg"
        "$M\Логотипы\volontery-ruchka.jpg"
        "$M\Визитки\volontery-vizitka-zemlya.jpg"
    )
    "m-grupp" = @(
        "$M\Логотипы\mgrupp-kruzhki.jpg"
        "$M\Логотипы\mgrupp-kaska.png"
        "$M\Логотипы\mgrupp-futbolka.jpg"
        "$M\Логотипы\mgrupp-karandashi.png"
        "$M\Визитки\mgrupp-vizitka-beton.jpg"
        "$M\Полиграфия и вывески\mgrupp-listovka-dver.jpg"
    )
    "dve-sestry" = @(
        "$M\Логотипы\dvesestry-var2-logo-gravirovka.jpg"
        "$M\Полиграфия и вывески\dvesestry-var2-vyveska.jpg"
        "$M\Визитки\dvesestry-var2-vizitka.jpg"
        "$M\Визитки\dvesestry-vizitka.jpg"
        "$M\Полиграфия и вывески\dvesestry-sertifikat-ruka.jpg"
    )
    "cvety-po-karmanu" = @(
        "$M\Логотипы\cvetypokarmanu-upakovka-buketa.jpg"
    )

    # ---------- сайты ----------
    "m-grupp-site" = @(
        "$M\Сайты\mgruppsite-macbook.jpg"
        "$M\Сайты\mgrupp-sayt-iphone.png"
        "$D\Проекты\2025\М-групп сайт\кейс\23.jpg"
    )
    "motoshkola" = @(
        "$D\Проекты\2025\Мотошкола\КЕЙС\Беханс\Первый экран.jpg"
        "$D\Проекты\2025\Мотошкола\КЕЙС\Беханс\Дизайн сайта.jpg"
        "$D\Проекты\2025\Мотошкола\КЕЙС\Беханс\Дизайн сайта-1.jpg"
        "$D\Проекты\2025\Мотошкола\КЕЙС\Беханс\Дизайн сайта-2.jpg"
        "$D\Проекты\2025\Мотошкола\КЕЙС\Беханс\Дизайн сайта-3.jpg"
    )
    "lichny-sayt" = @(
        "$D\Авито\Мой сайт.jpg"
    )

    # ---------- полиграфия ----------
    "kitezh" = @(
        "$D\Проекты\2026\Китеж\листовка\Cafe_Menu_Mockup копия.jpg"
        "$M\Логотипы\kitezh-konvert-priglashenie.jpg"
        "$D\Проекты\2026\Китеж\листовка\МОКАП.jpg"
        "$M\Логотипы\kitezh-stakan-kofe.png"
        "$D\Проекты\2026\Китеж\Мокапы\photorealistic-premium-product-packaging-mockup-of копия.png"
    )
    "askeza" = @(
        "C:\Vibe code\Target\campaigns\portfolio\askeza-cover.jpg"
        "C:\Vibe code\Target\campaigns\portfolio\askeza-covers.jpg"
        "$M\Полиграфия и вывески\bloknotaskeza-razvorot-pattern.jpg"
        "$M\Полиграфия и вывески\bloknotaskeza-zakladki.jpg"
        "C:\Vibe code\Target\campaigns\portfolio\askeza-system.jpg"
    )
    "pryaniki" = @(
        "$D\Проекты\2026\Харчевня\4x\лицевая@4x.png"
        "$D\Проекты\2026\Харчевня\4x\задння@4x.png"
    )
    "ivan-chay" = @(
        "$M\Логотипы\kremlchay-upakovka.png"
    )
    "sertifikaty" = @(
        "$M\Полиграфия и вывески\loveforNails-sertifikat-ramka.jpg"
        "$M\Полиграфия и вывески\dvesestry-sertifikat-ruka.jpg"
    )
    "vizitki" = @(
        "$M\Визитки\renovibe-vizitka.jpg"
        "$M\Визитки\andreymalyshev-vizitka.jpg"
        "$M\Визитки\mgrupp-vizitka-beton.jpg"
        "$M\Визитки\stroyzhivi-vizitka.jpg"
    )
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)

foreach ($slug in $Works.Keys) {
    $n = 0
    foreach ($src in $Works[$slug]) {
        $n++
        $dst = Join-Path $OutDir "$slug-$n.jpg"
        if ((Test-Path $dst) -and -not $Force) { continue }
        if (-not (Test-Path -LiteralPath $src)) { Write-Warning "нет исходника: $src"; continue }

        $img = $null; $canvas = $null; $g = $null
        try {
            $img = [System.Drawing.Image]::FromFile($src)
            $scale = [Math]::Min(1.0, $MaxSide / [Math]::Max($img.Width, $img.Height))
            $w = [int][Math]::Round($img.Width * $scale)
            $h = [int][Math]::Round($img.Height * $scale)

            $canvas = New-Object System.Drawing.Bitmap($w, $h)
            $g = [System.Drawing.Graphics]::FromImage($canvas)
            $g.CompositingQuality = 'HighQuality'
            $g.InterpolationMode  = 'HighQualityBicubic'
            $g.SmoothingMode      = 'HighQuality'
            $g.PixelOffsetMode    = 'HighQuality'
            # PNG с прозрачностью кладём на белый, иначе альфа станет чёрной
            $g.Clear([System.Drawing.Color]::White)
            $g.DrawImage($img, 0, 0, $w, $h)
            $canvas.Save($dst, $jpegCodec, $encParams)

            "{0,-22} {1}x{2}  {3} KB" -f "$slug-$n", $w, $h, [math]::Round((Get-Item $dst).Length / 1KB)
        }
        catch { Write-Warning "$slug-$n — ошибка: $($_.Exception.Message)" }
        finally {
            if ($g)      { $g.Dispose() }
            if ($canvas) { $canvas.Dispose() }
            if ($img)    { $img.Dispose() }
        }
    }
}

$encParams.Dispose()
""
"Готово: $OutDir"
