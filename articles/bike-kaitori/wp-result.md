# WordPress下書き投稿結果

- status: 未投稿
- attempted_at: 2026-06-20T08:20:00Z
- command: npm run post -- --slug bike-kaitori
- result: FAIL
- reason: WordPress REST APIへのPOSTリクエストがタイムアウトしたため、下書き作成完了を確認できなかった。
- next_action: WordPress管理画面またはREST APIで同一スラッグ `bike-kaitori` の投稿有無を確認し、重複がない場合のみ再実行する。再実行時も投稿ステータスは必ず `draft` にする。
