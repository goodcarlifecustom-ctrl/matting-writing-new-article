# 03 記事生成

`input.yml`、`metadata.json`、`research.md`、`heading-plan.md` をもとに作成する。新規記事の完成本文はMarkdownではなく、WordPressコードエディターへ貼り付けたときにブロックとして認識されるGutenbergブロックマークアップを `article.html` へ出力する。`draft.md` は作業用メモとして残してよいが、完成本文・WordPress送信用本文として扱わない。

## 必須入力

新規記事生成を開始する前に、`target_media`、`article_type`、`main_keyword`、`related_keywords`、`persona`、`article_purpose`、`min_word_count`、`target_word_count`、`max_word_count`（互換名。日本語の可視本文文字数として扱い、metadataでは `min_char_count`、`target_char_count`、`max_char_count` も保存）、`wordpress_draft`、`post_to_wp` が確定していることを確認する。文字数は必ず `min_word_count <= target_word_count <= max_word_count` とし、未入力・数字以外・大小関係不正の場合は生成を開始しない。デフォルトは `wordpress_draft: true`、`post_to_wp: true`、`status: draft` を自動設定する。

## 本文構成

- ですます調、初心者にも理解できる15歳程度でも読める日本語で書く。
- 結論、理由、具体例、注意点の順を基本にする。
- 記事冒頭に「結論：」「要点：」「ポイント：」などのラベルを直接置かない。
- 結論先出しは、ラベル化せず自然な導入文として文章内に組み込む。
- H2直下には、章の読みどころや前提が伝わる導入文を置く。
- 1文は原則40〜100文字を目安にし、主語と述語を近づけ、同じ語尾を3回以上連続させない。
- 段落ごとに `<p>` タグを使い、専門用語は最初に説明する。
- 同じ内容を繰り返さず、キーワードを不自然に詰め込まない。
- H3直下を1段落だけで終えない。
- 各H3は原則として2〜4段落で構成する。
- 各H3には「端的な回答」「理由や条件」「具体例または行動」を含める。
- 「場合があります」「確認しましょう」だけで回答を終わらせず、最後に判断基準・具体例・次の行動を明示する。
- 複数のH3で文章量や文型を均一にしすぎず、検索意図に応じて説明量に差をつける。
- 100文字未満で完結する内容は、独立したH3にせずリストやFAQブロックへまとめる。
- 根拠が必要な情報は `research.md` の一次情報・信頼できる情報源に基づいて書く。
- バイク買取MAXへの送客は自然に行い、査定額や検索順位を保証しない。
- 架空の体験談、口コミ、料金、価格、順位を書かない。
- メリットだけでなく注意点も説明する。
- 導入文とまとめは原則300〜400文字を目安にする。
- 記事全体の長さは検索意図に応じて自動決定し、目標文字数だけを満たす水増しは禁止。
- `article.html` にH1を入れず、記事タイトルを本文へ重複して入れない。
- PASONAは全記事へ強制せず、評判記事、サービス記事、CTAで有効な場合のみ使う。

## HTML

完成本文はWordPress標準ブロックを使ったGutenbergブロックマークアップにする。通常の段落、見出し、リスト、表、画像を安易に `wp:html` へ入れず、記事全体を1つの `wp:html` ブロックにしない。

- 段落: `<!-- wp:paragraph -->` と `<!-- /wp:paragraph -->` で `<p>本文</p>` を囲む。
- H2: `<!-- wp:heading {"level":2,"anchor":"sec-01"} -->` と `<!-- /wp:heading -->` で `<h2 class="wp-block-heading" id="sec-01">見出し</h2>` を囲む。
- H3: `<!-- wp:heading {"level":3} -->` と `<!-- /wp:heading -->` で `<h3 class="wp-block-heading">見出し</h3>` を囲む。
- リスト: `<!-- wp:list -->` の中に `<ul class="wp-block-list">` と `<!-- wp:list-item -->` で囲んだ `<li>` を置く。
- 表: `<!-- wp:table -->` の中に `<figure class="wp-block-table"><table><tbody>...</tbody></table></figure>` を置く。
- 画像: `<!-- wp:image {"sizeSlug":"large","linkDestination":"none"} -->` の中に `<figure class="wp-block-image size-large"><img src="実在URL" alt="代替テキスト"/></figure>` を置き、架空のWordPressメディアIDを付けない。

導入文の後、最初のH2より前に「この記事でわかること」を置き、主要な全H2へのアンカーリンクを設定する。H2のidは `sec-01`、`sec-02` のように安定付与し、リンクの `href` とH2の `id`、リンクテキストとH2文言を一致させる。比較表または要点表、選び方、詳細解説、注意点、FAQ、まとめを検索意図に合わせて自然に含める。
