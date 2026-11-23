# Entfernt die Registrierung von Install-TelHandler.ps1 (aktueller Benutzer).
$ErrorActionPreference = 'SilentlyContinue'
Remove-Item -Path 'HKCU:\Software\Classes\VertecPeoplefone.tel' -Recurse -Force
Remove-Item -Path 'HKCU:\Software\VertecPeoplefone' -Recurse -Force
Remove-ItemProperty -Path 'HKCU:\Software\RegisteredApplications' -Name 'VertecPeoplefone' -Force
Write-Host 'Entfernt. Ggf. in den Windows-Standard-Apps eine andere App für "TEL" wählen.'
