# PCMAX「評判」記事制作プロンプト

このリポジトリの最新 `main` を基準に、Writingマッチングメディアへ手動入稿するPCMAXの評判記事を1件制作してください。WordPressやその他の記事配信先へ接続・認証・書き込みを行わず、最終成果物を `articles/pcmax-reputation/article-decorated.html` に保存してください。

## 最優先条件

- `AGENTS.md`、`rules/00-source-policy.md`、`rules/03-article-generation.md`、`rules/99-quality-check.md` と中央設定を適用する。
- 公開用の5成果物には、読者がPCMAXを判断するために必要な情報だけを書く。調査・執筆・検証・生成の事情、出典の採否、アクセス失敗、内部ファイル、固定見出し、CTA指定、監査コードなどの制作過程を説明しない。
- 「今回はレビューを採用していません」「架空の体験談は掲載しません」「確認済み資料の範囲で解説します」などで、根拠のない口コミ見出しを埋めない。
- 口コミ・評判の各見出しは、許可された実在レビューの根拠を生成前に確保する。1見出しでも根拠がなければ `REVIEW_EVIDENCE_MISSING` として内部レポートへ記録し、`draft.md` 以降の公開成果物を生成せず停止する。
- 出会いコンパス、App-Liv、Appliv、`app-liv.jp`、競合SEO・アフィリエイト媒体、転載アンケートを公開記事の引用や口コミ根拠に使わない。リンクを消して派生統計や傾向だけを残すことも禁止する。
- 公式仕様を口コミの代用品にしない。公式仕様は料金・機能・規約等の説明に、レビューは利用者の個別体験の紹介にだけ使う。
- 見出しのレベル、文言、ID、順序、親子関係は `prompts/approved-outlines/pcmax-reputation.json` と完全一致させ、H1とH4以下を本文へ追加しない。
- 読者向け本文では、結論と具体情報を先に書く。注意書きや「保証しない」旨を各章へ反復せず、必要な注意は該当箇所へ簡潔に1回だけ置く。

## 作業開始条件

1. 作業ツリーがクリーンであることを確認する。無関係な差分があれば変更せず停止する。
2. `jobs/pcmax-reputation.yml` または `articles/pcmax-reputation/` が存在する場合は上書きせず、存在するパスを報告して停止する。
3. `scripts/adult-safety-audit.mjs`、`scripts/check-article.mjs`、`scripts/check-all-sources.mjs`、`scripts/check-all-content.mjs`、`scripts/check-review-evidence.mjs` が存在することを確認する。不足時は記事を作らず停止する。
4. `npm ci` と `npm test` を実行し、失敗時は記事を作らず停止する。

## 記事入力

次の内容を `jobs/pcmax-reputation.yml` に保存する。

```yaml
title: "PCMAXの評判は悪い？口コミからわかる業者の実態や安全に出会うコツ"
slug: "pcmax-reputation"
meta_description: "PCMAXの良い評判と悪い評判を調査し、料金への評価、サクラや業者の実態、安全に出会うコツを解説します。口コミと公式情報を分けて紹介し、登録前の疑問にも回答します。"
main_keyword: "PCMAX 評判"
related_keywords:
  - "PCMAX 口コミ"
  - "PCMAX 評判 悪い"
  - "PCMAX サクラ"
  - "PCMAX 業者"
  - "PCMAX 安全"
  - "PCMAX 料金"
  - "PCMAX 出会える"
article_type: "口コミ・評判・サービス解説"
persona: "PCMAXの利用を検討し、口コミ、業者の実態、料金、安全性、使い方を確認して判断したい18歳以上の成人"
article_purpose: "PCMAXの良い評判と悪い評判を実在する公開口コミと最新の公式情報に基づいて整理し、安全に利用するための判断材料を提供する"
min_word_count: 16000
target_word_count: 18000
max_word_count: 20000
render_profile: "swell_plain_headings"
category: "出会い系"
tags:
  - "PCMAX"
  - "口コミ・評判"
  - "安全性"
target_media: "https://matching.writing-corp.co.jp/"
reference_urls: []
citation_sources:
  - "https://pcmax.jp/"
  - "https://pcmax.jp/pcm/bill.php"
  - "https://pcmax.jp/pcm/contents.php"
  - "https://pcmax.jp/pcm/file.php?f=safety"
  - "https://pcmax.jp/pcm/file.php?f=idcheck"
  - "https://pcmax.jp/pcm/file.php?f=company"
  - "https://www.npa.go.jp/policy_area/no_cp/deai/regulatory.html"
internal_link_candidates: []
notes: "承認済み見出し固定。口コミ根拠を生成前に検証し、公開本文へ制作過程を書かない。CTAは追加しない。"
```

