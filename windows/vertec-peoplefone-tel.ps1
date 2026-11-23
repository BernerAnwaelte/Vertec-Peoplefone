<#
  tel:-Handler für Windows.

  Vertec übergibt beim Standard-Befehl "Anrufen" die Nummer als tel:-URI an Windows
  (Systemeinstellung "Telefonie > Wählen via URI unterstützen"). Ist dieses Skript als
  Standard-App für "TEL" eingetragen, wandelt es die tel:-URI in die Wähl-URL der
  Chrome-Erweiterung um und öffnet sie in Google Chrome.

  Aufruf (durch Windows):  vertec-peoplefone-tel.ps1 "tel:+41431234567"
#>
param([Parameter(Position = 0)][string]$Uri)

$ErrorActionPreference = 'Stop'

function ConvertTo-DialNumber([string]$Raw, [string]$CountryCode) {
    # Gleiche Logik wie normalizeNumber() in chrome-extension/lib/phone.js
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
    $s = [System.Uri]::UnescapeDataString($Raw.Trim())
    $s = $s -replace '^(?i)(tel|callto|sip):', ''
    $s = $s.Replace('(0)', '')
    $hasPlus = $s.Trim().StartsWith('+')
    $digits = $s -replace '[^\d]', ''
    if (-not $digits) { return $null }
    if ($hasPlus) { $r = '+' + $digits }
    elseif ($digits.StartsWith('00')) { $r = '+' + $digits.Substring(2) }
    elseif ($digits.StartsWith('0')) {
        $cc = $CountryCode -replace '[^\d]', ''
        if (-not $cc) { return $null }
        $r = '+' + $cc + $digits.Substring(1)
    }
    else { $r = $digits }
    if ($r -match '^\+?\d{2,20}$') { return $r }
    return $null
}

$configPath = Join-Path $PSScriptRoot 'config.json'
if (-not (Test-Path $configPath)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Konfiguration fehlt: $configPath", 'Vertec → peoplefone') | Out-Null
    exit 1
}
$cfg = Get-Content -Raw -Encoding UTF8 $configPath | ConvertFrom-Json

$number = ConvertTo-DialNumber $Uri $cfg.CountryCode
if (-not $number) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Ungültige Nummer: $Uri", 'Vertec → peoplefone') | Out-Null
    exit 1
}

$url = '{0}#vertec-dial={1}&k={2}' -f $cfg.SoftphoneUrl,
    [System.Uri]::EscapeDataString($number),
    [System.Uri]::EscapeDataString($cfg.Token)

$chrome = $cfg.ChromePath
if (-not $chrome -or -not (Test-Path $chrome)) {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    $chrome = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $chrome) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Google Chrome wurde nicht gefunden. Bitte ChromePath in config.json setzen.', 'Vertec → peoplefone') | Out-Null
    exit 1
}

Start-Process -FilePath $chrome -ArgumentList ('"' + $url + '"')
