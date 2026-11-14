<#
.SYNOPSIS
    Standardized installer and environment diagnostic script for Lopaka (MPS3 Design Lab).

.DESCRIPTION
    Verifies required tools (Git, Node.js >= 18, pnpm/corepack/npm, Python + pyserial/Pillow,
    optional Tailscale), ensures the Lopaka fork repository and Node dependencies are ready,
    generates Windows CLI shims (lopaka.cmd / lopaka.ps1), registers the launcher folder in
    the User PATH idempotently, and runs a non-destructive -DryRun smoke check.

    Works both from:
      - tools/design_lab/install_lopaka.ps1 (MPS3 Design Lab wrapper)
      - tools/design_lab/lopaka/install.ps1 (inside the Lopaka fork repo or standalone clone)

.EXAMPLE
    .\install_lopaka.ps1
.EXAMPLE
    .\install_lopaka.ps1 -CheckOnly
.EXAMPLE
    .\install_lopaka.ps1 -ForceReinstall
#>

[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$SkipDeps,
    [switch]$SkipPath,
    [Alias("Offline")]
    [switch]$NoUpdate,
    [switch]$ForceReinstall,
    [string]$RepoUrl = "https://github.com/thall-is/lopaka.git",
    [string]$UpstreamUrl = "https://github.com/sbrin/lopaka.git"
)

$ErrorActionPreference = "Stop"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"

# --- Layout Detection ---------------------------------------------------------
$ScriptDir = $PSScriptRoot
$IsInsideRepo = Test-Path (Join-Path $ScriptDir "package.json")

if ($IsInsideRepo) {
    $LopakaDir = $ScriptDir
    $ParentDir = Split-Path -Parent $ScriptDir
    $ParentLauncher = Join-Path $ParentDir "start_lopaka.ps1"
    if (Test-Path $ParentLauncher) {
        $LayoutMode = "design_lab"
        $DesignLabDir = $ParentDir
        $LauncherScript = $ParentLauncher
    } else {
        $LayoutMode = "standalone"
        $DesignLabDir = $ScriptDir
        $LauncherScript = Join-Path $ScriptDir "start_lopaka.ps1"
    }
} else {
    $LayoutMode = "design_lab"
    $DesignLabDir = $ScriptDir
    $LopakaDir = Join-Path $DesignLabDir "lopaka"
    $LauncherScript = Join-Path $DesignLabDir "start_lopaka.ps1"
}

$ShimTargetDir = $DesignLabDir
$LocalBinDir = Join-Path $HOME ".local\bin"
$LocalBinShim = Join-Path $LocalBinDir "lopaka.cmd"

# --- Output & Report Helpers --------------------------------------------------
$Report = [System.Collections.Generic.List[PSCustomObject]]::new()
$CriticalErrors = [System.Collections.Generic.List[string]]::new()

function Invoke-ToolCapture {
    param(
        [string]$Exe,
        [string[]]$ToolArgs
    )
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $global:LASTEXITCODE = 0
        $raw = & $Exe @ToolArgs 2>&1
        $rc = $LASTEXITCODE
        $lines = @($raw | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -ne "" })
        return @{
            ExitCode  = $rc
            Lines     = $lines
            FirstLine = if ($lines.Count -gt 0) { $lines[0] } else { "" }
        }
    } catch {
        return @{
            ExitCode  = 1
            Lines     = @()
            FirstLine = ""
        }
    } finally {
        $ErrorActionPreference = $prevPref
    }
}

