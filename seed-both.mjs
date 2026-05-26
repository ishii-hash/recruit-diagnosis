import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

const files = readdirSync(dbDir).filter(f => f.endsWith('.sqlite') && !f.includes('metadata'));

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS gacha_prizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    rarity TEXT DEFAULT 'normal',
    weight INTEGER DEFAULT 100,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS gacha_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prize_id INTEGER,
    pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS gacha_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER,
    prize_id INTEGER,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    email TEXT NOT NULL,
    claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const PRIZES = [
  ['求人原稿1本無料制作',        'プロのコピーライターが求人原稿を1本まるごと無料で制作します。',            'normal',     100],
  ['HRハッカー1か月無料',        '採用担当者向けメディア「HRハッカー」を1か月間無料でご利用いただけます。', 'normal',     80],
  ['広報記事1本無料執筆',        '貴社のPRに役立つ広報記事を1本、プロライターが無料で執筆します。',         'rare',       50],
  ['Indeed3万円分無料サービス',  'Indeed掲載費3万円分を無料でご提供。採用コストを抑えて即戦力を採用。',    'rare',       35],
  ['採用コンサル1か月無料お試し','上級コンサルタントによる採用戦略コンサルティングを1か月無料でお試し。',  'super_rare', 15],
];

for (const f of files) {
  const dbPath = join(dbDir, f);
  console.log(`\nProcessing ${f.slice(0,8)}... (${statSync(dbPath).size} bytes)`);
  try {
    const db = new DatabaseSync(dbPath);

    // Check what tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('  Tables:', tables.map(t=>t.name).join(', ') || '(none)');

    db.exec(SCHEMA);

    const count = db.prepare('SELECT COUNT(*) as c FROM gacha_prizes').get();
    console.log('  Prizes before:', count.c);

    if (count.c === 0) {
      const ins = db.prepare('INSERT INTO gacha_prizes (name, description, rarity, weight) VALUES (?,?,?,?)');
      PRIZES.forEach(r => ins.run(...r));
      console.log('  Seeded 6 prizes');
    }

    db.close();
  } catch(e) {
    console.error('  Error:', e.message);
  }
}
console.log('\nDone.');
