# 02 見出し構成生成ルール

`main_keyword`、`related_keywords`、`search_intent`、`persona`、競合調査、一次情報、記事タイプを入力として `heading-plan.md` を作成する。

- `heading-plan.md` はHTMLタグのみ。使用可能タグは `<h2>`、`<h3>`、必要な場合のみ `<h4>`。
- `article.html` にはH1を入れないため、`heading-plan.md` にもH1を入れない。
- すべての記事へ同じ見出しを機械的に入れない。検索意図に応じて、基本情報、メリット、デメリット、選び方、比較、手順、費用、注意点、向いている人、向いていない人、FAQ、まとめから必要なものだけを使う。
- 競合見出しを一語一句コピーしない。
