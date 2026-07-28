# Writingマッチングメディア記事制作ルール

必ず `rules/00-site-profile.md` と `config/site-profile.json` を前提に、対象メディア `https://writing-corp.co.jp/matting/` 専用の記事を作成する。旧サイト固有の買取・査定・車両関連文脈は混入させない。

## 入力と保存

- 必須入力: `main_keyword`, `related_keywords`, `article_type`, `persona`, `article_purpose`, `min_word_count`, `target_word_count`, `max_word_count`, `wordpress_draft`。
- 任意入力: `title`, `slug`, `category`, `tags`, `reference_urls`, `notes`, `internal_link_candidates`。
- `target_media` 未指定時は標準値を使い、異なる値は停止する。
- `category` と `tags` は `metadata.json` にも保存する。
- 安全な英数字slugを生成できない場合は明示slugを要求して停止する。

## 競合調査・見出し設計

1. メインキーワードを確定する。
2. 関連キーワードを整理する。
3. 上位ページを調査する。
4. 上位ページのH2・H3を抽出する。
5. PAAや関連質問を取得する。
6. 類似見出しをトピック単位に統合する。
7. 必須、推奨、独自、除外の4種類に分類する。
8. 検索意図に合う見出し構成を作成する。
9. 既存上位記事の単なる要約にならない独自情報を追加する。
10. リライト・執筆後に必須トピックの充足を検証する。

ラッコキーワードMCPが利用可能な場合は、上位10〜20ページの見出し、関連キーワード、PAA、サジェスト、共起語、同時ランクインキーワードを取得する。利用できない場合は理由を `research.md` と `heading-analysis.md` に記録する。

## 成果物

`research.md`, `serp.md`, `headings.csv`, `heading-analysis.md`, `heading-plan.md`, `draft.md`, `article.html`, `article-linked.html`, `article-decorated.html`, `external-links.md`, `check-report.md` を保存する。

`heading-analysis.md` には、共通論点、異なる論点、不足論点、採用トピック、不採用トピックと理由、独自追加情報、一次情報が必要な箇所、別記事へ分けるべきトピックを記載する。

## 本文生成

- WordPress投稿タイトルと本文を分離する。本文内H1は禁止。
- 記事タイトル相当のH2を本文先頭へ重複させない。
- 完成本文はGutenbergブロックマークアップにする。
- 「この記事でわかること」は1回だけ生成する。
- H2・H3には安定した重複しないIDを設定し、目次リンク先IDを実在させる。
- 架空の口コミ、体験談、統計、料金、ランキングを生成しない。
- 年齢、同意、個人情報、詐欺、犯罪、安全、健康、法律に関する注意を適切に扱う。

## 外部リンク・装飾・品質

外部リンクは実在確認し、`target="_blank"` の場合は `rel="noopener noreferrer"` を付ける。SWELL装飾は `article-linked.html` から冪等生成し、装飾済みHTMLを再入力にしない。品質チェックでは旧サイトURLや旧文言、target_media不一致、H1、Markdown残存、ブロック閉じ漏れ、見出しID重複、空見出し、類似段落、根拠のない数値、カテゴリー解決、draft固定を検証する。

## WordPress下書き

WordPress投稿は `post_to_wp: true` の記事だけ。投稿タイプは `wp/v2/types` で確認し、標準は `posts`。カテゴリー・タグは既存タームを名前またはslugで一意解決する。未登録時は `missing_terms_policy: fail` またはその互換値 `stop` なら停止し、`create_exact` の場合だけ完全一致名で作成する。投稿ステータスは常に `draft` で、`publish`・`future` の更新は禁止する。

`canonical_slug` は記事slugから変更しない。衝突時は `collision_policy` に従い、`fail` またはその互換値 `stop` は停止、`review_suffix` はレビュー用の `wordpress_slug` へ新規下書きを作成、`update_owned_draft` は `wordpress_draft_id` と `source_content_hash` のある所有下書きだけを更新する。実書き込みは `--confirm` が必須。保存後はRESTで別途再取得し、status、slug、タイトル、`content.raw` を比較してから結果を記録する。

`--preflight` は認証付きGETだけを使い、ターム解決、slug衝突、予定操作を確認する。`missing_terms_policy: create_exact` でもpreflight中は作成せず、作成予定として報告する。`--dry-run`、`--preflight`、`--confirm` は同時指定しない。

投稿後のREST再取得では、投稿ID、draft状態、公開日時、タイトル、WordPress slug、カテゴリー・タグID集合、本文の可視内容、H1不在、H2〜H6、FAQ、表、内部アンカーを検証する。`approved_outline.json` がある場合はcanonical見出しの文言、ID、親子関係、順序、件数を完全一致で検証する。属性順、Gutenbergコメント、無害なclass、空白・改行、自己終了タグ、等価なHTMLエンティティだけの差は許容する。失敗時は投稿ID、実status、不一致を記録し、自動公開、削除、再投稿、別slug投稿を行わない。
