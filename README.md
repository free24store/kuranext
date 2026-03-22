# KuraNext — セットアップ & デプロイ手順

完全無料構成：**Supabase**（DB・Auth・Storage）× **Vercel**（ホスティング）

---

## 必要なアカウント

| サービス | URL | 無料枠 |
|---------|-----|-------|
| Supabase | https://supabase.com | DB 500MB・Storage 1GB・Auth 無制限 |
| Vercel | https://vercel.com | 帯域 100GB/月・デプロイ 無制限 |
| GitHub | https://github.com | リポジトリ 無制限 |

---

## STEP 1 — Supabase プロジェクト作成

1. https://supabase.com にアクセスし、**Sign Up**
2. **New project** をクリック
3. プロジェクト名：`kuranext`、パスワード（DBパスワード）を設定、リージョン：`Northeast Asia (Tokyo)`
4. 作成完了まで約1〜2分待つ

---

## STEP 2 — データベース初期化

1. Supabase Dashboard の左メニューから **SQL Editor** を開く
2. `supabase/schema.sql` の内容を貼り付けて **Run** を実行
3. 「Success」と表示されればOK

---

## STEP 3 — Supabase の接続情報を取得

1. **Settings > API** を開く
2. 以下をメモする：

```
Project URL:  https://xxxxxxxxxx.supabase.co
anon (public) key: eyJhbGci...（長い文字列）
```

---

## STEP 4 — app.js に接続情報を設定

`app.js` の冒頭を編集：

```javascript
const SUPABASE_URL = 'https://xxxxxxxxxx.supabase.co';  // ← 差し替え
const SUPABASE_ANON_KEY = 'eyJhbGci...';                 // ← 差し替え
```

---

## STEP 5 — マスター管理者アカウントを作成

1. Supabase Dashboard > **Authentication > Users** を開く
2. **Invite user** をクリック
3. メールアドレスを入力して招待
4. 届いたメールのリンクからパスワードを設定してログイン
5. ログイン後、**SQL Editor** で以下を実行（UIDはAuthenticationページで確認できる）：

```sql
INSERT INTO profiles (id, tenant_id, name, role)
VALUES ('<ここにUID>', NULL, 'マスター管理者', 'master');
```

---

## STEP 6 — GitHub にプッシュ

```bash
# リポジトリ作成（GitHub上で作成後）
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/あなた/kuranext.git
git push -u origin main
```

---

## STEP 7 — Vercel にデプロイ

1. https://vercel.com にアクセスし、**Sign Up with GitHub**
2. **Add New > Project** をクリック
3. GitHubリポジトリ（kuranext）を選択
4. Framework Preset：**Other**
5. **Deploy** をクリック
6. 数十秒でデプロイ完了。URLが発行される（例：`https://kuranext.vercel.app`）

---

## STEP 8 — Supabase の認証設定

1. Supabase Dashboard > **Authentication > URL Configuration**
2. **Site URL** に Vercel のURL を入力：  
   `https://kuranext.vercel.app`
3. **Redirect URLs** に追加：  
   `https://kuranext.vercel.app/**`

---

## STEP 9 — 最初のテナント・管理者を作成

マスター管理者でログインし、**テナント管理** から会社を追加する。

スタッフの追加方法：
1. 管理者画面 > **スタッフ管理** > **＋スタッフを追加**
2. メールアドレスを入力
3. Supabase Dashboard > Authentication > **Invite user** から招待メールを送る
4. 招待されたスタッフがメールのリンクからパスワード設定
5. 管理者画面 > SQL Editor で以下を実行してテナントとロールを紐付ける：

```sql
-- スタッフのauth UIDを確認後
INSERT INTO profiles (id, tenant_id, name, role, hourly_rate, join_date)
VALUES (
  '<スタッフのUID>',
  '<テナントID>',  -- テnantsテーブルで確認
  '田中 太郎',
  'staff',
  2000,
  '2025-04-01'
);
```

> 今後はSupabase Edge Functionsで自動化予定（スタッフ登録フォームから自動プロフィール作成）

---

## AI仕分け機能の有効化

1. https://console.anthropic.com でAPIキーを取得
2. **管理者画面 > 設定** または **マスター画面 > システム設定** にAPIキーを入力
3. APIキーはブラウザのlocalStorageに保存される（サーバーには送信されない）

---

## ファイル構成

```
kuranext/
├── index.html          # ログイン画面
├── staff.html          # スタッフ画面（写真・勤怠・工程）
├── admin.html          # 管理者画面（全機能）
├── master.html         # マスター画面（隠し）
├── app.js              # Supabase共通ロジック
├── style.css           # 共通CSS
├── vercel.json         # Vercelデプロイ設定
└── supabase/
    └── schema.sql      # DBスキーマ（初回のみ実行）
```

---

## カスタムドメインを使う場合（Vercel）

1. Vercel Dashboard > プロジェクト > **Settings > Domains**
2. 独自ドメインを追加
3. DNSレコードを設定（Vercelが案内してくれる）
4. Supabase の Site URL・Redirect URLs も更新する

---

## よくある質問

**Q: 写真が表示されない**  
A: SupabaseのStorageバケット `photos` が作成されているか確認。schema.sqlの最後の部分を再実行。

**Q: ログインできない**  
A: Supabase > Authentication > Usersでユーザーが作成されているか確認。profilesテーブルにレコードがあるか確認。

**Q: RLSエラーが出る**  
A: schema.sqlのRLS部分を再実行。または Supabase > Table Editor でRLSが有効になっているか確認。

**Q: 無料枠を超えそう**  
A: SupabaseはDB 500MB・Storage 1GBが無料。写真を大量に扱う場合はストレージが先に上限に達する可能性あり。その場合は有料プランへのアップグレードを検討。
