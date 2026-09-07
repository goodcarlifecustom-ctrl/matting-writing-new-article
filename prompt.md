# Writingマッチングメディア 新規記事作成プロンプト

`rules/00-site-profile.md` と各工程ルールに従い、新規SEO記事を作成する。既定の対象メディアは `https://matching.writing-corp.co.jp/` とする。

`target_media` は任意入力とし、未指定・空欄・`なし`・`null`・既定と異なるURLを理由に記事生成を停止しない。WordPressへの接続、認証、投稿、更新その他の外部書き込みは行わず、最終成果物 `articles/{slug}/article-decorated.html` を手動コピー用として完成させる。