function Add-Status {
    param(
        [string]$Component,
        [ValidateSet("OK", "WARN", "FAIL", "INFO")]
        [string]$Status,
        [string]$Details
    )
    $Report.Add([PSCustomObject]@{
        Component = $Component
        Status    = $Status
        Details   = $Details
    }) | Out-Null

    $color = switch ($Status) {
        "OK"   { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
        default { "Cyan" }
    }
    Write-Host ("  [{0,-4}] {1,-22} {2}" -f $Status, $Component, $Details) -ForegroundColor $color
}

function Write-Utf8NoBomFile {
    param(
        [string]$Path,
        [string]$Content
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Normalize-PathEntry {
    param([string]$Entry)
    if ([string]::IsNullOrWhiteSpace($Entry)) { return "" }
    return $Entry.Trim().Trim('"').TrimEnd('\', '/')
}

function Test-PathContains {
    param(
        [string]$PathList,
        [string]$TargetDir
    )
    $targetNorm = Normalize-PathEntry $TargetDir
    foreach ($item in ($PathList -split ';')) {
        if ((Normalize-PathEntry $item) -ieq $targetNorm) {
            return $true
        }
    }
    return $false
}

function Get-DepsLockHash {
    param([string]$RepoDir)
    $parts = [System.Collections.Generic.List[string]]::new()
    foreach ($name in @("package.json", "pnpm-lock.yaml", "package-lock.json")) {
        $filePath = Join-Path $RepoDir $name
        if (Test-Path $filePath) {
            $h = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
            $parts.Add("${name}:${h}") | Out-Null
        }
    }
    $joined = ($parts -join "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
        $digest = $sha.ComputeHash($bytes)
        return ([System.BitConverter]::ToString($digest) -replace '-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Get-StandaloneLauncherContent {
    return @'
[CmdletBinding()]
param(
    [switch]$Tailscale,
    [int]$Port = 5173,
    [switch]$Update,
    [Alias("Offline")]
    [switch]$NoUpdate,
    [switch]$ForceInstall,
    [switch]$DryRun,
    [string]$RepoUrl = "https://github.com/thall-is/lopaka.git",
    [string]$UpstreamUrl = "https://github.com/sbrin/lopaka.git"
)

$ErrorActionPreference = "Stop"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$LopakaDir = $PSScriptRoot

function Invoke-ToolCapture {
    param([string]$Exe, [string[]]$ToolArgs)
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $global:LASTEXITCODE = 0
        $raw = & $Exe @ToolArgs 2>&1
        $rc = $LASTEXITCODE
        $lines = @($raw | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -ne "" })
        return @{ ExitCode = $rc; Lines = $lines; FirstLine = if ($lines.Count -gt 0) { $lines[0] } else { "" } }
    } catch {
        return @{ ExitCode = 1; Lines = @(); FirstLine = "" }
    } finally {
        $ErrorActionPreference = $prevPref
    }
}

function Write-Utf8NoBomFile {
    param([string]$Path, [string]$Content)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Resolve-PackageManager {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        $r = Invoke-ToolCapture -Exe "pnpm" -ToolArgs @("--version")
        if ($r.ExitCode -eq 0) { return @{ Cmd = "pnpm"; BaseArgs = @() } }
    }
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        $r = Invoke-ToolCapture -Exe "corepack" -ToolArgs @("pnpm", "--version")
        if ($r.ExitCode -eq 0) { return @{ Cmd = "corepack"; BaseArgs = @("pnpm") } }
    }
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        $r = Invoke-ToolCapture -Exe "npm" -ToolArgs @("--version")
        if ($r.ExitCode -eq 0) { return @{ Cmd = "npm"; BaseArgs = @() } }
    }
    throw "No Node package manager found (pnpm, corepack, or npm)."
}

function Get-DepsLockHash {
    param([string]$RepoDir)
    $parts = [System.Collections.Generic.List[string]]::new()
    foreach ($name in @("package.json", "pnpm-lock.yaml", "package-lock.json")) {
        $filePath = Join-Path $RepoDir $name
        if (Test-Path $filePath) {
            $h = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
            $parts.Add("${name}:${h}") | Out-Null
        }
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes(($parts -join "`n")))) -replace '-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

$pm = Resolve-PackageManager
$bindHost = "127.0.0.1"
$displayUrl = "http://localhost:$Port"

if ($Tailscale) {
    $bindHost = "0.0.0.0"
    $tsRes = Invoke-ToolCapture -Exe "tailscale" -ToolArgs @("ip", "-4")
    if ($tsRes.ExitCode -eq 0 -and $tsRes.FirstLine) {
        $displayUrl = "http://$($tsRes.FirstLine):$Port"
    }
}

$brRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "branch", "--show-current")
$branch = if ($brRes.FirstLine) { $brRes.FirstLine } else { "main" }
$sha = (Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "rev-parse", "--short", "HEAD")).FirstLine
$isDirty = ((Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "status", "--porcelain")).Lines.Count -gt 0)
$behind = 0
$fetchOk = $false

