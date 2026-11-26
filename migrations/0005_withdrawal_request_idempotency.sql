-- MADAGASCAR EARN V2 - WITHDRAWAL REQUEST IDEMPOTENCY
--
-- Mialoha ny fametrahana API fangatahana fisintonana vola.
-- Ny operation_key dia manakana ny fangatahana iray tsy ho voatahiry indroa.
-- Tsy manova ny solde na ny fangatahana efa misy ity migration ity.
--
-- Ataovy aloha ny migration 0004_wallet_transaction_idempotency.sql.
-- Hamarino amin'ny D1 Preview sy Production ny schema alohan'ny fampiharana.

ALTER TABLE withdrawals
ADD COLUMN operation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_operation_key
ON withdrawals(operation_key)
WHERE operation_key IS NOT NULL;
