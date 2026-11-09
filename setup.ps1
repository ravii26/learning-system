# One-time setup for Learning OS on Windows. Safe to run again.
# Run with: powershell -ExecutionPolicy Bypass -File setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Step($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }
function Run($command, [string[]]$arguments) {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "Failed: $command $($arguments -join ' ')" }
}
function Require($command, $wingetId) {
    if (Get-Command $command -ErrorAction SilentlyContinue) { return }
    throw "$command is missing. Install it with: winget install --id $wingetId -e   then open a new terminal and run this again."
}
function Start-Docker {
    docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host 'Starting Docker Desktop...'
    $paths = @("$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe", "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe")
    Start-Process ($paths | Where-Object { Test-Path $_ } | Select-Object -First 1)
    for ($i = 0; $i -lt 36; $i++) {
        Start-Sleep -Seconds 5
        docker info --format '{{.ServerVersion}}' *> $null
        if ($LASTEXITCODE -eq 0) { return }
    }
    throw 'Docker Desktop did not start. Open it by hand, wait for "Engine running", and run this again.'
}
# Without a BOM, because dotenv would otherwise read it as part of the first key.
function Write-EnvFile($path, [string[]]$lines) {
    [IO.File]::WriteAllLines($path, $lines, (New-Object Text.UTF8Encoding($false)))
}
function Set-EnvValue([string[]]$lines, $key, $value) {
    return $lines | ForEach-Object { if ($_ -match "^$key=") { "$key=`"$value`"" } else { $_ } }
}

Step 'Checking tools'
Require 'node' 'OpenJS.NodeJS.LTS'
Require 'docker' 'Docker.DockerDesktop'
if ([int]((node -v) -replace '^v(\d+).*', '$1') -lt 20) { throw 'Node 20 or newer is required.' }
Start-Docker

Step 'Creating .env (an existing .env is never overwritten)'
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path $envPath) {
    Write-Host '.env already exists, keeping it.'
} else {
    $secret = node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
    $lines = Get-Content '.env.example'
    $lines = Set-EnvValue $lines 'DATABASE_URL' 'postgresql://learning_os:learning_os_dev@localhost:5433/learning_os?schema=public'
    $lines = Set-EnvValue $lines 'JWT_SECRET' $secret
    Write-EnvFile $envPath $lines
    Write-Host 'Created .env with a local database and a new JWT_SECRET.'
}

Step 'Installing npm packages'
Run 'npm' @('ci')

Step 'Starting the database in Docker'
Run 'docker' @('compose', 'up', '-d', '--wait')

Step 'Preparing the database'
Run 'npx' @('prisma', 'generate')
Run 'npx' @('prisma', 'migrate', 'deploy')

Step 'Done'
Write-Host 'Add an AI key to .env (GROQ_API_KEY or AICREDITS_API_KEY) to turn on the AI features.'
Write-Host 'Start the app:  npm run dev   then open http://localhost:3000'
Write-Host 'Local sign-in password is "learn" unless you set APP_PASSWORD in .env.'
