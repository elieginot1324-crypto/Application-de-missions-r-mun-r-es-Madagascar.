-- MADAGASCAR EARN V2 - WALLET TRANSACTION IDEMPOTENCY
--
-- Migration vaovao ho an'ny D1 PRODUCTION.
-- Aza alefa raha tsy efa naverina nohamarinina ny schema:
-- PRAGMA table_info(wallet_transactions);
-- PRAGMA index_list(wallet_transactions);
--
-- Ny operation_key dia NULL amin'ny transaction taloha.
-- Ny UNIQUE INDEX partial dia miaro ny hetsika vaovao tsy ho voarakitra indroa,
-- nefa tsy manakana ireo transaction taloha izay tsy manana key.
--
-- Tsy manova solde na mamorona transaction ity migration ity.

ALTER TABLE wallet_transactions
ADD COLUMN operation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_operation_key
ON wallet_transactions(operation_key)
WHERE operation_key IS NOT NULL;
