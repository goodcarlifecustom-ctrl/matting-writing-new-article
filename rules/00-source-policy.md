# 00-source-policy: 全記事共通の出典・外部リンク方針

このルールは記事ジャンルにかかわらず適用する。機械判定の設定は `config/source-policy.json`、記事ごとの公開用出典台帳は `articles/{slug}/source-manifest.json` を正本とする。

## 基本原則

- 公開記事の引用元は許可制とし、確認できない外部サイトを「参考になりそう」という理由だけで掲載しない。
- `reference_urls` は競合ページの見出し・論点を調べるための入力であり、引用許可リストではない。そこに含まれるURL、媒体名、数値、評価、調査結果を本文へ自動転用しない。
- 競合調査は `research.md`、`serp.md`、`headings.csv`、`heading-analysis.md`、`heading-plan.md` の内部資料に限る。競合ページの文章や見出しをコピーしない。
- `draft.md`、`article.html`、`article-linked.html`、`article-decorated.html`、`external-links.md` を公開記事領域として扱い、同じ出典制限を適用する。
- 外部サイトへリンクしない言い換えも引用制限の対象である。拒否した出典のリンクだけを削除し、その出典に由来する数値、順位、評価、口コミ傾向、結論を残してはいけない。

## 公開記事で許可する情報源

次の情報源に限定し、主張に適した原資料を直接確認する。

1. 国、自治体、独立行政法人、規制当局、裁判所などの公的機関
2. 記事で扱うサービス、製品、企業、店舗または団体が管理する公式サイト
3. 公式の利用規約、料金、ヘルプ、安全案内、会社情報、プレス発表
4. App StoreまたはGoogle Playの公式掲載ページ
5. 査読論文、学術機関が公開する一次研究、原著者が公開する一次データ
6. 標準化団体の公式規格・仕様
7. 公的レジストリ、法定開示、公式統計・データセット
8. 調査主体、対象、方法、期間、回答数を開示した自社または原調査主体の一次調査

企業公式の宣伝的な実績や調査は「公式発表によると」など、情報の立場がわかる形で記載し、第三者が検証した事実のように扱わない。App StoreとGoogle Playのレビューは個別の利用体験の例としてのみ扱い、一部レビューから利用者全体の満足度、成功率、属性または傾向を断定しない。

`.com`、`.jp`、`.co.jp`、`.org`、`.ac.jp`などのドメイン末尾だけで公式・一次情報と判定しない。公的機関として設定で許可された範囲を除き、民間・学術・標準化団体などの任意URLは、所有者と一次資料であることを確認して `config/source-policy.json` の `approved_external_domains` と `source-manifest.json` の両方へ登録する。

`approved_external_domains` は全記事共通の承認台帳である。ホスト、所有者、許可する出典種別、確認日、確認根拠を記録する。記事ごとの `source-manifest.json` だけで任意のドメインを公式・学術・一次資料と自己承認してはいけない。

承認は完全一致するホスト単位で行い、`include_subdomains` は必ず `false` とする。共有ホスティング配下や未確認のサブドメインまで一括承認してはいけない。必要なサブドメインは、所有関係を確認して個別に登録する。

```json
{
  "host": "service.example",
  "include_subdomains": false,
  "owner": "対象サービスの運営主体",
  "allowed_types": ["official_subject", "official_terms_help"],
  "verified_at": "YYYY-MM-DD",
  "verification_basis": "公式会社情報と利用規約で所有関係を確認"
}
```

## 公開記事で禁止する情報源

- 同じ検索意図で順位を競うSEOメディア、比較・ランキング・口コミまとめメディア
- アフィリエイトメディア、送客を主目的とする編集記事、内容を再編集した二次まとめ
- 出典不明のブログ、Q&A、掲示板、SNS投稿、AI生成要約、転載・スクレイピングページ
- 調査方法を確認できないアンケート、調査主体ではない媒体が再掲した統計
- 検索結果ページ、短縮URL、リダイレクト専用URL

既知の拒否対象として、出会いコンパス、App-Liv、Appliv、および `app-liv.jp` 配下を競合SEO・アフィリエイト媒体として扱う。`nofollow` を付けても公開記事の引用元にはできない。ほかのジャンルでも、同じ役割の競合媒体は同様に扱う。

## `source-manifest.json`

