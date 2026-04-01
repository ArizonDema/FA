param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$healthUrl = "http://127.0.0.1:8000/health"
$appUrl = "http://localhost:8000"
$mutexName = "Global\CSSInvestWebsiteLauncher"

function Write-Step {
  param([string]$Message)
  Write-Host "[CSS Invest Launcher] $Message"
}

function Open-AppUrl {
  param([string]$Url)

  if ($NoBrowser -or $env:CSS_LAUNCHER_NO_BROWSER -eq "1") {
    Write-Step "Skipping browser launch by request."
    return
  }

  Start-Process $Url
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMs = 1200
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }
    $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-ForPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutSeconds = 45,
    [int]$SleepMs = 500
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -HostName $HostName -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds $SleepMs
  }
  return $false
}

function Test-AppHealthy {
  param([string]$Url)
  try {
    $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 2
    return ($response.database -eq "connected")
  } catch {
    return $false
  }
}

function Wait-AppHealthy {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-AppHealthy -Url $Url) {
      return $true
    }
    Start-Sleep -Milliseconds 1000
  }
  return $false
}

function Start-MysqlServiceFirst {
  $service = Get-Service -Name "MySQL80" -ErrorAction SilentlyContinue
  if (-not $service) {
    Write-Step "MySQL80 service was not found."
    return $false
  }

  try {
    if ($service.Status -ne "Running") {
      Write-Step "Starting MySQL80 service."
      Start-Service -Name "MySQL80" -ErrorAction Stop
    } else {
      Write-Step "MySQL80 service is already running."
    }
  } catch {
    Write-Step "MySQL80 service start failed: $($_.Exception.Message)"
    return $false
  }

  if (Wait-ForPort -HostName "127.0.0.1" -Port 3306 -TimeoutSeconds 30) {
    Write-Step "MySQL port 3306 is reachable via service."
    return $true
  }

  Write-Step "MySQL80 service did not make port 3306 reachable in time."
  return $false
}

function Start-MysqlLocalFallback {
  param([string]$RepoRoot)

  Write-Step "Falling back to local mysqld process."
  Push-Location $RepoRoot
  try {
    & node .\scripts\start-local-mysql.mjs
    if ($LASTEXITCODE -ne 0) {
      throw "Local MySQL fallback helper exited with code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }

  if (-not (Wait-ForPort -HostName "127.0.0.1" -Port 3306 -TimeoutSeconds 10)) {
    throw "Local mysqld fallback failed to expose port 3306."
  }

  Write-Step "Local mysqld fallback is running on port 3306."
}

function Run-Migrations {
  param([string]$RepoRoot)

  Write-Step "Running migrations (no seeds)."
  Push-Location $RepoRoot
  try {
    & npm run migrate
    if ($LASTEXITCODE -ne 0) {
      throw "Migration command failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Get-LatestWriteTime {
  param([string[]]$Paths)

  $latest = Get-Date "2000-01-01"
  foreach ($inputPath in $Paths) {
    if (-not (Test-Path $inputPath)) {
      continue
    }

    $item = Get-Item -Path $inputPath
    if ($item.PSIsContainer) {
      $children = Get-ChildItem -Path $inputPath -Recurse -File -ErrorAction SilentlyContinue
      foreach ($child in $children) {
        if ($child.LastWriteTime -gt $latest) {
          $latest = $child.LastWriteTime
        }
      }
    } elseif ($item.LastWriteTime -gt $latest) {
      $latest = $item.LastWriteTime
    }
  }

  return $latest
}

function Ensure-FrontendBuild {
  param([string]$RepoRoot)

  $frontendDistIndex = Join-Path $RepoRoot "frontend\dist\index.html"
  $frontendInputs = @(
    (Join-Path $RepoRoot "frontend\src"),
    (Join-Path $RepoRoot "frontend\index.html"),
    (Join-Path $RepoRoot "frontend\package.json"),
    (Join-Path $RepoRoot "frontend\package-lock.json"),
    (Join-Path $RepoRoot "frontend\vite.config.js")
  )

  $shouldBuild = -not (Test-Path $frontendDistIndex)
  if (-not $shouldBuild) {
    $distTime = (Get-Item $frontendDistIndex).LastWriteTime
    $inputTime = Get-LatestWriteTime -Paths $frontendInputs
    $shouldBuild = $inputTime -gt $distTime
  }

  if (-not $shouldBuild) {
    Write-Step "Frontend production build is up to date."
    return
  }

  Write-Step "Building frontend production bundle."
  Push-Location $RepoRoot
  try {
    & npm run frontend:build
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Start-BackendRuntime {
  param([string]$RepoRoot)

  if (Test-AppHealthy -Url $healthUrl) {
    Write-Step "Backend is already healthy."
    return
  }

  Write-Step "Starting backend runtime process."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run start:runtime" -WorkingDirectory $RepoRoot -WindowStyle Hidden | Out-Null

  if (-not (Wait-AppHealthy -Url $healthUrl -TimeoutSeconds 90)) {
    throw "Backend did not become healthy on $healthUrl within timeout."
  }
}

$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$lockAcquired = $false

try {
  $lockAcquired = $mutex.WaitOne(0, $false)
  if (-not $lockAcquired) {
    Write-Step "Another launcher run is already in progress."
    if (Test-AppHealthy -Url $healthUrl) {
      Open-AppUrl -Url $appUrl
    }
    exit 0
  }

  Write-Step "Launcher started."
  if (Test-AppHealthy -Url $healthUrl) {
    Write-Step "Website is already healthy. Opening browser."
    Open-AppUrl -Url $appUrl
    exit 0
  }

  if (-not (Start-MysqlServiceFirst)) {
    Start-MysqlLocalFallback -RepoRoot $repoRoot
  }

  Run-Migrations -RepoRoot $repoRoot
  Ensure-FrontendBuild -RepoRoot $repoRoot
  Start-BackendRuntime -RepoRoot $repoRoot

  Write-Step "Website is healthy. Opening browser."
  Open-AppUrl -Url $appUrl
  exit 0
} catch {
  Write-Error "[CSS Invest Launcher] Startup failed: $($_.Exception.Message)"
  exit 1
} finally {
  if ($lockAcquired) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
