# デプロイ手順書

本サイトは **Cloudflare Pages + Functions + D1** で動作します。以下の順に進めてください。

---

## 0. 事前準備（アカウント取得）

### (a) Cloudflareアカウント
- https://dash.cloudflare.com/sign-up にアクセスし、メールアドレスとパスワードでサインアップ
- 無料プランで問題ありません

### (b) Anthropic APIキー
- https://console.anthropic.com/ にアクセスしてサインアップ
- クレジットカード登録後、左メニュー **API Keys** → **Create Key** でキーを発行
- 発行された `sk-ant-xxxx...` で始まる文字列を控えておく
- 初期のクレジット範囲内なら無料。以降は従量課金（1診断あたり約1〜3円の想定）

### (c) Gitリポジトリ（GitHub推奨）
- GitHubアカウントを用意
- 本プロジェクトを新規リポジトリとしてpush
  ```bash
  cd 診断サイト
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git remote add origin https://github.com/<あなたのユーザー名>/recruit-diagnosis.git
  git push -u origin main
  ```

---

## 1. Cloudflare Pagesでサイトを公開

1. Cloudflareダッシュボード → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. 先ほどpushしたGitHubリポジトリを選択
3. ビルド設定
   - **Framework preset**: None
   - **Build command**: 空欄
   - **Build output directory**: `.`（ピリオドのみ）
4. **Save and Deploy** をクリック
5. `https://recruit-site-diagnosis.pages.dev` のようなURLが発行される（この時点で静的部分は公開済み）

---

## 2. D1データベースを作成

ローカルで以下を実行してください。

```bash
# wrangler CLI のインストール（初回のみ）
npm install -g wrangler

# Cloudflare にログイン
wrangler login

# D1 データベースを作成
wrangler d1 create recruit-diagnosis
```

実行結果に表示される `database_id` を **wrangler.toml** の `YOUR_D1_DATABASE_ID_HERE` と書き換えてください。

```toml
[[d1_databases]]
binding = "DB"
database_name = "recruit-diagnosis"
database_id = "ここに貼り付け"
```

その後、スキーマを流し込みます。

```bash
wrangler d1 execute recruit-diagnosis --remote --file=schema.sql
```

変更した `wrangler.toml` をGitにpushしてください。

---

## 3. 環境変数とD1バインディングをPagesに設定

Cloudflareダッシュボード → 作成したPagesプロジェクト → **Settings** を開く。

### (a) 環境変数
- **Settings** → **Environment variables** → **Add variable**
  - Variable name: `CLAUDE_API_KEY`
  - Value: `sk-ant-xxxx...`（控えたAPIキー）
  - Type: **Secret** を選択
- Production / Preview 両方に同じ値を設定

### (b) D1バインディング
- **Settings** → **Functions** → **D1 database bindings** → **Add binding**
  - Variable name: `DB`
  - D1 database: `recruit-diagnosis` を選択
- Production / Preview 両方に設定

設定後、**Deployments** → 最新デプロイの **Retry deployment** で再デプロイしてください。

---

## 4. 動作確認

1. `https://<your-project>.pages.dev` にアクセス
2. 採用サイトのURLを入力して「無料で診断する」
3. 20〜40秒後に結果画面が表示されれば成功
4. D1にデータが入っているか確認:
   ```bash
   wrangler d1 execute recruit-diagnosis --remote --command="SELECT id, domain, total_score, analyzed_at FROM analyses ORDER BY id DESC LIMIT 20"
   ```

---

## 5. 入力企業リストを確認する（暫定）

現時点では、入力企業の一覧はwrangler CLIで以下のように確認できます。

```bash
# 過去50件
wrangler d1 execute recruit-diagnosis --remote --command="SELECT id, domain, url, total_score, grade, analyzed_at FROM analyses ORDER BY id DESC LIMIT 50"

# ドメインごとの件数（リード集計）
wrangler d1 execute recruit-diagnosis --remote --command="SELECT domain, COUNT(*) AS count, MAX(analyzed_at) AS last FROM analyses GROUP BY domain ORDER BY count DESC"

# CSVエクスポート
wrangler d1 execute recruit-diagnosis --remote --command="SELECT * FROM analyses" --json > leads.json
```

将来、`/admin` のような管理画面ページを用意する場合は第2フェーズで実装します。

---

## 6. 独自ドメインを設定する（任意）

Pagesプロジェクトの **Custom domains** から、保有ドメインを追加できます。DNS設定はCloudflare側のガイドに従ってください。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 「サーバー設定エラー: APIキーが未設定です」 | 手順3-aを確認、Retry deployment |
| 「ページ取得に失敗しました」 | 対象URLが robots/認証で閲覧不可。別URLで再試行 |
| 結果が常にダミーと同じ | sessionStorageに前回データが残っている可能性。ブラウザのストレージをクリア |
| D1にレコードが入らない | 手順3-bのバインディング設定、および wrangler.toml の database_id を確認 |

---

## 費用の目安

| 項目 | 無料枠 | 想定超過費 |
|---|---|---|
| Cloudflare Pages | 無制限リクエスト | $0 |
| Cloudflare Functions | 100,000 リクエスト/日 | $0（個人利用範囲） |
| Cloudflare D1 | 500万行読み取り/日 | $0 |
| Anthropic Claude API | トライアルクレジット | 1診断 ≒ 1〜3円 |

月間100〜200診断の規模なら、ほぼAPI従量課金のみ（数百〜千円台）で運用可能です。
