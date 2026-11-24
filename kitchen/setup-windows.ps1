#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$taskName = 'Seu Paulo - Comandas da cozinha'
$source = Join-Path $PSScriptRoot 'cozinha.exe'
$version = [guid]::NewGuid().ToString('N')
$runtime = Join-Path $env:ProgramFiles "SeuPauloKitchen\$version"
$data = Join-Path $env:ProgramData "SeuPauloKitchen\$version"
New-Item -ItemType Directory -Path $runtime,$data | Out-Null
& icacls.exe $data /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falha ao proteger a configuracao.' }
$exe = Join-Path $runtime 'cozinha.exe'
Copy-Item -LiteralPath $source -Destination $exe
$config = Join-Path $data 'agent.json'
$action = New-ScheduledTaskAction -Execute $exe -Argument ('"{0}"' -f $config)
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 100 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
& $exe $config --connect
if ($LASTEXITCODE -ne 0) { throw 'O pareamento nao foi concluido.' }
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $taskName }
Register-ScheduledTask -TaskName $taskName -Force -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'Volte ao painel > Impressora para escolher o destino e testar o papel.'
