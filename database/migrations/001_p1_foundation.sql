CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(320) NOT NULL,
  password_hash text, display_name varchar(120), timezone varchar(64),
  role text NOT NULL DEFAULT 'INVESTOR' CHECK (role IN ('INVESTOR','ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_unique ON users(lower(email));
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  base_currency char(3) NOT NULL DEFAULT 'USD' CHECK (base_currency = 'USD'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL, csrf_token text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, user_agent text
);
CREATE INDEX auth_sessions_user_expiry ON auth_sessions(user_id,expires_at);
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reset_user_expiry ON password_reset_tokens(user_id,expires_at);
CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider='google'), provider_subject text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_subject), UNIQUE(user_id,provider)
);
CREATE TABLE oauth_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL, state_hash text NOT NULL,
  nonce text NOT NULL, code_verifier text NOT NULL,
  link_user_id uuid REFERENCES users(id) ON DELETE CASCADE, link_session_id uuid REFERENCES auth_sessions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((link_user_id IS NULL) = (link_session_id IS NULL))
);
CREATE INDEX oauth_expiry ON oauth_transactions(expires_at);
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY, actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(100) NOT NULL, entity_type varchar(80), entity_id uuid, request_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_actor_time ON audit_logs(actor_user_id,created_at DESC);
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), symbol varchar(32) NOT NULL, name varchar(255) NOT NULL,
  asset_type text NOT NULL DEFAULT 'STOCK' CHECK (asset_type IN ('STOCK','ETF','INDEX','COMMODITY','OTHER')),
  exchange varchar(64) NOT NULL, currency char(3) NOT NULL DEFAULT 'USD', sector varchar(120), industry varchar(160),
  provider_identifiers jsonb NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(symbol,exchange)
);
CREATE INDEX assets_search ON assets(symbol,name);
CREATE TABLE portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL, description text, base_currency char(3) NOT NULL DEFAULT 'USD' CHECK (base_currency='USD'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE UNIQUE INDEX active_portfolio_name ON portfolios(user_id,lower(name)) WHERE status='ACTIVE';
CREATE INDEX portfolio_owner_status ON portfolios(user_id,status);
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES assets(id), transaction_type text NOT NULL CHECK (transaction_type IN ('BUY','SELL','DIVIDEND','FEE','DEPOSIT','WITHDRAWAL','REVERSAL')),
  quantity numeric(24,8), price numeric(24,8), amount numeric(24,8), currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency='USD'),
  fees numeric(24,8) NOT NULL DEFAULT 0 CHECK (fees>=0), occurred_at timestamptz NOT NULL,
  notes varchar(1000), source text NOT NULL DEFAULT 'MANUAL', idempotency_key uuid NOT NULL, request_fingerprint text NOT NULL,
  reverses_transaction_id uuid UNIQUE REFERENCES transactions(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id,idempotency_key), CHECK(quantity IS NULL OR quantity>0), CHECK(price IS NULL OR price>0), CHECK(amount IS NULL OR amount>0),
  CHECK((transaction_type IN ('BUY','SELL') AND asset_id IS NOT NULL AND quantity IS NOT NULL AND price IS NOT NULL AND amount IS NULL AND reverses_transaction_id IS NULL)
    OR (transaction_type IN ('DIVIDEND','FEE','DEPOSIT','WITHDRAWAL') AND amount IS NOT NULL AND quantity IS NULL AND price IS NULL AND reverses_transaction_id IS NULL)
    OR (transaction_type='REVERSAL' AND reverses_transaction_id IS NOT NULL AND asset_id IS NULL AND quantity IS NULL AND price IS NULL AND amount IS NULL))
);
CREATE INDEX transactions_portfolio_time ON transactions(portfolio_id,occurred_at,created_at,id);
CREATE TABLE holdings (
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, asset_id uuid NOT NULL REFERENCES assets(id),
  quantity numeric(24,8) NOT NULL CHECK(quantity>=0), average_cost numeric(24,8) NOT NULL CHECK(average_cost>=0),
  cost_currency char(3) NOT NULL DEFAULT 'USD', updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(portfolio_id,asset_id)
);
CREATE TABLE watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX watchlist_owner_name ON watchlists(user_id,lower(name));
CREATE TABLE watchlist_items (
  watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE, asset_id uuid NOT NULL REFERENCES assets(id),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(watchlist_id,asset_id)
);
CREATE TABLE portfolio_valuation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL, total_market_value numeric(24,8) NOT NULL, cash_value numeric(24,8) NOT NULL DEFAULT 0,
  unpriced_position_count integer NOT NULL DEFAULT 0, base_currency char(3) NOT NULL, source_cutoff timestamptz,
  details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(portfolio_id,as_of)
);
CREATE INDEX valuations_portfolio_time ON portfolio_valuation_snapshots(portfolio_id,as_of DESC);
CREATE TABLE data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL, source_type text NOT NULL CHECK(source_type IN ('MARKET','ECONOMIC')),
  base_url text, is_enabled boolean NOT NULL DEFAULT true, config jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name,source_type)
);
CREATE TABLE market_quotes (
  id bigserial PRIMARY KEY, asset_id uuid NOT NULL REFERENCES assets(id), source_id uuid NOT NULL REFERENCES data_sources(id),
  price numeric(24,8) NOT NULL CHECK(price>0), currency char(3) NOT NULL, volume numeric(28,4) CHECK(volume>=0),
  as_of timestamptz NOT NULL, ingested_at timestamptz NOT NULL DEFAULT now(), is_valid boolean NOT NULL DEFAULT true,
  UNIQUE(asset_id,source_id,as_of)
);
CREATE INDEX quotes_asset_time ON market_quotes(asset_id,as_of DESC);
CREATE TABLE market_price_bars (
  id bigserial PRIMARY KEY, asset_id uuid NOT NULL REFERENCES assets(id), source_id uuid NOT NULL REFERENCES data_sources(id),
  interval text NOT NULL DEFAULT '1d' CHECK(interval='1d'), bar_time timestamptz NOT NULL,
  open numeric(24,8) NOT NULL CHECK(open>0), high numeric(24,8) NOT NULL CHECK(high>0), low numeric(24,8) NOT NULL CHECK(low>0), close numeric(24,8) NOT NULL CHECK(close>0),
  volume numeric(28,4) CHECK(volume>=0), adjusted_close numeric(24,8), ingested_at timestamptz NOT NULL DEFAULT now(), is_valid boolean NOT NULL DEFAULT true,
  CHECK(high>=low AND high>=open AND high>=close AND low<=open AND low<=close), UNIQUE(asset_id,source_id,interval,bar_time)
);
CREATE INDEX bars_asset_time ON market_price_bars(asset_id,interval,bar_time DESC);
CREATE TABLE economic_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(64) NOT NULL, name varchar(255) NOT NULL, unit text, frequency text,
  source_id uuid NOT NULL REFERENCES data_sources(id), is_active boolean NOT NULL DEFAULT true, UNIQUE(code,source_id)
);
CREATE TABLE economic_observations (
  id bigserial PRIMARY KEY, indicator_id uuid NOT NULL REFERENCES economic_indicators(id) ON DELETE CASCADE,
  observation_time timestamptz NOT NULL, value numeric(28,8) NOT NULL, ingested_at timestamptz NOT NULL DEFAULT now(), UNIQUE(indicator_id,observation_time)
);
CREATE TABLE ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES data_sources(id), job_type text NOT NULL,
  status text NOT NULL CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  records_received integer NOT NULL DEFAULT 0, records_written integer NOT NULL DEFAULT 0, error_summary text, request_id uuid
);
CREATE INDEX ingestion_source_time ON ingestion_runs(source_id,started_at DESC);
CREATE TABLE data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ingestion_run_id uuid REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  entity_type varchar(60) NOT NULL, external_key text, issue_code varchar(80) NOT NULL,
  severity text NOT NULL CHECK(severity IN ('INFO','WARN','ERROR')), details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quality_run ON data_quality_issues(ingestion_run_id);
