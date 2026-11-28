-- Fangatahana asa alefan'ny Mpanjifa amin'ny MADAGASCAR EARN.
-- Tsy iraka ho an'ny Mpiasa ity; ny Administrateur ihany no mamadika azy ho iraka.
CREATE TABLE IF NOT EXISTS job_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  description TEXT NOT NULL,
  proposed_budget_ariary INTEGER,
  deadline_date TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','in_discussion','proposal_sent','accepted','declined','converted')),
  admin_note TEXT,
  agreed_budget_ariary INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_job_requests_client
ON job_requests(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_requests_status
ON job_requests(status, created_at);