if (-not $NoUpdate -and (Test-Path (Join-Path $LopakaDir ".git"))) {
    $prevPrompt = $env:GIT_TERMINAL_PROMPT
    $env:GIT_TERMINAL_PROMPT = "0"
    try {
        $fRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "fetch", "origin", "--quiet")
        $fetchOk = ($fRes.ExitCode -eq 0)
    } finally {
        $env:GIT_TERMINAL_PROMPT = $prevPrompt
    }
    if ($fetchOk) {
        $cnt = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "rev-list", "--left-right", "--count", "HEAD...origin/$branch")
        if ($cnt.ExitCode -eq 0 -and $cnt.FirstLine -match '^\d+\s+(\d+)$') {
            $behind = [int]$Matches[1]
        }
    }
}

$lockHash = Get-DepsLockHash -RepoDir $LopakaDir
$nmDir = Join-Path $LopakaDir "node_modules"
$viteCmd = Join-Path $nmDir ".bin\vite.cmd"
$stampFile = Join-Path $nmDir ".mps3-lock.sha256"
$savedHash = Get-Content -LiteralPath $stampFile -Raw -Encoding utf8 -ErrorAction SilentlyContinue
$needsInstall = $ForceInstall -or (-not (Test-Path $nmDir)) -or (-not (Test-Path $viteCmd)) -or ($null -eq $savedHash) -or ($savedHash.Trim() -ne $lockHash)

if ($DryRun) {
    $verStatus = if ($NoUpdate) { "$branch @ $sha (offline)" } elseif (-not $fetchOk) { "$branch @ $sha (fetch unavailable)" } elseif ($behind -gt 0) { "$branch @ $sha (behind by $behind)" } else { "$branch @ $sha (up-to-date)" }
    Write-Host "[DryRun] LopakaDir   : $LopakaDir"
    Write-Host "[DryRun] Version     : $verStatus"
    Write-Host "[DryRun] Deps Sync   : $(if ($needsInstall) { 'install needed' } else { 'synced' })"
    Write-Host "[DryRun] PkgMgr      : $($pm.Cmd) $($pm.BaseArgs -join ' ')"
    Write-Host "[DryRun] BindHost    : ${bindHost}:$Port"
    Write-Host "[DryRun] URL         : $displayUrl"
    exit 0
}

if (-not $NoUpdate -and $fetchOk) {
    if ($Update) {
        $rems = (Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "remote")).Lines
        if (-not ($rems -contains "upstream")) {
            Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "remote", "add", "upstream", $UpstreamUrl) | Out-Null
        }
        Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "fetch", "upstream", "--quiet") | Out-Null
    }
    if ($behind -gt 0) {
        Write-Host "[*] Updating Lopaka ($branch, $behind new commit(s))..." -ForegroundColor Yellow
        if ($isDirty) {
            $pRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "pull", "--rebase", "--autostash", "origin", $branch)
            if ($pRes.ExitCode -ne 0) {
                if ((Test-Path (Join-Path $LopakaDir ".git\rebase-merge")) -or (Test-Path (Join-Path $LopakaDir ".git\rebase-apply"))) {
                    Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "rebase", "--abort") | Out-Null
                }
                Write-Host "[WARN] Update conflict with local changes; kept local tree." -ForegroundColor Yellow
            }
        } else {
            Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "pull", "--ff-only", "origin", $branch) | Out-Null
        }
        $lockHash = Get-DepsLockHash -RepoDir $LopakaDir
        $savedHash = Get-Content -LiteralPath $stampFile -Raw -Encoding utf8 -ErrorAction SilentlyContinue
        $needsInstall = $ForceInstall -or (-not (Test-Path $nmDir)) -or (-not (Test-Path $viteCmd)) -or ($null -eq $savedHash) -or ($savedHash.Trim() -ne $lockHash)
    }
}

Push-Location $LopakaDir
try {
    if ($needsInstall) {
        & $pm.Cmd @($pm.BaseArgs + @("install"))
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        if (-not (Test-Path $nmDir)) { New-Item -ItemType Directory -Path $nmDir -Force | Out-Null }
        Write-Utf8NoBomFile -Path $stampFile -Content ($lockHash + "`n")
    }
    Write-Host "Starting Lopaka at $displayUrl (bind $bindHost`:$Port)..." -ForegroundColor Cyan
    $runArgs = if ($pm.Cmd -eq "npm") {
        @("run", "dev", "--", "--host", $bindHost, "--port", "$Port")
    } else {
        $pm.BaseArgs + @("dev", "--host", $bindHost, "--port", "$Port")
    }
    & $pm.Cmd @runArgs
} finally {
    Pop-Location
}
'@
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Lopaka Design Lab - Standardized Installer & Environment Check" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ("  Mode       : {0}" -f $LayoutMode)
Write-Host ("  LopakaDir  : {0}" -f $LopakaDir)
Write-Host ("  ShimDir    : {0}" -f $ShimTargetDir)
if ($CheckOnly) {
    Write-Host "  Flags      : CheckOnly (read-only audit)" -ForegroundColor Yellow
}
Write-Host ""

