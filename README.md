# Futures Journal

個人使用的期貨交易紀錄與分析網頁。`futures-journal` 是前端、Cloudflare Worker、測試與治理文件的唯一主儲存庫。

## 專案結構

```text
.
├── AGENTS.md                     # 跨對話治理規則
├── index.html                    # 現行 GitHub Pages 前端
├── worker/
│   ├── index.js                  # AI 與 IG API Worker
│   ├── wrangler.jsonc            # Worker 建置設定
│   └── .dev.vars.example         # 本機環境變數名稱範例
├── tests/
│   ├── backup-restore.test.cjs   # JSON 備份與還原測試
│   └── worker.test.mjs           # Worker 路由契約測試
├── package.json
└── .gitignore
```

Worker 程式由 `s4112930/futures-ai-worker` 的 `main`（來源 commit `2095523`）遷入。舊 repo 與現有 Worker 部署暫時保留，供回滾與行為比對；本次整合不改變 GitHub Pages、Worker 流量或 repo 可見性。

## 本機驗證

需求：Node.js 20 以上。

```bash
npm install
npm test
npm run check
npm run build:worker
npm run smoke:live
```

`build:worker` 僅產生 Wrangler dry-run 建置結果，不會部署。
`smoke:live` 只確認現有 GitHub Pages 與舊 Worker 可連線，不會登入 IG、呼叫 AI 或修改資料。

## Worker 環境綁定

| 名稱 | 類型 | 用途 |
|---|---|---|
| `AI` | Workers AI binding | 單筆交易客觀分析 |
| `IG_API_KEY` | Secret | IG API key |
| `IG_IDENTIFIER` | Secret | IG 登入識別 |
| `IG_PASSWORD` | Secret | IG 登入密碼 |

本機開發時複製 `worker/.dev.vars.example` 為 `worker/.dev.vars`，只在本機填值。正式環境使用 Cloudflare secret／binding 管理，不得把真實值寫入 Git、Issue、PR、日誌或前端。

## 部署與回滾界線

- 現行前端仍由根目錄 `index.html` 提供，正式網址及 GitHub Pages 設定不變。
- 現行前端仍呼叫既有 `https://futures-ai-worker.s4112930.workers.dev`，本任務不切換 API。
- 2026-08-29 的只讀檢查顯示：舊 Worker 正式部署的 OPTIONS 回應為 200，但來源 repo 現行程式回傳 204；此部署漂移不影響可用性，後續平行部署必須再比對。
- `worker/wrangler.jsonc` 可建置遷入後的 Worker，但在 Cloudflare Access 與端點驗證完成前，不應取代正式部署。
- 若整合版本有問題，回滾本 PR 即可；舊 `futures-ai-worker` repo 與已部署 Worker 均未刪除或封存。

## 安全現況

遷入的 Worker 保留既有行為，方便以測試確認沒有功能遺失。目前 `/ig/test`、`/ig/login-test`、`/ig/accounts`、`/ig/transactions` 與 AI 路由尚未加入本人驗證；CORS 不等於登入保護。這些端點必須在後續 Cloudflare Access 與 API 安全任務完成後才可作為新的正式入口。
