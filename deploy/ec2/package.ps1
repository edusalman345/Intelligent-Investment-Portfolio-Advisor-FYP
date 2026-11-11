param(
    [string]$Python = '',
    [string]$Output = '.tmp/iipa-release.tar.gz',
    [switch]$IncludeMarketSnapshot,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $repoRoot
try {
    if ((& node --version) -notmatch '^v24\.') { throw 'Use Node.js 24 on PATH before packaging.' }
    if (-not $Python) {
        $candidates = @(
            (Join-Path $env:LOCALAPPDATA 'Programs/Python/Python313/python.exe'),
            (Join-Path $repoRoot 'services/analytics/.venv/Scripts/python.exe')
        )
        foreach ($candidate in $candidates) {
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $Python = $candidate; break }
        }
        if (-not $Python) {
            $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
            if ($pythonCommand) { $Python = $pythonCommand.Source }
        }
    }
    if (-not $Python) { throw 'Python 3 is required. Supply -Python with its executable path.' }
    & $Python -c 'import sys; assert sys.version_info >= (3, 11)'
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or newer is required.' }
    if (-not $SkipBuild) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Production build failed; no release created.' }
    }
    $archiveArgs = @('deploy/ec2/archive.py', 'build', '--root', $repoRoot, '--output', $Output)
    if ($IncludeMarketSnapshot) { $archiveArgs += '--include-market-snapshot' }
    & $Python @archiveArgs
    if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed.' }
    & $Python deploy/ec2/archive.py verify $Output --sha256-file "$Output.sha256"
    if ($LASTEXITCODE -ne 0) { throw 'Release verification failed.' }
    Write-Output "Release: $Output"
    Write-Output "Checksum: $Output.sha256"
    Write-Output 'Local artifact only. No SSH, AWS or GitHub operation was performed.'
}
finally { Pop-Location }