# ==============================================================================
# STEP 1: Environment & Package Audit
# ==============================================================================
Write-Host "[1/4] Checking prerequisites and packages..." -ForegroundColor White

# 1.1 Git (Required)
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("--version")
    Add-Status "git" "OK" $gitRes.FirstLine
} else {
    Add-Status "git" "FAIL" "Not found. Install: winget install Git.Git"
    $CriticalErrors.Add("git missing") | Out-Null
}

# 1.2 Node.js >= 18 (Required)
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeRes = Invoke-ToolCapture -Exe "node" -ToolArgs @("-v")
    $nodeVerRaw = $nodeRes.FirstLine
    if ($nodeVerRaw -match '^v?(\d+)\.') {
        $nodeMajor = [int]$Matches[1]
        if ($nodeMajor -ge 18) {
            Add-Status "node" "OK" "$nodeVerRaw (required >= v18)"
        } else {
            Add-Status "node" "FAIL" "$nodeVerRaw found, requires Node.js >= v18"
            $CriticalErrors.Add("node version < 18") | Out-Null
        }
    } else {
        Add-Status "node" "WARN" "Found ($nodeVerRaw) but version format unrecognized"
    }
} else {
    Add-Status "node" "FAIL" "Not found. Install: winget install OpenJS.NodeJS.LTS"
    $CriticalErrors.Add("node missing") | Out-Null
}

# 1.3 Node Package Manager: pnpm -> corepack pnpm -> npm (Required)
$PkgMgr = $null
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $res = Invoke-ToolCapture -Exe "pnpm" -ToolArgs @("--version")
    if ($res.ExitCode -eq 0 -and $res.FirstLine) {
        $PkgMgr = @{ Name = "pnpm"; Cmd = "pnpm"; BaseArgs = @(); Version = $res.FirstLine }
    }
}
if (-not $PkgMgr -and (Get-Command corepack -ErrorAction SilentlyContinue)) {
    $res = Invoke-ToolCapture -Exe "corepack" -ToolArgs @("pnpm", "--version")
    if ($res.ExitCode -eq 0 -and $res.FirstLine) {
        $PkgMgr = @{ Name = "corepack pnpm"; Cmd = "corepack"; BaseArgs = @("pnpm"); Version = $res.FirstLine }
    }
}
if (-not $PkgMgr -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    $res = Invoke-ToolCapture -Exe "npm" -ToolArgs @("--version")
    if ($res.ExitCode -eq 0 -and $res.FirstLine) {
        $PkgMgr = @{ Name = "npm"; Cmd = "npm"; BaseArgs = @(); Version = $res.FirstLine }
    }
}

if ($PkgMgr) {
    Add-Status "node pkg manager" "OK" ("{0} v{1}" -f $PkgMgr.Name, $PkgMgr.Version)
} else {
    Add-Status "node pkg manager" "FAIL" "Neither pnpm, corepack, nor npm is working"
    $CriticalErrors.Add("package manager missing") | Out-Null
}

