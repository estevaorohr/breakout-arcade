$ErrorActionPreference = 'Stop'

$appRoot = 'C:\Users\Daniela\test-app'
$logDir = Join-Path $appRoot 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$logFile = Join-Path $logDir 'server.log'
$startedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"[$startedAt] Starting local web apps server" | Out-File -FilePath $logFile -Append -Encoding utf8

Set-Location $appRoot
& node .\server.js *>> $logFile
