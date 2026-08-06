# 琉球大学附属図書館 選書支援ツール

沖縄県内の出版社や新刊情報から「沖縄・琉球・奄美」に関する地域資料、および総合大学として必要な「一般学術書」の新刊情報を自動収集し、琉大の所蔵・未所蔵を判別する選書支援ツールです。

## 特徴
- **完全無料での運用**: データベースやサーバー料金は一切発生せず、GitHubの提供する無料枠（GitHub Pages & Actions）のみで動作します。
- **APIキーの隠蔽 (匿名化)**: カーリルAPIキーはGitHub Actionsの暗号化されたSecrets内にのみ保存され、公開ページには一切露出しないため安全です。
- **CSV出力機能**: ExcelやGoogleスプレッドシートで文字化けしない（BOM付きUTF-8）CSVファイルを即座に出力できます。
- **琉大OPAC直接連携**: 所蔵がある書籍はOPACの配架場所に直接リンクし、未所蔵の書籍はワンクリックでOPACでの再検索が可能です。

---

## 💻 管理者向け：初期セットアップ手順

本システムを自身のGitHubアカウントにアップロードし、Web公開するための手順です。

### 1. GitHubリポジトリの作成とプッシュ
1. GitHub上で新しいプライベートまたはパブリックのリポジトリを作成します。
2. ローカルプロジェクトをリポジトリにプッシュします。
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <あなたのリポジトリURL>
   git push -u origin main
   ```

### 2. カーリルAPIキーの登録 (匿名化)
クローラーが琉大の所蔵状況を調べるために、カーリルAPIキーを設定する必要があります。
1. 作成したGitHubリポジトリのページを開きます。
2. 上部メニューの **Settings** ＞ 左メニューの **Secrets and variables** ＞ **Actions** をクリックします。
3. **New repository secret** ボタンを押します。
4. 以下の通り入力し、**Add secret** をクリックして保存します。
   - **Name**: `CALIL_API_KEY`
   - **Secret**: `（あなたのカーリルAPIキー）`

### 3. GitHub Pages の有効化
1. リポジトリの **Settings** ＞ 左メニューの **Pages** をクリックします。
2. **Build and deployment** の **Source** が `Deploy from a branch` になっていることを確認します。
3. **Branch** で `gh-pages` と `/ (root)` を選択し、**Save** をクリックします。
   *(※初回プッシュ後、GitHub Actionsのビルド・デプロイが成功すると自動的に `gh-pages` ブランチが作成されます。作成されるまで数分待ってから設定してください)*
4. 設定が完了すると、ページ上部に公開用のURL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）が表示され、共有可能になります。

---

## 🔄 データの定期更新と手動更新

### 1. 定期自動更新 (スケジュール)
GitHub Actionsのスケジュール機能により、**毎週月曜日の午前9時 (日本時間)** に自動的に新刊情報の収集と琉大の所蔵状況の調査が走り、Webページが最新の状態に自動デプロイされます。

### 2. 手動での今すぐ更新 (オンデマンド)
新刊情報を今すぐ更新したい場合は、手動でクローラーを実行できます。
1. GitHubリポジトリの **Actions** タブをクリックします。
2. 左側のワークフロー一覧から **Update Book Data & Deploy** を選択します。
3. 画面右側にある **Run workflow** ボタンをクリックし、ブランチが `main` になっていることを確認して **Run workflow** (緑色のボタン) を実行します。
4. 数分でクローラーが走り、Webサイトが自動更新されます。

---

## 🛠️ ローカルでの開発・検証手順

ローカルPC上で動作確認を行う場合の手順です。

### 1. パッケージのインストール
```bash
npm install
```

### 2. ローカルでの所蔵状況・新刊情報の更新
環境変数 `CALIL_API_KEY` にキーを設定してクローラーを実行します。
```bash
# macOS / Linux の場合
CALIL_API_KEY=07378fa041f27f67203e208167279ddf node cron_crawler.js

# Windows (Command Prompt) の場合
set CALIL_API_KEY=07378fa041f27f67203e208167279ddf
node cron_crawler.js
```
成功すると `public/books_data.json` が生成または更新されます。

### 3. 開発サーバーの起動 (動作確認)
```bash
npm run dev
```
ターミナルに表示されるローカルURL（通常は `http://localhost:5173`）にアクセスし、動作やデザインを検証してください。

---

## 📂 技術構成
- **フロントエンド**: React (Vite)
- **デザイン**: CSS Variables, UI/UX Micro-animations, responsive layout
- **アイコン**: Lucide React
- **クローラー (バッチ)**: Node.js (NDLサーチ API, Open Library API, カーリルAPI)
- **ホスティング & 自動化**: GitHub Actions, GitHub Pages
