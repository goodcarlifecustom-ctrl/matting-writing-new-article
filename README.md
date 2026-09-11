# Writingマッチングメディア 新規SEO記事作成ワークフロー

新規SEO記事をGutenberg/SWELL向けのブロックマークアップで作成し、装飾済みHTMLを手動コピー用に出力するローカル完結型ワークフローです。既定の対象メディアは `https://matching.writing-corp.co.jp/` です。

サイト固有の設定は `config/site-profile.json`、編集方針は `rules/00-site-profile.md`、全記事共通の出典制限は `rules/00-source-policy.md` と `config/source-policy.json` に集約します。このリポジトリからWordPressへ接続・認証・書き込みを行わず、WordPress以外の記事配信先にも書き込みません。記事調査に必要な公開情報の読み取りと、このリポジトリへの通常のファイル保存・commit・Pull Requestは可能です。

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

`title`、`slug`、`category`、`tags`、`target_media`、`reference_urls`、`citation_sources`、`notes`、`internal_link_candidates`。

`reference_urls` は競合ページの見出し・論点調査専用です。指定しても公開記事の引用許可にはなりません。`citation_sources` は公開記事で使用したい一次情報の候補であり、所有者、出典種別、ページ内容、確認日、根拠にできる範囲を確認して `source-manifest.json` に登録したものだけを使用します。

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
reference_urls: []
citation_sources: []
```

## npmコマンド

```bash
npm run create -- --input jobs/sample-new-article.yml
npm run finish -- --slug matching-app-beginner-safety
npm run check -- --slug matching-app-beginner-safety
npm run check:draft -- --slug matching-app-beginner-safety
npm run check:publish -- --slug matching-app-beginner-safety
npm run check:content
npm run check:sources
npm run check:evidence:all
npm run check:repository
npm run ci
npm test
```

`check:draft` はローカル編集段階の検証です。情報再確認や軽微な文字数・装飾不足はWARNINGとして扱い、構造・安全性などの重大な問題だけをERRORにします。`check:publish` は人が公開前に確認するための厳格なローカル検証であり、WordPressへ接続または投稿するコマンドではありません。

`check:content` は全記事の公開領域に制作過程の説明や反復免責がないか、`check:sources` は公開領域と `source-manifest.json`、`check:evidence:all` は口コミ根拠を、それぞれ読み取り専用で全件照合します。`check:repository` はこの3検査、`ci` はテストを含む全検査を順番に実行します。テスト用記事と全記事監査が競合しないよう、テストは直列実行します。Pull RequestではGitHub Actionsの `article-quality-gates` が `npm run ci` を自動実行します。

ワークフローを置くだけではGitHub上のマージ必須条件にはなりません。`main` のRulesetまたはBranch protectionで、ステータスチェック `article-quality-gates` を必須に設定してください。必須ワークフローがスキップされて待機状態にならないよう、記事以外の変更を含む全Pull Requestで実行します。

口コミ・評判・レビュー・体験談を扱う場合は、構成確定後、本文より先に `source-manifest.json` と見出しID単位の `section-evidence.json` を作成し、`npm run check:evidence -- --slug {slug} --stage pre-draft` に合格させます。個別レビューは正規App StoreまたはGoogle Playで直接確認できるもの、件数・割合・傾向などの集計表現は方法論を確認できる一次調査に限定します。公式仕様、競合まとめ、`research_only`資料、CTAで代用できません。

標準の `render_profile: swell_plain_headings` ではH2〜H6をプレーンHTMLとして扱い、`wp:heading` コメントを要求しません。段落・リスト・表などのGutenberg/SWELL構造検証は継続します。`approved_outline.json` がある記事では、見出しのレベル・文言・ID・順序を完全一致で検証し、記事本文へ検証用の注意書きを自動挿入しません。

## 成果物と手動コピー

記事ごとの成果物は `articles/{slug}/` に保存します。調査・構成・本文の中間成果物に加え、公開用出典台帳 `source-manifest.json`、内部用の見出し別根拠台帳 `section-evidence.json`、読者向け外部リンク一覧 `external-links.md` を残します。最終成果物は次のファイルです。

```text
articles/{slug}/article-decorated.html
```

品質チェック完了後、このファイルの全文を利用者がWordPressのコードエディターへ手動でコピーします。コピー後の保存、下書き、公開、更新は利用者がWordPress側で行い、このリポジトリからは一切実行しません。

調査不合格、公式確認不能、構成の再承認待ちなどで公開できない過去成果物は `archive/research-failed/{slug}/` へ移し、履歴を保ったまま公開対象から隔離します。アーカイブ内のHTMLは手動コピー対象ではありません。検査を回避するためのメタデータ例外は設けず、再開時は新しい `articles/{slug}/` で全工程をやり直します。

## 競合調査・見出し設計

`research.md`、`serp.md`、`headings.csv`、`heading-analysis.md`、`heading-plan.md` を保存します。上位ページの見出しは文字列コピーせず、必須・推奨・独自・除外トピックへ分類します。ラッコキーワードMCPが使えない場合は理由を記録し、公開情報で調査を続けます。

## 出典・外部リンク

公開記事の引用元は、公的機関、対象サービス公式、公式規約・ヘルプ、公式アプリストア、学術一次資料、標準化団体、公的レジストリ・統計、方法開示済み一次調査に限定します。公式アプリストアのレビューは個別体験の例としてのみ扱います。

口コミ根拠ゲートに合格できない場合は、`draft.md`以降を作成しません。取得失敗、出典の採否、根拠不足などの制作過程は内部資料だけに記録し、読者向け本文へ説明文として出力しません。

公的機関ドメインと公式アプリストア以外の外部URLは、全記事共通の `config/source-policy.json` にある `approved_external_domains` と、記事ごとの `source-manifest.json` の両方へ登録します。記事台帳だけで任意サイトを「公式」として許可することはできません。

競合SEO・アフィリエイト媒体は、`research.md`、`serp.md`、`headings.csv`、`heading-analysis.md`、`heading-plan.md` で構成調査に使用できますが、`draft.md`、3種類の `article*.html`、`external-links.md` にはURL、媒体名、引用、派生統計を残せません。出会いコンパス、App-Liv、Appliv、`app-liv.jp` 配下もこの禁止対象です。リンクだけを削除し、競合由来の数値や主張を残すことも禁止します。

アフィリエイトCTAは引用元と分離し、`source-manifest.json` の `sources` に `role: "affiliate_cta"` としてURL単位で登録したうえで、リンクに `data-link-purpose="affiliate-cta"` と `rel="sponsored noopener noreferrer"` を付けます。詳しい登録項目と検証範囲は `rules/00-source-policy.md` を確認してください。