入力後に `npm run create -- --input jobs/pcmax-reputation.yml` を実行し、`prompts/approved-outlines/pcmax-reputation.json` と同一内容を `articles/pcmax-reputation/approved_outline.json` に保存する。

## 生成前の口コミ根拠ゲート

本文を書き始める前に、次の9見出しすべてについて実在レビューの根拠を用意し、`articles/pcmax-reputation/section-evidence.json` に見出しIDごとに記録する。

- `pcmax-good-review-met`
- `pcmax-good-review-many-users`
- `pcmax-good-review-boards`
- `pcmax-good-review-casual`
- `pcmax-bad-review-cost`
- `pcmax-bad-review-vendors`
- `pcmax-bad-review-photos`
- `pcmax-bad-review-free-points`
- `pcmax-bad-review-casual-users`

口コミ根拠として使えるのは、App StoreまたはGoogle PlayのPCMAX公式掲載ページで確認できる個別レビュー、または調査主体が直接公開し、対象・方法・期間・回答数を確認できる一次調査だけとする。個別レビューは `source-manifest.json` に `type: "official_app_store"`、`role: "citation"`、`evidence_kind: "individual_review_example"` として登録し、内部の `section-evidence.json` へプラットフォーム、投稿日、評価、識別情報、短い要約、出典IDを記録する。一次調査は `rules/00-source-policy.md` の方法論要件を満たすこと。

次の4見出しは「多い・少ない」という集計主張を含むため、個別レビューでは合格にしない。対象・方法・期間・回答数を原資料で確認できる `survey_result` がなければ、承認済み見出しを説明文で埋めず停止する。

- `pcmax-good-review-many-users`
- `pcmax-bad-review-vendors`
- `pcmax-bad-review-free-points`
- `pcmax-bad-review-casual-users`

`section-evidence.json` は `version`、`article_slug`、`sections`、`evidence_items` を持たせる。各 `sections[]` に `heading_id`、判定済みの `classification`、`evidence_item_ids` または `derived_from_section_ids` を記録し、各 `evidence_items[]` に一意の `id`、`kind`、`source_id`、`subject`、`supported_claim` と、個別レビューなら `review`、一次調査なら `survey` を記録する。

同じレビューを複数見出しへ機械的に流用しない。見出し文言を裏付けないレビュー、投稿者・投稿日・評価等を確認できない転載、検索スニペット、競合記事の要約は不採用とする。

`npm run check:evidence -- --slug pcmax-reputation --stage pre-draft` を実行し、`PASS`になるまで `draft.md`、`article.html`、`article-linked.html`、`article-decorated.html` へ本文を書かない。実行環境から公式レビューを取得できず、ユーザー提供の出典付きレビュー資料もない場合は、不足する見出しIDを `check-report.md` に記録して停止する。停止理由や不足説明を公開成果物へ転記しない。

## 調査・執筆