# 1.4 Python + pyserial / Pillow (Recommended for MPS3 hardware OLED bridge)
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    $PythonCmd = Get-Command py -ErrorAction SilentlyContinue
}
if ($PythonCmd) {
    $pyExe = $PythonCmd.Source
    $pyRes = Invoke-ToolCapture -Exe $pyExe -ToolArgs @("--version")
    Add-Status "python" "OK" "$($pyRes.FirstLine) ($pyExe)"

    $requiredPyPkgs = @(
        @{ PipName = "pyserial"; ImportName = "serial" },
        @{ PipName = "Pillow";   ImportName = "PIL" }
    )
    $missingPyPkgs = [System.Collections.Generic.List[string]]::new()

    foreach ($pkg in $requiredPyPkgs) {
        $modRes = Invoke-ToolCapture -Exe $pyExe -ToolArgs @("-c", "import $($pkg.ImportName) as m; print(getattr(m, '__version__', 'installed'))")
        if ($modRes.ExitCode -eq 0 -and $modRes.FirstLine) {
            Add-Status ("py:{0}" -f $pkg.PipName) "OK" ("v{0}" -f $modRes.FirstLine)
        } else {
            $missingPyPkgs.Add($pkg.PipName) | Out-Null
        }
    }

    if ($missingPyPkgs.Count -gt 0) {
        if ($CheckOnly -or $SkipDeps) {
            Add-Status "py packages" "WARN" ("Missing: {0} (needed for hardware bridge)" -f ($missingPyPkgs -join ", "))
        } else {
            Write-Host ("         Installing Python packages: {0}..." -f ($missingPyPkgs -join ", ")) -ForegroundColor Cyan
            $pipRes = Invoke-ToolCapture -Exe $pyExe -ToolArgs (@("-m", "pip", "install") + $missingPyPkgs + @("--quiet"))
            if ($pipRes.ExitCode -eq 0) {
                foreach ($pkgName in $missingPyPkgs) {
                    Add-Status ("py:{0}" -f $pkgName) "OK" "Installed via pip"
                }
            } else {
                Add-Status "py packages" "WARN" ("pip install failed for: {0}" -f ($missingPyPkgs -join ", "))
            }
        }
    }
} else {
    Add-Status "python" "WARN" "Not found (optional for UI; needed for tools/lopaka_bridge.py & oled_screenshot.py)"
}

# 1.5 Tailscale (Optional)
$tsCmd = Get-Command tailscale -ErrorAction SilentlyContinue
if ($tsCmd) {
    $tsRes = Invoke-ToolCapture -Exe "tailscale" -ToolArgs @("ip", "-4")
    if ($tsRes.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($tsRes.FirstLine)) {
        Add-Status "tailscale" "OK" ("Connected IPv4 {0}" -f $tsRes.FirstLine)
    } else {
        Add-Status "tailscale" "INFO" "Installed (currently disconnected)"
    }
} else {
    Add-Status "tailscale" "INFO" "Optional - not installed (needed only for 'lopaka -Tailscale')"
}

if ($CriticalErrors.Count -gt 0) {
    Write-Host ""
    Write-Host "Critical prerequisites missing: $($CriticalErrors -join ', ')" -ForegroundColor Red
    Write-Host "Fix the [FAIL] items above and re-run this installer." -ForegroundColor Red
    exit 1
}

# ==============================================================================
# STEP 2: Repository & Node Dependencies
# ==============================================================================
Write-Host ""
Write-Host "[2/4] Verifying Lopaka repository and Node dependencies..." -ForegroundColor White

