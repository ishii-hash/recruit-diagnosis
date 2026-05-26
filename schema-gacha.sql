-- Gacha system schema
-- 実行: wrangler d1 execute recruit-diagnosis --remote --file=schema-gacha.sql

CREATE TABLE IF NOT EXISTS gacha_prizes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url   TEXT DEFAULT '',
  rarity      TEXT DEFAULT 'normal' CHECK(rarity IN ('normal', 'rare', 'super_rare')),
  weight      INTEGER DEFAULT 100,
  is_active   INTEGER DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gacha_results (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  prize_id  INTEGER REFERENCES gacha_prizes(id) ON DELETE SET NULL,
  pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gacha_results_pulled_at ON gacha_results(pulled_at);
CREATE INDEX IF NOT EXISTS idx_gacha_prizes_rarity     ON gacha_prizes(rarity);

-- 特典申請（リード獲得）テーブル
CREATE TABLE IF NOT EXISTS gacha_claims (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id  INTEGER REFERENCES gacha_results(id) ON DELETE SET NULL,
  prize_id   INTEGER REFERENCES gacha_prizes(id)  ON DELETE SET NULL,
  name       TEXT NOT NULL,
  company    TEXT DEFAULT '',
  email      TEXT NOT NULL,
  claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gacha_claims_claimed_at ON gacha_claims(claimed_at);
CREATE INDEX IF NOT EXISTS idx_gacha_claims_email      ON gacha_claims(email);

-- 特典データ
INSERT INTO gacha_prizes (name, description, rarity, weight) VALUES
  ('求人原稿1本無料制作',         'プロのコピーライターが求人原稿を1本まるごと無料で制作します。',             'normal',     100),
  ('HRハッカー1か月無料',         '採用担当者向けメディア「HRハッカー」を1か月間無料でご利用いただけます。',  'normal',     80),
  ('広報記事1本無料執筆',         '貴社のPRに役立つ広報記事を1本、プロライターが無料で執筆します。',          'rare',       50),
  ('Indeed3万円分無料サービス',   'Indeed掲載費3万円分を無料でご提供。採用コストを抑えて即戦力を採用。',     'rare',       35),
  ('採用コンサル1か月無料お試し', '上級コンサルタントによる採用戦略コンサルティングを1か月無料でお試し。',   'super_rare', 15);
