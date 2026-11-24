#Requires -RunAsAdministrator
[CmdletBinding(DefaultParameterSetName='Windows')]
param(
    [Parameter(Mandatory)][string]$SupabaseUrl,
    [Parameter(Mandatory)][string]$PublicKey,
    [Parameter(Mandatory)][string]$Python,
    [Parameter(Mandatory,ParameterSetName='Windows')][string]$Queue,
    [Parameter(Mandatory,ParameterSetName='Dedicated')][string]$PrinterAddress,
    [Parameter(ParameterSetName='Dedicated')][ValidateRange(1,65535)][int]$Port = 9100
)
$ErrorActionPreference = 'Stop'
$pythonExe = (Get-Item -LiteralPath $Python).FullName
if (([uri]$SupabaseUrl).Scheme -ne 'https') { throw 'Informe a URL HTTPS do projeto.' }
if ($PublicKey -notmatch '^sb_publishable_') { throw 'Use a chave sb_publishable_ do projeto.' }
$path = Join-Path $env:ProgramData 'SeuPauloKitchen'
$configPath = Join-Path $path 'agent.json'
$taskName = 'Seu Paulo - Comandas da cozinha'
if ((Test-Path -LiteralPath $configPath) -or (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
    throw 'Já existe uma instalação. Consulte a seção de manutenção do guia.'
}
$settings = @{url=$SupabaseUrl.TrimEnd('/'); public_key=$PublicKey}
if ($PSCmdlet.ParameterSetName -eq 'Windows') {
    Get-Printer -Name $Queue -ErrorAction Stop | Out-Null
    & $pythonExe -c 'import win32print'
    if ($LASTEXITCODE -ne 0) { throw 'Instale pywin32 no Python indicado.' }
    $settings.mode = 'windows'
    $settings.queue = $Queue
} else {
    $settings.mode = 'tcp'
    $settings.host = $PrinterAddress
    $settings.port = $Port
}
New-Item -ItemType Directory -Path $path -Force | Out-Null
# Local Service reads the pairing key and writes the rotating log.
& icacls.exe $path /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falha ao proteger o diretório.' }
$agent = Join-Path $path 'agent.py'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agent.py') -Destination $agent
$settings | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
& $pythonExe $agent $configPath --pair
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o pareamento.' }
$action = New-ScheduledTaskAction -Execute $pythonExe -Argument ('-B "{0}" "{1}"' -f $agent,$configPath)
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 100 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $taskSettings | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Tarefa registrada. Execute o SQL de pareamento acima para ativar novos deliveries.'
