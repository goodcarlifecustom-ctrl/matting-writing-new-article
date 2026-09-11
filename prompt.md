# Writingマッチングメディア 新規記事作成プロンプト

`rules/00-site-profile.md`、`rules/00-source-policy.md`、`config/source-policy.json` と各工程ルールに従い、新規SEO記事を作成する。既定の対象メディアは `https://matching.writing-corp.co.jp/` とする。

`target_media` は任意入力とし、未指定・空欄・`なし`・`null`・既定と異なるURLを理由に記事生成を停止しない。WordPressへの接続、認証、投稿、更新その他の外部書き込みは行わず、最終成果物 `articles/{slug}/article-decorated.html` を手動コピー用として完成させる。

`reference_urls` は競合見出し調査だけに使用し、公開記事の引用許可として扱わない。公開記事の引用は許可された一次情報に限定し、確認内容を `articles/{slug}/source-manifest.json` に記録する。競合SEO・アフィリエイト媒体のURL、媒体名、引用、派生統計を `draft.md`、`article.html`、`article-linked.html`、`article-decorated.html`、`external-links.md` に残さない。拒否した出典のリンクだけを消し、その出典に由来する数値や主張を残すことも禁止する。

口コミ・評判・レビュー・体験談を扱う場合は、構成確定後に `source-manifest.json`、見出しID単位の `section-evidence.json` の順で根拠を確定し、`npm run check:evidence -- --slug {slug} --stage pre-draft` に合格してから本文を生成する。個別例は正規App StoreまたはGoogle Playで直接確認できるレビュー、件数・割合・傾向などの集計表現は方法論付き一次調査だけを使用する。公式仕様、競合まとめ、`research_only`資料、CTAで代用しない。

公開成果物には対象テーマの情報だけを書く。出典の採否、レビュー不足、アクセス失敗、調査・執筆・生成・検証の手順、内部成果物、固定見出し、CTA指定、監査コードなどの制作過程を説明しない。根拠が足りなければ説明文で穴埋めせず、内部レポートへ記録して本文生成前に停止する。
