# Writingマッチングメディア 新規SEO記事作成ワークフロー

新規SEO記事をGutenberg/SWELL向けのブロックマークアップで作成し、装飾済みHTMLを手動コピー用に出力するローカル完結型ワークフローです。既定の対象メディアは `https://matching.writing-corp.co.jp/` です。

サイト固有の設定は `config/site-profile.json`、編集方針は `rules/00-site-profile.md` に集約します。このリポジトリからWordPressへ接続・認証・書き込みを行わず、WordPress以外の記事配信先にも書き込みません。記事調査に必要な公開情報の読み取りと、このリポジトリへの通常のファイル保存・commit・Pull Requestは可能です。

## 必須入力項目

- `main_keyword`
- `related_keywords`
- `article_type`
- `persona`
- `article_purpose`
- `min_word_count`
- `target_word_count`
- `max_word_count`

## 任意入力項目

`title`、`slug`、`category`、`tags`、`target_media`、`reference_urls`、`notes`、`internal_link_candidates`。

`target_media` を省略または空欄にした場合は、既定値 `https://matching.writing-corp.co.jp/` を使用します。`なし` や `null` を明示した場合はメディア未設定として扱い、別URLを指定した場合も記事生成を停止しません。既定メディア以外では、確認できないサイト固有の内部リンクや装飾参照を省略して制作を続けます。

旧入力に `wordpress_draft` や `post_to_wp` が含まれていてもWordPress連携は行いません。これらは記事生成の必須条件ではなく、接続や書き込みを有効化するスイッチとしても扱いません。

## 入力例

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
category: "出会い系"
tags:
  - "安全対策"
```

## npmコマンド

```bash
npm run create -- --input jobs/sample-new-article.yml
npm run finish -- --slug matching-app-beginner-safety
npm run check -- --slug matching-app-beginner-safety
npm run check:draft -- --slug matching-app-beginner-safety
npm run check:publish -- --slug matching-app-beginner-safety
npm test
```

`check:draft` はローカル編集段階の検証です。情報再確認や軽微な文字数・装飾不足はWARNINGとして扱い、構造・安全性などの重大な問題だけをERRORにします。`check:publish` は人が公開前に確認するための厳格なローカル検証であり、WordPressへ接続または投稿するコマンドではありません。

標準の `render_profile: swell_plain_headings` ではH2〜H6をプレーンHTMLとして扱い、`wp:heading` コメントを要求しません。段落・リスト・表などのGutenberg/SWELL構造検証は継続します。`approved_outline.json` がある記事では、見出しのレベル・文言・ID・順序を完全一致で検証し、記事本文へ検証用の注意書きを自動挿入しません。

## 成果物と手動コピー

記事ごとの成果物は `articles/{slug}/` に保存します。調査・構成・本文の中間成果物を残し、最終成果物は次のファイルです。

```text
articles/{slug}/article-decorated.html
```

品質チェック完了後、このファイルの全文を利用者がWordPressのコードエディターへ手動でコピーします。コピー後の保存、下書き、公開、更新は利用者がWordPress側で行い、このリポジトリからは一切実行しません。

## 競合調査・見出し設計

`research.md`、`serp.md`、`headings.csv`、`heading-analysis.md`、`heading-plan.md` を保存します。上位ページの見出しは文字列コピーせず、必須・推奨・独自・除外トピックへ分類します。ラッコキーワードMCPが使えない場合は理由を記録し、公開情報で調査を続けます。
