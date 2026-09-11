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

`research.md`, `serp.md`, `headings.csv`, `heading-analysis.md`, `heading-plan.md`, `source-manifest.json`, `section-evidence.json`, `draft.md`, `article.html`, `article-linked.html`, `article-decorated.html`, `external-links.md`, `check-report.md` を保存する。最終成果物は手動コピー用の `article-decorated.html` とする。

`heading-analysis.md` には、共通論点、異なる論点、不足論点、採用トピック、不採用トピックと理由、独自追加情報、一次情報が必要な箇所、別記事へ分けるべきトピックを記載する。

## 本文生成

- 記事タイトルと本文を分離する。本文内H1は禁止。
- 記事タイトル相当のH2を本文先頭へ重複させない。
- 完成本文はGutenbergブロックマークアップにする。
- 「この記事でわかること」は1回だけ生成する。
- H2・H3には安定した重複しないIDを設定し、目次リンク先IDを実在させる。
- 架空の口コミ、体験談、統計、料金、ランキングを生成しない。
- 年齢、同意、個人情報、詐欺、犯罪、安全、健康、法律に関する注意を適切に扱う。

## 外部リンク・装飾・品質

外部引用とCTAは `rules/00-source-policy.md` に従う。`draft.md`、3種類の `article*.html`、`external-links.md` の外部URL、禁止媒体名、調査専用情報の漏えい、`source-manifest.json` との一致、CTA属性を検査し、違反を公開停止エラーにする。外部リンクは実在確認し、`target="_blank"` の場合は `rel="noopener noreferrer"` を付ける。SWELL装飾は `article-linked.html` から冪等生成し、装飾済みHTMLを再入力にしない。品質チェックでは旧サイト固有の文脈、H1、Markdown残存、ブロック閉じ漏れ、見出しID重複、空見出し、類似段落、根拠のない数値を検証する。`target_media` の未指定や不一致だけをエラーにしない。

成人向けテーマでは、完成した `article-decorated.html` の可視本文を対象に次の追加監査を行う。

- 18歳未満、未成年、高校生などへ登録・利用・出会いを勧める表現がないこと。
- 援助交際、売春・買春の募集、仲介、相手探し、実行、収益化を勧める表現がないこと。
- 規約や安全性の中立的な説明、禁止・回避・通報を促す注意喚起、およびFAQの質問は、対象語が含まれるだけで危険表現と判定しないこと。
- 年齢条件と年齢確認の定型警告を本文の必須要素にしないこと。記載する場合は、同じ文面やサービス名だけを差し替えた同型文が繰り返されていないこと。内容が異なる個別の事実記述は、同一警告の反復とは区別すること。

`check:draft` と `check:publish` を分離する。PARTIAL、ACCESS_BLOCKED、401・403・HTTP 000、確認日未取得、軽微な最低文字数不足、装飾・マーカー・章別ナビゲーション不足、プレーンHTML見出しと旧チェッカーの競合は下書き時WARNINGとし、本文へ注意書きとして転記しない。`approved_outline.json` がある場合はレベル・文言・ID・順序を変更しない。`render_profile: swell_plain_headings` ではプレーンHTML見出しを正式な出力とする。

## 口コミ根拠の事前検査

口コミ・評判・レビュー・体験談を事実として扱う記事は、構成確定後、本文生成前に `source-manifest.json` と見出しID単位の `section-evidence.json` を検査する。

```bash
npm run check:evidence -- --slug {slug} --stage pre-draft
```

各対象見出しに、正規App StoreまたはGoogle Playで直接確認した個別レビュー、もしくは方法論を確認できる一次調査が対応していなければ `REVIEW_EVIDENCE_MISSING` のERRORとする。JSON構造・見出し参照・派生関係の不正は `SECTION_EVIDENCE_INVALID`、出典台帳との不一致、再特定情報不足、種別不正は `REVIEW_EVIDENCE_INVALID` のERRORとする。件数・割合・多数派・傾向などの集計見出しは個別レビューでは合格にせず、方法論を確認できる一次調査を必須とする。公式仕様、競合まとめ、`research_only`資料、CTAによる代用は認めない。いずれかのERRORがあれば本文を生成せず、制作過程は内部資料だけに記録する。`check:publish`でも同じ根拠対応を再検査する。

## 公開本文と制作過程の分離

`draft.md`、`article.html`、`article-linked.html`、`article-decorated.html`、`external-links.md` の可視テキストをすべて検査する。次の内容が1件でもあれば `EDITORIAL_PROCESS_LEAK` のERRORとし、記事単位の設定で無効化できない。

- PARTIAL、ACCESS_BLOCKED、RESEARCH_FAIL、HTTPエラーなどの内部状態や取得失敗
- `research.md`、`source-manifest.json`、`check-report.md`、`approved_outline.json` などの内部成果物
- 出典・口コミ・レビューを確認、採用、不採用、掲載、使用しなかったという編集上の説明
- 架空の投稿者や体験談を作らないという制作方針
- 見出し固定、CTA指定、監査コード、生成・検証手順など読者に不要な制作指示

「対象サービスは年代別割合を公式に公表していません」「料金は決済方法で異なる場合があります」「年齢確認は相手の身元や安全性を保証する制度ではありません」など、対象側の事実や読者に必要な注意は許可する。曖昧な単語単独ではなく、制作側の主語と編集・検証行為の組み合わせで判定する。

保証・断定回避などの同型注意書きが公開成果物内で上限を超えて反復される場合は `EDITORIAL_DISCLAIMER_OVERUSE` のERRORとする。自動削除は行わず、重複する弁明を除いて読者が必要とする具体情報へ書き直す。

## 手動コピーによる受け渡し

WordPressへの接続、認証、投稿、更新、削除、画像アップロードは行わない。旧入力に `wordpress_draft` や `post_to_wp` が含まれていても無効として扱い、外部書き込みを有効化しない。品質チェック後の `articles/{slug}/article-decorated.html` を利用者がWordPressのコードエディターへ手動コピーする。最終報告には同ファイルの絶対パスとリポジトリ相対パスを記載する。

## ブロックと見出しの境界検査

`article.html`、`article-linked.html`、`article-decorated.html` のすべてを検査する。ブロック終了コメントの直後に空行なしでH2〜H6が続く場合（`--><h2`、`--><h3`、`--><h4`などを含む）、または `wp:paragraph` 内部にcap-blockなど別ブロックが入る場合は、`BLOCK_HEADING_BOUNDARY` のERRORとする。
