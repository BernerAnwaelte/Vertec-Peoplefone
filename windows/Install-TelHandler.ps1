<#
  Registriert "Vertec → peoplefone" als mögliche Standard-App für tel:-Links
  (nur für den aktuellen Benutzer, keine Administratorrechte nötig).

  Danach unter  Einstellungen > Apps > Standard-Apps > "Standardwerte nach Linktyp"
  (Windows 11: Standard-Apps > Suche "TEL") die App "Vertec → peoplefone" für TEL wählen.
  Windows erlaubt es Programmen nicht, diese Auswahl selbst zu setzen.

  Aufruf:  powershell -ExecutionPolicy Bypass -File .\Install-TelHandler.ps1
#>
$ErrorActionPreference = 'Stop'

$handler = Join-Path $PSScriptRoot 'vertec-peoplefone-tel.ps1'
if (-not (Test-Path $handler)) { throw "Nicht gefunden: $handler" }

$config = Join-Path $PSScriptRoot 'config.json'
if (-not (Test-Path $config)) {
    Copy-Item (Join-Path $PSScriptRoot 'config.example.json') $config
    Write-Warning "config.json wurde angelegt. Bitte Token eintragen: $config"
}

$progId  = 'VertecPeoplefone.tel'
$appKey  = 'Software\VertecPeoplefone'
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" "%1"' -f $handler

# ProgID mit Öffnen-Befehl
New-Item -Path "HKCU:\Software\Classes\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name '(default)' -Value 'URL:Vertec peoplefone tel'
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId\shell\open\command" -Name '(default)' -Value $command

# Capabilities, damit die App in den Windows-Standard-Apps auswählbar ist
New-Item -Path "HKCU:\$appKey\Capabilities\URLAssociations" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\$appKey\Capabilities" -Name 'ApplicationName' -Value 'Vertec → peoplefone'
Set-ItemProperty -Path "HKCU:\$appKey\Capabilities" -Name 'ApplicationDescription' -Value 'Wählt tel:-Links aus Vertec über das peoplefone SOFTPHONE in Google Chrome.'
Set-ItemProperty -Path "HKCU:\$appKey\Capabilities\URLAssociations" -Name 'tel' -Value $progId
Set-ItemProperty -Path "HKCU:\$appKey\Capabilities\URLAssociations" -Name 'callto' -Value $progId

New-Item -Path 'HKCU:\Software\RegisteredApplications' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\RegisteredApplications' -Name 'VertecPeoplefone' -Value "$appKey\Capabilities"

Write-Host 'Registriert. Jetzt in den Windows-Einstellungen unter Standard-Apps für "TEL" die App "Vertec → peoplefone" auswählen.'
Start-Process 'ms-settings:defaultapps'
