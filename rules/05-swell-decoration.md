# 05 SWELL・Gutenberg装飾

新規記事では `decoration.json` を作成し、`npm run decorate -- --slug <slug>` で `article-linked.html`（なければ `article.html`）から `article-decorated.html` を生成する。

- H2に安定したIDを付与し、最初のH2直前に「この記事でわかること」をcapboxで追加する。
- H3が3個以上あるH2では、H2直下の導入文直後にH3アンカーリストをcapboxで追加する。
- 通常ulは `decoration.json` の `list_boxes` で指定されたものだけcapbox化する。仮タイトルは禁止。

## 本文マーカー適用工程（必須）

段落分割とリスト装飾が完了した後、`npm run decorate -- --slug <slug>` が本文構造から `decoration.json` の `markers` を自動生成・補完し、`article-decorated.html` にだけ適用する。必要に応じて `markers` を手動調整してもよいが、新規記事では手作業の追加を前提にしない。

- 各H2セクションの導入本文 `<p>` に原則1箇所、最大2箇所のマーカーを指定する。
- 各H3セクションの本文 `<p>` に原則1箇所、最大2箇所のマーカーを指定する。
- 導入文、まとめ、FAQも適用対象に含める。
- 表、リスト、見出し、リンクテキストには適用しない。本文の `<p>` 内だけに適用する。
- 強調範囲は原則として1文全体ではなく、重要な文節または短い一文にする。
- 同じ段落内へ複数のマーカーを連続して適用しない。
- メリット、推奨行動、重要な判断基準、読者が実行すべき内容は positive とし、次のHTMLで出力する。

```html
<span class="swl-marker mark_yellow">強調するテキスト</span>
```

- 注意点、デメリット、リスク、誤解防止、契約・費用・制度上の確認事項は negative とし、次のHTMLで出力する。

```html
<mark style="background-color:rgba(0, 0, 0, 0)" class="has-inline-color has-swl-deep-01-color">強調するテキスト</mark>
```

- 既存の negative 用 `<mark class="has-swl-deep-01-color">` を機械的に黄色マーカーへ置換しない。
- `markers` で指定または自動補完された本文内の一意な文字列に positive/negative マーカーを適用する。空マーカーは禁止。
- `decoration.json` がない場合でも、通常フローで `npm run decorate -- --slug <slug>` を実行すれば標準設定と `markers` を自動作成する。
- `article.html` と `article-linked.html` は装飾前ソースとして扱い、マーカーを書き込まない。マーカーは `article-decorated.html` のみに出力する。

## 自動検証

装飾後は `npm run check:decoration -- --slug <slug>` を実行し、PASSしない場合はWordPressへ投稿しない。検証では以下を必ず確認する。

- 本文を持つH2/H3セクションにマーカーがない。
- マーカーが空。
- 1セクションに3件以上ある。
- 見出し、リスト、表、リンクテキスト内に入っている。
- マーカーが入れ子になっている。
