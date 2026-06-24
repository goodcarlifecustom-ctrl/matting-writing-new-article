# バイク買取MAX 新規記事作成プロンプト

## 最小入力テンプレート

```yaml
main_keyword:
【メインキーワード】

related_keywords:
【関連キーワードをカンマ区切り、またはYAML配列で入力】

wordpress_draft:
true
```

## 標準ワークフロー

Codexは3項目を受け取ったら、同じタスク内で以下を順番に実行する。

1. AGENTS.mdとrulesを読む
2. 入力を正規化する
3. slugを決める
4. `npm run create` を実行
5. キーワード分析
6. `npm run extract` を実行
7. `research.md` を作成
8. 見出し構成を作成
9. 本文を作成
10. 外部リンクを追加
11. SWELL向け装飾を作成
12. `metadata.json` を作成
13. `npm test` を実行
14. `npm run check -- --slug {slug}` を実行し、PASS後に装飾チェック、WordPress接続確認、draft作成/既存draft更新、投稿後検証まで自動完了させる
15. 必要に応じて `npm run finish -- --slug {slug}` で同じ完了処理を再実行する
16. `metadata.json` と `wp-result.md` の更新を確認
17. 最終報告

各工程を別タスクへ分けない。記事作成とWordPress投稿は同じCodexタスク内で完了させる。

## 入力仕様

必須:

- `main_keyword`: 必須文字列。既存互換で `keyword` も可。
- `related_keywords`: 必須。YAML配列またはカンマ区切り文字列。
- `wordpress_draft`: 任意boolean。省略時 `true`。内部で `post_to_wp` へ正規化する。

任意上書き:

- `title`
- `slug`
- `target_word_count`
- `category`
- `target_media`
- `reference_urls`
- `notes`
- `post_to_wp`（後方互換。`wordpress_draft` が優先）

未入力項目はキーワード分析、競合調査、一次情報確認に基づいてCodexが自動生成する。

## 絶対条件

- WordPress投稿ステータスは常に `draft`。
- `wordpress_draft:false` または `post_to_wp:false` が明示された場合はWordPressへ接続しない。
- `.env` を作成せず、認証情報の実値を表示・保存しない。
- 競合調査に失敗した場合、架空の上位サイトや見出しを作らない。
- `article.html`、`heading-plan.md`、`article-decorated.html` にH1を入れない。
