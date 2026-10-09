param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin', [int]$Port = 55432)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$clusterPath = [IO.Path]::GetFullPath((Join-Path $repoRoot '.tmp\postgres-p1-test'))
if (-not $clusterPath.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test cluster must remain inside the repository.' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choose a nonprivileged test port.' }
$initdb = Join-Path $PostgresBin 'initdb.exe'
$pgctl = Join-Path $PostgresBin 'pg_ctl.exe'
$createdb = Join-Path $PostgresBin 'createdb.exe'
foreach ($tool in @($initdb,$pgctl,$createdb)) { if (-not (Test-Path -LiteralPath $tool)) { throw 'PostgreSQL 18 command-line tools were not found. Supply -PostgresBin.' } }
if (-not (Test-Path -LiteralPath (Join-Path $clusterPath 'PG_VERSION'))) {
  New-Item -ItemType Directory -Force -Path $clusterPath | Out-Null
  & $initdb -D $clusterPath -U ifms_test --auth=trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL initialization failed.' }
}
& $pgctl status -D $clusterPath *> $null
if ($LASTEXITCODE -ne 0) {
  # Trust is confined to this disposable loopback cluster, never the owner's development database.
  & $pgctl start -D $clusterPath -l (Join-Path $clusterPath 'server.log') -o "-h 127.0.0.1 -p $Port" -w
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL could not start. Check whether the test port is occupied.' }
}
$psql = Join-Path $PostgresBin 'psql.exe'
$exists = & $psql -h 127.0.0.1 -p $Port -U ifms_test -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='ifms_p1_test'"
if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL is unavailable.' }
if (-not ($exists -match '1')) {
  & $createdb -h 127.0.0.1 -p $Port -U ifms_test ifms_p1_test
  if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed.' }
}
Write-Output "Set TEST_DATABASE_URL in the current shell to postgresql://ifms_test@127.0.0.1:$Port/ifms_p1_test, then run npm run test:db."
Write-Output 'This disposable database is reset by integration tests. Stop it using pg_ctl stop -D .tmp\postgres-p1-test.'
