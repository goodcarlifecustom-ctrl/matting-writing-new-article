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

WordPress投稿は `post_to_wp: true` の記事だけ。投稿タイプは `wp/v2/types` で確認し、標準は `posts`。カテゴリー・タグは既存タームを名前またはslugで一意解決し、解決不能なら停止する。投稿ステータスは常に `draft`。公開済み記事の更新、削除、別slug投稿は禁止。投稿前後で `content.raw` を比較し、構造変化は失敗扱いにする。
