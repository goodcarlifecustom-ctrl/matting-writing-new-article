# 06 WordPress下書き投稿ルール

`post_to_wp: true` かつ `metadata.status: draft` の場合のみ、通常の新規記事完了処理では `npm run check -- --slug {slug}` のPASS後に `npm run check:decoration`、`npm run wp:doctor`、`npm run wp:draft -- --slug {slug} --confirm --adopt-existing` を自動実行する。`npm run finish -- --slug {slug}` も同じ完了処理を実行する。個別実行時も明示確認付きで `npm run wp:draft -- --slug {slug} --confirm` を実行する。公開、予約、private、pending への変更は禁止し、送信payloadの `status` はコード上で常に `draft` に固定する。

## 環境変数

認証情報はプロセス環境変数のみから読む。

- `WP_SITE_URL`
- `WP_USERNAME`
- `WP_APPLICATION_PASSWORD`

WordPress Application Passwordを使用し、通常のログインパスワードを保存・記録しない。`.env` はGit管理しない。Authorizationヘッダー、Application Password、nonce、認証情報をmetadata、wp-result、check-report、ログ、fixtureへ出力しない。

## 接続確認

書き込み前に必要に応じて `npm run wp:doctor` を実行し、次を確認する。

1. `WP_SITE_URL` と `/wp-json/` に接続できる
2. Application Passwordで `wp/v2/users/me?context=edit` を取得できる
3. `wp/v2/posts` エンドポイントへ認証付きでアクセスできる
4. 失敗時も秘密情報を出力しない

HTTPSサイトだけを原則許可し、localhost等の開発環境以外のHTTPサイトへ認証情報を送らない。認証付きリクエストのリダイレクト先originが `WP_SITE_URL` と異なる場合は停止する。

## 投稿前チェック

`wp:draft` は書き込み前に以下を実行し、失敗時はWordPress APIへ書き込みリクエストを送らない。

1. `npm run check -- --slug {slug}`
2. `npm run check:decoration -- --slug {slug}`

投稿元は必ず `articles/{slug}/article-decorated.html` とし、`article.html`、`article-linked.html`、`draft.md` へフォールバックしない。

## 重複防止

1. `metadata.wordpress_draft_id` がある場合はその投稿を取得し、statusがdraftなら同じIDを更新する。
2. IDがない場合は同一slugを検索する。
3. 同一slugの公開済み投稿があれば更新も新規作成もせず停止する。
4. 同一slugの下書きが見つかった場合は、通常の新規記事完了処理では `--adopt-existing` を付けて既存draftを更新する。個別実行では `--adopt-existing` が明示された場合のみ採用する。
5. 同一slugが複数件あれば停止する。

ネットワーク切断等でmetadata更新前にWordPress側へ作成済みとなった場合も、次回実行時にslug検索で検出して重複作成を避ける。

## 投稿仕様

- エンドポイント: `POST {WP_SITE_URL}/wp-json/wp/v2/posts` または `POST {WP_SITE_URL}/wp-json/wp/v2/posts/{id}`
- payload: `title`、`slug`、`content`、`status: draft`
- title: `metadata.title`
- slug: `metadata.slug`
- content: `articles/{slug}/article-decorated.html` からfront matterを除去したGutenbergブロックマークアップ全文

WordPress REST APIへ送信する `content` にfront matter、作業ログ、metadata、Markdown原稿、`rendered.html` 相当のレンダリング済みHTMLを混入させない。送信前にGutenbergブロックコメントの対応、H2 IDと目次リンク、重複ID、missing target、Markdown構文残存、H1混入、タイトル重複を検証する。

H1を本文へ追加しない。カテゴリー、タグ、アイキャッチ、投稿者、コメント状態は明示設定がない限り変更しない。`metadata.meta_description` は `wordpress.seo_meta_key` のような明示設定がない限り未知のカスタムフィールドやexcerptへ送らない。

## 投稿後検証と記録

投稿後は `context=edit` で再取得し、ID、status、slug、title.raw、content.raw、H2/H3順序、table件数、id属性、SWELLブロックコメント、class属性、marker/mark、外部リンクhrefを検証する。改行コード差以外の本文改変は `CONTENT_MISMATCH` として失敗扱いにする。

成功時は `metadata.json` をatomic renameで更新し、`wordpress_draft_id`、`wordpress_draft_url`、`wordpress_status: draft`、`wordpress_last_synced_at`、`wordpress_content_sha256` を保存する。`wp-result.md` には実行日時、created/updated/adopted、投稿ID、編集URL、status、title、slug、投稿元ファイル、SHA-256、本文検証、SEOメタディスクリプション結果、投稿前チェック結果、警告、エラーを記録する。

## dry-run

`npm run wp:draft -- --slug {slug} --dry-run` はmetadata、投稿元、投稿前チェック、title、slug、status、content SHA-256、作成/更新判定に必要な情報、必須環境変数名を表示する。WordPressへの作成・更新リクエスト、metadata更新、wp-result更新は行わない。