$gitDir = Join-Path $LopakaDir ".git"
if (-not (Test-Path $gitDir)) {
    if ($CheckOnly) {
        Add-Status "lopaka repo" "WARN" "Not cloned at $LopakaDir"
    } else {
        Write-Host "         Cloning $RepoUrl into $LopakaDir..." -ForegroundColor Cyan
        $parent = Split-Path -Parent $LopakaDir
        if (-not (Test-Path $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        & git clone $RepoUrl $LopakaDir
        if ($LASTEXITCODE -ne 0) {
            Add-Status "lopaka repo" "FAIL" "git clone failed ($RepoUrl)"
            exit 1
        }
        Add-Status "lopaka repo" "OK" "Cloned from $RepoUrl"
    }
} else {
    $branchRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "branch", "--show-current")
    $branch = if ($branchRes.FirstLine) { $branchRes.FirstLine } else { "main" }
    $shaRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "rev-parse", "--short", "HEAD")
    $oldSha = $shaRes.FirstLine
    $dirtyRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "status", "--porcelain")
    $isDirty = ($dirtyRes.Lines.Count -gt 0)

    if ($NoUpdate) {
        Add-Status "lopaka repo" "OK" "Local $branch @ $oldSha (-NoUpdate / offline)"
    } else {
        $prevPrompt = $env:GIT_TERMINAL_PROMPT
        $env:GIT_TERMINAL_PROMPT = "0"
        try {
            $fetchRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "fetch", "origin", "--quiet")
        } finally {
            $env:GIT_TERMINAL_PROMPT = $prevPrompt
        }

        if ($fetchRes.ExitCode -ne 0) {
            Add-Status "lopaka repo" "WARN" "$branch @ $oldSha (offline / origin unreachable)"
        } else {
            $cntRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "rev-list", "--left-right", "--count", "HEAD...origin/$branch")
            $ahead = 0
            $behind = 0
            if ($cntRes.ExitCode -eq 0 -and $cntRes.FirstLine -match '^(\d+)\s+(\d+)$') {
                $ahead = [int]$Matches[1]
                $behind = [int]$Matches[2]
            }

            if ($behind -gt 0) {
                if ($CheckOnly) {
                    Add-Status "lopaka repo" "WARN" "Behind origin/$branch by $behind commit(s) (local $oldSha)"
                } else {
                    Write-Host ("         Updating {0} ({1} new commit(s))..." -f $branch, $behind) -ForegroundColor Cyan
                    $pullFailed = $false
                    if ($isDirty) {
                        $pullRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "pull", "--rebase", "--autostash", "origin", $branch)
                        if ($pullRes.ExitCode -ne 0) {
                            if ((Test-Path (Join-Path $LopakaDir ".git\rebase-merge")) -or (Test-Path (Join-Path $LopakaDir ".git\rebase-apply"))) {
                                Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "rebase", "--abort") | Out-Null
                            }
                            $pullFailed = $true
                        }
                    } else {
                        $pullRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "pull", "--ff-only", "origin", $branch)
                        if ($pullRes.ExitCode -ne 0) { $pullFailed = $true }
                    }

                    $newSha = (Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "rev-parse", "--short", "HEAD")).FirstLine
                    if ($pullFailed) {
                        Add-Status "lopaka repo" "WARN" "Auto-update skipped due to local conflict ($branch @ $oldSha)"
                    } else {
                        Add-Status "lopaka repo" "OK" "Updated $oldSha -> $newSha ($branch)"
                        $repoInstaller = Join-Path $LopakaDir "install.ps1"
                        $wrapperInstaller = Join-Path $DesignLabDir "install_lopaka.ps1"
                        if ($LayoutMode -eq "design_lab" -and (Test-Path $repoInstaller) -and ($repoInstaller -ne $wrapperInstaller)) {
                            $hRepo = (Get-FileHash -LiteralPath $repoInstaller -Algorithm SHA256).Hash
                            $hWrap = if (Test-Path $wrapperInstaller) { (Get-FileHash -LiteralPath $wrapperInstaller -Algorithm SHA256).Hash } else { "" }
                            if ($hRepo -ne $hWrap) {
                                Copy-Item -LiteralPath $repoInstaller -Destination $wrapperInstaller -Force
                            }
                        }
                    }
                }
            } else {
                $aheadNote = if ($ahead -gt 0) { ", ahead $ahead" } else { "" }
                $dirtyNote = if ($isDirty) { ", dirty" } else { "" }
                Add-Status "lopaka repo" "OK" "Up-to-date @ $oldSha ($branch$aheadNote$dirtyNote)"
            }
        }
    }
}

if (Test-Path $gitDir) {
    $remRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "remote")
    if (-not ($remRes.Lines -contains "upstream")) {
        if ($CheckOnly) {
            Add-Status "upstream remote" "WARN" "Remote 'upstream' not configured ($UpstreamUrl)"
        } else {
            $addRemRes = Invoke-ToolCapture -Exe "git" -ToolArgs @("-C", $LopakaDir, "remote", "add", "upstream", $UpstreamUrl)
            if ($addRemRes.ExitCode -eq 0) {
                Add-Status "upstream remote" "OK" "Added $UpstreamUrl"
            } else {
                Add-Status "upstream remote" "WARN" "Could not add upstream remote"
            }
        }
    } else {
        Add-Status "upstream remote" "OK" $UpstreamUrl
    }
}

$nodeModulesDir = Join-Path $LopakaDir "node_modules"
$viteBin = Join-Path $nodeModulesDir ".bin\vite.cmd"
$stampFile = Join-Path $nodeModulesDir ".mps3-lock.sha256"
$currentLockHash = Get-DepsLockHash -RepoDir $LopakaDir
$savedHash = Get-Content -LiteralPath $stampFile -Raw -Encoding utf8 -ErrorAction SilentlyContinue

$installReason = $null
if ($ForceReinstall) {
    $installReason = "-ForceReinstall requested"
} elseif (-not (Test-Path $nodeModulesDir) -or -not (Test-Path $viteBin)) {
    $installReason = "node_modules or vite binary missing"
} elseif ($null -eq $savedHash) {
    $installReason = "lock stamp (.mps3-lock.sha256) missing"
} elseif ($savedHash.Trim() -ne $currentLockHash) {
    $installReason = "package.json / lockfile changed"
}