- 調査日は実行日とし、料金・機能・規約・会社情報はPCMAX公式の該当ページを直接確認する。確認できない変動情報は内部資料だけに未確認として記録し、推測しない。
- 公式サイトの数値は「公式サイトによる公表値」と帰属させる。個人の利用結果へ一般化しない。
- 良い・悪い評判は、根拠を通過した個別レビューまたは一次調査の内容だけを自分の言葉で簡潔に要約する。架空の投稿者、属性、引用、体験、統計を作らない。
- 「実際に出会えた」「すぐに会えた」は個別体験として紹介し、同じ結果を断定しない。
- 「サクラはいない」は証明済みの事実として断定しない。サクラと第三者業者の概念差、公式の監視・通報機能、利用者が取れる対策を区別して説明する。
- 業者、美人局、援デリは犯罪・詐欺・規約違反の予防に必要な範囲だけを扱い、募集・仲介・実行・収益化の手順を書かない。単一の兆候だけで相手を断定しない。
- 年齢条件と年齢確認を組み合わせた定型説明は必要な場合でも記事全体で1段落以内に集約する。未成年や高校生へ利用を勧めない。
- 料金は利用経路、性別、決済方法等の条件差を混同しない。変動し得る情報へ実行日の確認日を添える。
- FAQは冒頭で質問へ直接回答し、その後に根拠と注意点を説明する。
- `article.html`、`article-linked.html`、`article-decorated.html` のブロックと見出しの境界は共通処理へ任せ、手作業でGutenbergコメントを削除しない。
- 可視本文は16,000〜20,000文字、目標18,000文字とする。文字数を満たすための注意書き、調査説明、同義反復を追加しない。

## 公開本文に出してはいけない情報

次の情報は `research.md`、`source-manifest.json`、`section-evidence.json`、`check-report.md` だけに記録する。

- 出典を採用・不採用にした理由
- レビューを取得・確認できたかどうか
- 架空情報を作らないという制作方針
- アクセス制限、HTTP状態、検索ツール、実行環境
- 見出し固定、承認済み構成、文字数、CTA指定、ファイル名
- 監査コード、テスト結果、生成・検証・再実行の説明

サービス自身が公表していない事実を読者へ伝える必要がある場合は、「PCMAXは年代別の利用者割合を公式に公表していません」のように、サービス側の公開状況を直接述べてよい。「本記事では確認できませんでした」のように制作側を主語にしない。

## 完了・検証

必要な中間成果物を完成させた後、次を順に実行する。

```bash
npm run check:evidence -- --slug pcmax-reputation --stage pre-draft
npm run finish -- --slug pcmax-reputation
npm run check:publish -- --slug pcmax-reputation
npm run check:sources
npm run check:content
git diff --check
```

合格条件は以下とする。

- 生成前口コミ根拠ゲートが `PASS`。
- `npm test`、`finish`、`check:publish`、`check:sources`、`check:content` が終了コード0。
- `check-report.md` が `PASS`でERROR・WARNINGが0件。
- 5つの公開成果物で `EDITORIAL_PROCESS_LEAK` と `EDITORIAL_DISCLAIMER_OVERUSE` が0件。
- H2が6件、H3が40件、H4以下が0件で、承認済み見出しの文言・ID・順序・親子関係が完全一致。
- 成人向け安全監査4コードが各0件。
- `metadata.json` が `copy_ready: true`、`publish_readiness: "PUBLISH_READY"`、`delivery_mode: "manual_copy"`、`external_write_performed: false`。
- WordPressおよび記事配信先への外部書き込みがない。

合格時だけ今回の記事ファイルをコミットし、GitHubへPush可能なら新規ブランチとPull Requestを作成する。Pull Requestはマージしない。失敗時は内部レポートに原因と不足する見出しIDを記録し、記事を合格扱いにしない。

最終報告には合否、根拠ゲート、各チェック、生成ファイル、可視文字数、見出し一致、安全監査件数、メタデータ、手動コピー対象パス、Git状態を簡潔に記載する。記事HTML全文、Base64、内部の長い調査メモは貼らない。
