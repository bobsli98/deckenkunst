# Baut dist/deckenkunst.html: eine einzige Datei mit allem CSS und JavaScript eingebettet.
# Praktisch zum Kopieren auf den Beamer-Laptop oder einen USB-Stick.
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'), $utf8)

$html = [regex]::Replace($html, '<link rel="stylesheet" href="([^"]+)">', {
  param($m)
  $css = [IO.File]::ReadAllText((Join-Path $root $m.Groups[1].Value), $utf8)
  "<style>`n$css</style>"
})

$count = 0
$html = [regex]::Replace($html, '<script src="([^"]+)"></script>', {
  param($m)
  $js = [IO.File]::ReadAllText((Join-Path $root $m.Groups[1].Value), $utf8)
  if ($js -match '</script') { throw "In $($m.Groups[1].Value) steht '</script' - das würde die Einzeldatei zerbrechen." }
  $script:count++
  "<script>/* $($m.Groups[1].Value) */`n$js</script>"
})

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$out = Join-Path $dist 'deckenkunst.html'
[IO.File]::WriteAllText($out, $html, $utf8)
"{0} Skripte eingebettet -> {1} ({2:N0} KB)" -f $count, $out, ((Get-Item $out).Length / 1KB)
