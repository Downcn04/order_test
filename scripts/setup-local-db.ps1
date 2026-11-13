param(
  [int]$Port = 5433,
  [string]$Database = "rewards",
  [string]$DbUser = "app",
  [string]$DataDir = ".pgdata"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Resolve-PgBin {
  $psql = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($psql) {
    return (Split-Path -Parent $psql.Source)
  }

  $roots = @(
    "C:\Program Files\PostgreSQL",
    "C:\Program Files (x86)\PostgreSQL"
  )
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $versions = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending
    foreach ($version in $versions) {
      $bin = Join-Path $version.FullName "bin"
      if (Test-Path -LiteralPath (Join-Path $bin "pg_ctl.exe")) {
        return $bin
      }
    }
  }
  return $null
}

$pgBin = Resolve-PgBin
if (-not $pgBin) {
  Write-Error "PostgreSQL binaries not found. Install PostgreSQL 16 or use Docker: docker compose up -d"
  exit 1
}

$dataPath = if ([System.IO.Path]::IsPathRooted($DataDir)) {
  $DataDir
} else {
  Join-Path $projectRoot $DataDir
}

if (-not (Test-Path -LiteralPath $dataPath)) {
  Write-Host "[db] Initializing cluster at $dataPath"
  & "$pgBin\initdb.exe" -D $dataPath -U $DbUser --auth=trust --encoding=UTF8 --locale=C | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& "$pgBin\pg_ctl.exe" -D $dataPath status *> $null
$running = ($LASTEXITCODE -eq 0)

if (-not $running) {
  Write-Host "[db] Starting PostgreSQL on port $Port"
  & "$pgBin\pg_ctl.exe" -D $dataPath -o "-p $Port" -l (Join-Path $dataPath "server.log") start | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_ctl start failed. See $(Join-Path $dataPath 'server.log')"
    exit 1
  }
} else {
  Write-Host "[db] PostgreSQL already running"
}

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $Port -U $DbUser *> $null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}
if (-not $ready) {
  Write-Error "PostgreSQL did not become ready on port $Port"
  exit 1
}

$exists = & "$pgBin\psql.exe" -h 127.0.0.1 -p $Port -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$Database'"
if ($exists.Trim() -ne "1") {
  Write-Host "[db] Creating database '$Database'"
  & "$pgBin\createdb.exe" -h 127.0.0.1 -p $Port -U $DbUser $Database
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$envPath = Join-Path $projectRoot ".env"
$examplePath = Join-Path $projectRoot ".env.example"
if (-not (Test-Path -LiteralPath $envPath)) {
  Copy-Item -LiteralPath $examplePath -Destination $envPath
}

$url = "postgresql://${DbUser}:${DbUser}@localhost:${Port}/${Database}?schema=public"
$newLine = 'DATABASE_URL="' + $url + '"'
$content = Get-Content -LiteralPath $envPath -Raw

if ($content -match '(?m)^DATABASE_URL=') {
  $content = [System.Text.RegularExpressions.Regex]::Replace(
    $content,
    '(?m)^DATABASE_URL=.*$',
    [System.Text.RegularExpressions.MatchEvaluator] { param($match) $newLine }
  )
} else {
  $content = $newLine + [Environment]::NewLine + $content
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, $content, $utf8)

Write-Host "[db] Ready: $url"
Write-Host "[db] Next: npm run setup"
