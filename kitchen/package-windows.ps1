# Build on Windows x64 with Python 3.12, PyInstaller 6.22.3 and pywin32 312.
param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$build = Join-Path $env:TEMP ('seupaulo-print-build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $build | Out-Null
& $Python -m PyInstaller --clean --onefile --noupx --name cozinha --distpath $build --workpath (Join-Path $build 'work') --specpath $build (Join-Path $PSScriptRoot 'agent.py')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar o agente.' }
$files = @((Join-Path $build 'cozinha.exe'), (Join-Path $PSScriptRoot 'Instalar.cmd'), (Join-Path $PSScriptRoot 'setup-windows.ps1'))
Compress-Archive -LiteralPath $files -DestinationPath (Join-Path $PSScriptRoot '../admin/public/cozinha-windows-x64.zip') -Force