if ($installReason) {
    if ($CheckOnly -or $SkipDeps) {
        Add-Status "node_modules" "WARN" "$installReason (skipped due to -CheckOnly/-SkipDeps)"
    } else {
        if (-not (Test-Path (Join-Path $LopakaDir "package.json"))) {
            Add-Status "node_modules" "FAIL" "package.json missing in $LopakaDir"
            exit 1
        }
        Write-Host ("         Running '{0} install' in {1} ({2})..." -f $PkgMgr.Name, $LopakaDir, $installReason) -ForegroundColor Cyan
        Push-Location $LopakaDir
        try {
            & $PkgMgr.Cmd @($PkgMgr.BaseArgs + @("install"))
            $installRc = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        if ($installRc -ne 0 -or -not (Test-Path $viteBin)) {
            Add-Status "node_modules" "FAIL" "$($PkgMgr.Name) install failed (exit $installRc)"
            exit 1
        }
        Write-Utf8NoBomFile -Path $stampFile -Content ($currentLockHash + "`n")
        Add-Status "node_modules" "OK" ("Synced via {0} (lock {1})" -f $PkgMgr.Name, $currentLockHash.Substring(0, 8))
    }
} else {
    Add-Status "node_modules" "OK" ("Up-to-date (lock {0})" -f $currentLockHash.Substring(0, 8))
}

# ==============================================================================
# STEP 3: CLI Shims & User PATH Registration
# ==============================================================================
Write-Host ""
Write-Host "[3/4] Configuring 'lopaka' CLI shims and User PATH..." -ForegroundColor White

if ($LayoutMode -eq "standalone" -and -not $CheckOnly) {
    Write-Utf8NoBomFile -Path $LauncherScript -Content (Get-StandaloneLauncherContent)
    Add-Status "start_lopaka.ps1" "OK" "Synced standalone launcher at $LauncherScript"
} elseif (-not (Test-Path $LauncherScript)) {
    Add-Status "start_lopaka.ps1" "FAIL" "Launcher missing at $LauncherScript"
    if ($CheckOnly) {
        $CriticalErrors.Add("start_lopaka.ps1 missing") | Out-Null
    } else {
        exit 1
    }
} else {
    Add-Status "start_lopaka.ps1" "OK" $LauncherScript
}

$cmdShimPath = Join-Path $ShimTargetDir "lopaka.cmd"
$ps1ShimPath = Join-Path $ShimTargetDir "lopaka.ps1"

$expectedCmdShim = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0start_lopaka.ps1`" %*`r`n"
$expectedPs1Shim = "& (Join-Path `$PSScriptRoot `"start_lopaka.ps1`") @args`r`n"

if ($CheckOnly) {
    $cmdOk = Test-Path $cmdShimPath
    $ps1Ok = Test-Path $ps1ShimPath
    if ($cmdOk -and $ps1Ok) {
        Add-Status "cli shims" "OK" "lopaka.cmd & lopaka.ps1 present in $ShimTargetDir"
    } else {
        Add-Status "cli shims" "WARN" "Missing shims in $ShimTargetDir (run without -CheckOnly)"
    }
} else {
    Write-Utf8NoBomFile -Path $cmdShimPath -Content $expectedCmdShim
    Write-Utf8NoBomFile -Path $ps1ShimPath -Content $expectedPs1Shim
    Add-Status "cli shims" "OK" "Generated lopaka.cmd & lopaka.ps1 in $ShimTargetDir"
}

if (Test-Path $LocalBinDir) {
    $expectedLocalShim = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$LauncherScript`" %*`r`n"
    if ($CheckOnly) {
        if (Test-Path $LocalBinShim) {
            Add-Status ".local\bin shim" "OK" $LocalBinShim
        } else {
            Add-Status ".local\bin shim" "INFO" "Optional mirror absent in $LocalBinDir"
        }
    } else {
        Write-Utf8NoBomFile -Path $LocalBinShim -Content $expectedLocalShim
        Add-Status ".local\bin shim" "OK" "Synced $LocalBinShim"
    }
}

$currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $currentUserPath) { $currentUserPath = "" }
$inUserPath = Test-PathContains -PathList $currentUserPath -TargetDir $ShimTargetDir

if ($SkipPath) {
    $pathNote = if ($inUserPath) { "Already in User PATH (-SkipPath)" } else { "Skipped via -SkipPath" }
    Add-Status "User PATH" "INFO" $pathNote
} elseif ($inUserPath) {
    Add-Status "User PATH" "OK" "Contains $ShimTargetDir"
    if (-not (Test-PathContains -PathList $env:Path -TargetDir $ShimTargetDir)) {
        $env:Path = "$ShimTargetDir;$env:Path"
    }
} elseif ($CheckOnly) {
    Add-Status "User PATH" "WARN" "$ShimTargetDir is NOT in User PATH"
} else {
    $segments = @($currentUserPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $segments += $ShimTargetDir
    $newUserPath = ($segments -join ';')
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
    if (-not (Test-PathContains -PathList $env:Path -TargetDir $ShimTargetDir)) {
        $env:Path = "$ShimTargetDir;$env:Path"
    }
    Add-Status "User PATH" "OK" "Registered $ShimTargetDir in User PATH"
}

# ==============================================================================
# STEP 4: Smoke Test & Standardized Summary Report
# ==============================================================================
Write-Host ""
Write-Host "[4/4] Running smoke checks..." -ForegroundColor White

$resolvedCmd = Get-Command lopaka -ErrorAction SilentlyContinue
if ($resolvedCmd) {
    Add-Status "command lookup" "OK" ("'lopaka' -> {0}" -f $resolvedCmd.Source)
} else {
    $sev = if ($CheckOnly -or $SkipPath) { "WARN" } else { "FAIL" }
    Add-Status "command lookup" $sev "'lopaka' not found on current PATH"
}

if (Test-Path $LauncherScript) {
    $dryArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $LauncherScript, "-DryRun")
    if ($NoUpdate) { $dryArgs += "-NoUpdate" }
    $dryRes = Invoke-ToolCapture -Exe "powershell.exe" -ToolArgs $dryArgs
    if ($dryRes.ExitCode -eq 0) {
        $urlLine = ($dryRes.Lines | Where-Object { $_ -match 'URL Acesso|URL\s+:' } | Select-Object -First 1)
        $verLine = ($dryRes.Lines | Where-Object { $_ -match 'Versao\s+:|Version\s+:' } | Select-Object -First 1)
        $detail = @($urlLine, $verLine) | Where-Object { $_ } | ForEach-Object { ($_ -replace '\s{2,}', ' ') }
        $summary = if ($detail.Count -gt 0) { $detail -join "; " } else { "launcher ready" }
        Add-Status "dry-run test" "OK" "Exit 0 ($summary)"
    } else {
        Add-Status "dry-run test" "FAIL" "Exit $($dryRes.ExitCode) ($($dryRes.Lines -join ' '))"
        $CriticalErrors.Add("dry-run failed") | Out-Null
    }
}

$failCount = @($Report | Where-Object { $_.Status -eq "FAIL" }).Count
$warnCount = @($Report | Where-Object { $_.Status -eq "WARN" }).Count

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Summary Report" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
$Report | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Host $_.TrimEnd() }
Write-Host ""

if ($failCount -gt 0) {
    Write-Host ("Result: FAILED ({0} failures, {1} warnings)." -f $failCount, $warnCount) -ForegroundColor Red
    exit 1
} elseif ($CheckOnly -and $warnCount -gt 0) {
    Write-Host ("Result: CHECK COMPLETE with {0} warning(s). Run .\install_lopaka.ps1 without -CheckOnly to apply fixes." -f $warnCount) -ForegroundColor Yellow
} else {
    Write-Host ("Result: READY (0 failures, {0} warnings)." -f $warnCount) -ForegroundColor Green
    Write-Host ""
    Write-Host "Quick commands (available in any terminal):" -ForegroundColor White
    Write-Host "  lopaka                Auto-update from GitHub, sync deps & start on http://127.0.0.1:5173"
    Write-Host "  lopaka -NoUpdate      Start offline / skip remote git check (alias: -Offline)"
    Write-Host "  lopaka -ForceInstall  Force package reinstall even if lockfile hash matches"
    Write-Host "  lopaka -Tailscale     Expose on Tailscale VPN IP"
    Write-Host "  lopaka -Port 8080     Start on custom port"
    Write-Host "  lopaka -Update        Also fetch upstream (sbrin/lopaka) in addition to origin"
    Write-Host "  lopaka -DryRun        Verify version, lockfile sync and URL without starting Vite"
}

exit 0
