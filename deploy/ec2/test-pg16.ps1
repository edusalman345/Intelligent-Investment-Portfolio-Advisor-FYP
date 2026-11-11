param(
  [string]$PostgresBin,
  [int]$Port = 55436,
  [string]$MarketSnapshot
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $PostgresBin) { $PostgresBin = Join-Path $repoRoot '.tmp/postgres16-runtime/pgsql/bin' }
$PostgresBin = [IO.Path]::GetFullPath($PostgresBin)
if ($Port -lt 1024 -or $Port -gt 65535 -or $Port -eq 5432) { throw 'Use a dedicated non-default test port.' }
foreach ($name in @('postgres','initdb','pg_ctl','createdb','psql')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin "$name.exe"))) { throw 'Supply portable PostgreSQL 16 binaries with -PostgresBin.' }
}
$version = & (Join-Path $PostgresBin 'postgres.exe') --version
if ($LASTEXITCODE -ne 0 -or $version -notmatch 'PostgreSQL\) 16\.') { throw 'PostgreSQL major version 16 is required.' }
if ((& node --version) -notmatch '^v24\.') { throw 'Use Node.js 24 on PATH.' }
$clusterPath = [IO.Path]::GetFullPath((Join-Path $repoRoot ('.tmp/pg16-validation-' + [Guid]::NewGuid().ToString('N'))))
if (-not $clusterPath.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test cluster must stay inside the repository.' }
$savedEnvironment = @{}
foreach ($name in @('NODE_ENV','DATABASE_URL','TEST_DATABASE_URL')) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$oldLocation = Get-Location
$started = $false
try {
  Set-Location -LiteralPath $repoRoot
  New-Item -ItemType Directory -Path $clusterPath | Out-Null
  # Trust applies only to this new disposable loopback cluster, never an installed service.
  & (Join-Path $PostgresBin 'initdb.exe') -D $clusterPath -U iipa_test --auth=trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL initialization failed.' }
  & (Join-Path $PostgresBin 'pg_ctl.exe') start -D $clusterPath -l (Join-Path $clusterPath 'server.log') -o "-h 127.0.0.1 -p $Port" -w
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL startup failed; check for a test-port conflict.' }
  $started = $true
  & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $Port -U iipa_test iipa_pg16_test
  if ($LASTEXITCODE -ne 0) { throw 'Disposable database creation failed.' }
  $env:NODE_ENV = 'test'
  $env:DATABASE_URL = "postgresql://iipa_test@127.0.0.1:$Port/iipa_pg16_test"
  $env:TEST_DATABASE_URL = $env:DATABASE_URL
  & node --import tsx services/api/src/db/migrate.ts
  if ($LASTEXITCODE -ne 0) { throw 'Fresh PostgreSQL 16 migrations failed.' }
  & node --import tsx services/api/src/db/migrate.ts
  if ($LASTEXITCODE -ne 0) { throw 'Repeated PostgreSQL 16 migrations failed.' }
  $schema = & (Join-Path $PostgresBin 'psql.exe') -X -h 127.0.0.1 -p $Port -U iipa_test -d iipa_pg16_test -Atc "SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') || ':' || (SELECT count(*) FROM schema_migrations) || ':' || (SELECT count(*) FROM subscription_plans WHERE (code='free' AND price_monthly=0 AND status='active') OR (code='pro' AND price_monthly IS NULL AND status='coming_soon'));"
  if ($LASTEXITCODE -ne 0 -or $schema -ne '23:2:2') { throw 'Unexpected PostgreSQL 16 migration/catalog schema.' }
  Write-Output 'PASS PostgreSQL 16 fresh/repeated migrations: 23 tables, 2 ledger records, 2 expected plans.'
  if (-not $MarketSnapshot) { $MarketSnapshot = Join-Path $repoRoot '.tmp/deploy-public-market.json' }
  if (-not (Test-Path -LiteralPath $MarketSnapshot)) { throw 'Supply the validated public market-data archive with -MarketSnapshot.' }
  # Import a public provider recording twice into this disposable database only.
  & node deploy/ec2/import-market.mjs $MarketSnapshot
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 16 public market import failed.' }
  & node deploy/ec2/import-market.mjs $MarketSnapshot
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 16 repeated public market import failed.' }
  $market = & (Join-Path $PostgresBin 'psql.exe') -X -h 127.0.0.1 -p $Port -U iipa_test -d iipa_pg16_test -Atc "SELECT (SELECT count(*) FROM assets) || ':' || (SELECT count(*) FROM market_quotes) || ':' || (SELECT count(*) FROM market_price_bars) || ':' || (SELECT count(*) FROM users) || ':' || (SELECT count(*) FROM data_sources WHERE name='Alpha Vantage free daily data' AND config->>'isDemo'='false');"
  if ($LASTEXITCODE -ne 0 -or $market -ne '5:5:500:0:1') { throw 'Unexpected market import persistence or duplicate records.' }
  $snapshot = Get-Content -LiteralPath $MarketSnapshot -Raw | ConvertFrom-Json
  foreach ($entry in $snapshot.assets) {
    if ($entry.asset.symbol -notmatch '^(AAPL|MSFT|NVDA|TSLA|AVGO)$') { throw 'Unexpected public snapshot symbol.' }
    # No owner identity is queried. Compare the original public market recording timestamp.
    $recorded = ([DateTimeOffset]::Parse($entry.recordedAt)).ToUnixTimeMilliseconds()
    $asOf = ([DateTimeOffset]::Parse($entry.quotes[0].asOf)).ToUnixTimeMilliseconds()
    $timestamp = & (Join-Path $PostgresBin 'psql.exe') -X -h 127.0.0.1 -p $Port -U iipa_test -d iipa_pg16_test -Atc "SELECT (extract(epoch FROM q.ingested_at)*1000)::bigint || ':' || (extract(epoch FROM q.as_of)*1000)::bigint || ':' || (SELECT count(*) FROM market_price_bars b WHERE b.asset_id=a.id AND b.ingested_at=q.ingested_at) FROM market_quotes q JOIN assets a ON a.id=q.asset_id WHERE a.symbol='$($entry.asset.symbol)';"
    if ($LASTEXITCODE -ne 0 -or [string]$timestamp -ne "${recorded}:${asOf}:100") { throw 'Original provider recording timestamp changed during import.' }
  }
  Write-Output 'PASS PostgreSQL 16 market import/reimport: 5 assets, 5 quotes, 500 bars, 0 users; original timestamps preserved.'
  # Integration helpers must compare against a DIFFERENT owner database; none is supplied here.
  Remove-Item Env:DATABASE_URL
  & npm.cmd run test:db
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 16 integration tests failed.' }
  Write-Output "PASS disposable PostgreSQL validation: $version"
} finally {
  if ($started) { & (Join-Path $PostgresBin 'pg_ctl.exe') stop -D $clusterPath -m fast -w }
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  Set-Location -LiteralPath $oldLocation
}
