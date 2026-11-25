-- MADAGASCAR EARN V2: bokin'ny fivezivezen'ny vola (ledger).
-- Migration fanampiny: tsy manova na mamafa ny balance efa misy.
-- Alefaso aloha amin'ny Preview D1 ary zahao ny schema alohan'ny Production.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_ariary INTEGER NOT NULL CHECK (amount_ariary > 0),
  balance_before_ariary INTEGER CHECK (balance_before_ariary IS NULL OR balance_before_ariary >= 0),
  balance_after_ariary INTEGER CHECK (balance_after_ariary IS NULL OR balance_after_ariary >= 0),
  reference_type TEXT,
  reference_id TEXT,
  description TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
ON wallet_transactions(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference
ON wallet_transactions(reference_type, reference_id);