公開記事で使用する外部引用と公式案内は、使用前に記事ディレクトリの `source-manifest.json` へ登録する。候補URLを `citation_sources` に指定しただけでは承認済みにならない。

```json
{
  "version": 1,
  "sources": [
    {
      "id": "service-terms",
      "url": "https://service.example/terms/",
      "type": "official_terms_help",
      "role": "citation",
      "evidence_kind": "rules_terms",
      "official_for": "対象サービス",
      "name": "対象サービス利用規約",
      "claim_scope": ["利用条件", "禁止事項"],
      "verified_at": "YYYY-MM-DD"
    }
  ]
}
```

`type` は `public_authority`、`official_subject`、`official_terms_help`、`official_app_store`、`academic_primary`、`standards_body`、`public_registry_dataset`、`first_party_research_with_methodology` のいずれかとする。`role` は通常の出典なら `citation`、アフィリエイトCTAなら `affiliate_cta`、構成調査だけに使う資料なら `research_only` とする。URL、媒体名、確認日、公式対象、根拠にできる範囲を記録し、記事内の主張をその範囲から広げない。

調査人数・割合などの数値根拠には `evidence_kind: "survey_result"` を付け、`claim_scope` に調査・統計・回答数・割合など、実際に裏付けられる内容を具体的に記録する。数値出典に使える `type` は `public_authority`、`academic_primary`、`public_registry_dataset`、`first_party_research_with_methodology` に限る。方法開示済み一次調査では、`methodology` に `researcher`（調査主体）、`population`（対象）、`method`（方法）、`period`（期間）、`sample_size`（正の整数）も記録する。無関係な公式案内や相談窓口リンクを同じ段落へ置いても、調査数値の出典にはならない。

## アフィリエイトCTA

アフィリエイトリンクは読者を公式申込先へ案内するCTAであり、引用元ではない。掲載する場合は `source-manifest.json` の `sources` に `role: "affiliate_cta"` としてURL単位で登録し、リンクへ `data-link-purpose="affiliate-cta"` と `rel="sponsored noopener noreferrer"` を付ける。CTAリンクを料金、性能、評判、ランキング、統計その他の事実の根拠にしてはいけない。

## 調査資料と公開成果物の分離

- 競合SEO・アフィリエイト媒体は構成調査に限って参照できる。内部調査資料では `research_only` と「本文の根拠には不採用」を明記する。
- 競合媒体のURL、媒体名、リンク文言、引用、派生統計は公開記事領域へ残さない。
- 競合調査で発見した事実は、許可された原資料で独立に確認できた場合だけ、その原資料を根拠として新たに記述する。
- 適切な原資料を確認できない主張は、推測で補わず削除するか未確認事項として内部調査資料だけに記録する。

## URLと記録の検証

- 外部引用は原則HTTPSの直接URLを使用し、短縮URLや中間リダイレクタを使用しない。
- `<area>` も通常リンクと同じ条件で検査する。フォーム送信先、インラインイベントによる遷移、`ping`、外部スクリプト・iframe・object・embedなど、引用管理を迂回する通信・遷移・埋め込みは公開記事へ入れない。
- ホスト名は完全一致またはDNSラベル境界付きのサブドメイン一致で確認する。文字列を含むだけの偽装ドメインを許可しない。
- `target_media` や `reference_urls` に指定されたホストを自動的に信頼しない。
- 公開記事領域の外部URLは `source-manifest.json` と一致させ、任意ドメインはさらに `approved_external_domains` と照合する。登録のないURL、禁止媒体名、調査専用URLの漏えいを公開前エラーにする。
- 料金、会員数、割合、順位、利用条件、法令、安全性などの検証可能な主張は、対応する承認済み出典を追跡できる状態にする。
- 回答数・割合などを伴う調査・アンケート結果は、同じ段落またはリスト項目から承認済み出典へ直接たどれるようにする。媒体名とリンクを削除して数値だけを残した場合も公開停止エラーとする。
- 自動検査が確認できるのは、数値と承認済みURLが同じ段落・項目に存在することまでである。リンク先が実際にその数値と主張を裏付けるか、`claim_scope` の範囲内かは、公開前に原資料を開いて人が確認する。

品質チェックでは、設定不備、URL不正、未許可ドメイン、禁止媒体名、調査専用情報の漏えい、台帳不一致、CTAの引用利用をそれぞれ公開停止対象として扱う。
