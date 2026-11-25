#Requires -RunAsAdministrator
param([switch]$Reconnect)

$ErrorActionPreference = 'Stop'
$taskName = 'Seu Paulo - Comandas da cozinha'
$taskPath = '\'
$source = Join-Path $PSScriptRoot 'cozinha.exe'
$agentVersion = & $source --version
if ($LASTEXITCODE -ne 0 -or -not $agentVersion) { throw 'O executavel do pacote nao respondeu. Extraia o ZIP atualizado.' }

$existing = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
$dataRoot = Join-Path $env:ProgramData 'SeuPauloKitchen'
$config = $null
$previousTask = $null
if ($existing -and -not $Reconnect -and $existing.Actions.Count -eq 1) {
    $configPattern = '^"(' + [regex]::Escape($dataRoot) + '\\[0-9a-f]{32}\\agent\.json)"$'
    if ($existing.Actions[0].Arguments -match $configPattern -and (Test-Path -LiteralPath $Matches[1] -PathType Leaf)) {
        $config = $Matches[1]
        $previousTask = Export-ScheduledTask -TaskName $taskName -TaskPath $taskPath
    }
}

$version = [guid]::NewGuid().ToString('N')
$runtime = Join-Path $env:ProgramFiles "SeuPauloKitchen\$version"
New-Item -ItemType Directory -Path $runtime | Out-Null
$exe = Join-Path $runtime 'cozinha.exe'
Copy-Item -LiteralPath $source -Destination $exe

if (-not $config) {
    $data = Join-Path $dataRoot $version
    New-Item -ItemType Directory -Path $data | Out-Null
    & icacls.exe $data /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao proteger a configuracao.' }
    $config = Join-Path $data 'agent.json'
    & $exe $config --connect
    if ($LASTEXITCODE -ne 0) { throw 'O pareamento nao foi concluido.' }
}

$action = New-ScheduledTaskAction -Execute $exe -Argument ('"{0}"' -f $config)
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 100 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
try {
    if ($existing.State -eq 'Running') { Stop-ScheduledTask -TaskName $taskName -TaskPath $taskPath }
    Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Force -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings | Out-Null
    Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath
} catch {
    if ($previousTask) {
        Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Force -Xml $previousTask | Out-Null
        if ($existing.State -eq 'Running') { Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath }
    }
    throw
}

if ($previousTask) {
    Write-Host "Agente $agentVersion atualizado com a configuracao existente. Volte ao painel para testar o papel."
} else {
    Write-Host "Agente $agentVersion instalado. Volte ao painel para escolher o destino e testar o papel."
}
