# Writingマッチングメディア記事制作ルール

必ず `rules/00-site-profile.md`、`rules/00-source-policy.md`、`config/site-profile.json`、`config/source-policy.json` を前提に記事を作成する。既定の対象メディアは `https://matching.writing-corp.co.jp/` とし、旧サイト固有の買取・査定・車両関連文脈は混入させない。

## 入力と保存

- 必須入力: `main_keyword`, `related_keywords`, `article_type`, `persona`, `article_purpose`, `min_word_count`, `target_word_count`, `max_word_count`。
- 任意入力: `title`, `slug`, `category`, `tags`, `target_media`, `reference_urls`, `citation_sources`, `notes`, `internal_link_candidates`。
- `reference_urls` は競合見出し調査専用であり、公開記事の引用許可にはならない。`citation_sources` も候補入力であり、確認後に `source-manifest.json` へ登録した情報源だけを公開記事で使用する。
- `target_media` の未指定・空欄時は既定値を使う。`なし`・`null`・別URLが指定されても停止せず、確認できないサイト固有情報を省略して記事生成を続ける。
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

`research.md`, `serp.md`, `headings.csv`, `heading-analysis.md`, `heading-plan.md`, `source-manifest.json`, `draft.md`, `article.html`, `article-linked.html`, `article-decorated.html`, `external-links.md`, `check-report.md` を保存する。最終成果物は手動コピー用の `article-decorated.html` とする。

`heading-analysis.md` には、共通論点、異なる論点、不足論点、採用トピック、不採用トピックと理由、独自追加情報、一次情報が必要な箇所、別記事へ分けるべきトピックを記載する。

## 本文生成

- 記事タイトルと本文を分離する。本文内H1は禁止。
- 記事タイトル相当のH2を本文先頭へ重複させない。
- 完成本文はGutenbergブロックマークアップにする。
- 「この記事でわかること」は1回だけ生成する。
- H2・H3には安定した重複しないIDを設定し、目次リンク先IDを実在させる。
- 架空の口コミ、体験談、統計、料金、ランキングを生成しない。
- 年齢、同意、個人情報、詐欺、犯罪、安全、健康、法律に関する注意を適切に扱う。
- 成人向けテーマでも、年齢条件・年齢確認の定型警告を本文の必須要素にしない。規約や比較上必要な場合だけ読者が確認しやすい一箇所で説明し、「18歳以上」「年齢確認が必要」など同じ文面を導入・各サービス紹介・まとめへ機械的に繰り返さない。
- 18歳未満・高校生へ利用を勧める表現や、援助交際、売春・買春の募集・仲介・実行を後押しする表現を生成しない。規約、安全性、違法性の中立的な説明、注意喚起、FAQで禁止事項を説明することは妨げない。

## 外部リンク・装飾・品質

外部引用とCTAは `rules/00-source-policy.md` に従う。公開用の外部引用は `source-manifest.json` に登録した許可情報源だけを使用し、競合SEO・アフィリエイト媒体の情報は構成調査から本文へ転用しない。外部リンクは実在確認し、`target="_blank"` の場合は `rel="noopener noreferrer"` を付ける。SWELL装飾は `article-linked.html` から冪等生成し、装飾済みHTMLを再入力にしない。品質チェックでは旧サイト固有の文脈、H1、Markdown残存、ブロック閉じ漏れ、見出しID重複、空見出し、類似段落、根拠のない数値を検証する。`target_media` の未指定や不一致だけをエラーにしない。

## 手動コピーによる受け渡し

WordPressへの接続、認証、投稿、更新、削除、画像アップロードは行わない。旧入力に `wordpress_draft` や `post_to_wp` が含まれていても無効として扱い、外部書き込みを有効化しない。品質チェック後の `articles/{slug}/article-decorated.html` を利用者がWordPressのコードエディターへ手動コピーする。

## ブロックと見出しの境界

`article.html` のSWELL・Gutenbergブロック終了コメントと後続のH2〜H6の間には、必ず空行を1行入れる。`--><h2`、`--><h3`などの直接連結を禁止する。見出しの文言・ID・レベル・順序とcapbox内部の構造は変更しない。`render_profile: swell_plain_headings` の見出しに `wp:heading` コメントを追加せず、別profileで既存の `wp:heading` が必要な場合は維持する。
