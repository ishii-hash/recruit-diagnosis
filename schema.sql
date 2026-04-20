-- D1 スキーマ: analyses テーブル（入力URL・診断ログの蓄積）
-- 実行方法:
--   wrangler d1 execute recruit-diagnosis --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS analyses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  url          TEXT NOT NULL,
  domain       TEXT NOT NULL,
  total_score  INTEGER DEFAULT 0,
  grade        TEXT,
  analyzed_at  TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  referer      TEXT
);

CREATE INDEX IF NOT EXISTS idx_analyses_domain      ON analyses(domain);
CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at ON analyses(analyzed_at);
