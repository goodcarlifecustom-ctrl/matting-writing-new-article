# Writingマッチングメディア 新規SEO記事作成ワークフロー

`https://writing-corp.co.jp/matting/` 専用の新規SEO記事をGutenbergブロックマークアップで作成し、条件を満たす場合のみWordPress下書きへ連携するワークフローです。

対象メディア標準値: `https://writing-corp.co.jp/matting/`
サイト固有のコード設定は `config/site-profile.json`、編集方針は `rules/00-site-profile.md` に集約します。

## 必須入力項目

- `main_keyword`
- `related_keywords`
- `article_type`
- `persona`
- `article_purpose`
- `min_word_count`
- `target_word_count`
- `max_word_count`
- `wordpress_draft`

`target_media` は未指定時に標準値を自動設定します。指定された値が `https://writing-corp.co.jp/matting/` と異なる場合、誤投稿防止のため記事ディレクトリ作成前に停止します。

## 任意項目

`title`、`slug`、`category`、`tags`、`reference_urls`、`notes`、`internal_link_candidates`。
`category` と `tags` は `input.yml` と `metadata.json` に保存し、WordPress下書き時は既存タームへ一意に解決できた場合だけpayloadへ入れます。標準ではタグやカテゴリーを自動作成しません。

## サンプル

```yaml
main_keyword: "マッチングアプリ 初心者 安全"
related_keywords:
  - "マッチングアプリ 始め方"
  - "出会い系 安全対策"
article_type: "ハウツー"
persona: "初めて出会い系サービスを使う成人読者"
article_purpose: "安全に始めるための確認事項と注意点を理解してもらう"
min_word_count: 3000
target_word_count: 4000
max_word_count: 5000
wordpress_draft: false
category: "出会い系"
tags:
  - "安全対策"
```

## npmコマンド

```bash
npm run create -- --input jobs/sample-new-article.yml
npm test
npm run check -- --slug matching-app-beginner-safety
npm run check:draft -- --slug matching-app-beginner-safety
npm run check:publish -- --slug matching-app-beginner-safety
npm run wp:doctor
npm run wp:draft -- --slug matching-app-beginner-safety --dry-run
```

`check:draft` は下書き作成を危険にする構造・安全性・投稿設定だけをERRORにし、情報再確認や軽微な文字数・装飾不足はWARNINGとして `DRAFT_READY` を維持します。`check:publish` は同じWARNINGを公開前ブロッカーとして扱います。結果は `metadata.json` の `content_status`、`source_verification_status`、`decoration_status`、`draft_readiness`、`publish_readiness`、`wordpress_status` に分離して保存します。

標準の `render_profile: swell_plain_headings` ではH2〜H6をプレーンHTMLとして扱い、`wp:heading` コメントを要求しません。段落・リスト・表などのGutenberg/SWELL構造検証は継続します。`approved_outline.json` がある記事では、見出しのレベル・文言・ID・順序を完全一致で検証し、記事本文へ検証用の注意書きを自動挿入しません。

## WordPress環境変数

`.env` は作成しません。Codex Cloud等のプロセス環境変数を使います。`WP_SITE_URL` と `WP_REST_ROOT` は両方設定可能ですが、矛盾する場合は認証情報を送信する前に停止します。推奨は `WP_SITE_URL=https://writing-corp.co.jp/matting` です。

```text
WP_SITE_URL=https://writing-corp.co.jp/matting
WP_REST_ROOT=https://writing-corp.co.jp/matting/wp-json/
WP_USERNAME=
WP_APPLICATION_PASSWORD=
```

## WordPress投稿の安全条件

投稿ステータスは常に `draft` です。公開済み記事は更新せず、同じslugの公開記事がある場合は停止します。同じslugの下書きが1件だけある場合のみ、明示オプション付きで安全に再利用できます。カテゴリー・タグは既存タームを一意に解決できない場合、推測で未分類へ投稿せず停止します。

## 競合調査・見出し設計

`research.md`、`serp.md`、`headings.csv`、`heading-analysis.md`、`heading-plan.md` を保存します。上位ページの見出しは文字列コピーせず、必須・推奨・独自・除外トピックへ分類します。ラッコキーワードMCPが使えない場合は理由を記録し、公開情報で調査を続けます。
