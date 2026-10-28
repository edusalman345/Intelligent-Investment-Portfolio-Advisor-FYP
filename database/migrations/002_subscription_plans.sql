-- Prototype catalog only. It has no user associations or authorization effects.
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(32) NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name varchar(80) NOT NULL CHECK (length(trim(name)) > 0),
  description text NOT NULL,
  price_monthly numeric(12,2) CHECK (price_monthly >= 0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL CHECK (status IN ('active','coming_soon')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'active' AND price_monthly IS NOT NULL)
    OR (status = 'coming_soon' AND price_monthly IS NULL))
);

-- Reference data follows the same immutable migration ledger as the schema.
-- ON CONFLICT preserves existing records if this seed is deliberately replayed.
INSERT INTO subscription_plans(code,name,description,price_monthly,currency,status,display_order)
VALUES
  ('free','Free','Your current investment workspace, with portfolio management, stock search, historical market data and watchlists.',0,'USD','active',0),
  ('pro','Pro','Planned AI insights, portfolio risk analysis, forecasting and intelligent alerts. These features are not available yet.',NULL,'USD','coming_soon',1)
ON CONFLICT(code) DO NOTHING;
