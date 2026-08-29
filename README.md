# Futures Journal

個人使用的期貨交易紀錄與分析網頁。`futures-journal` 是前端、Cloudflare Worker、測試與治理文件的唯一主儲存庫。

## 專案結構

```text
.
├── AGENTS.md                     # 跨對話治理規則
├── index.html                    # 現行 GitHub Pages 前端
├── dist/                         # staging 建置輸出，不提交 Git
├── scripts/
│   ├── build-staging.mjs         # 產生同源 API 的 staging 前端
│   ├── smoke-live.mjs            # 既有正式服務只讀檢查
│   └── smoke-staging.mjs         # staging 部署 smoke test
├── worker/
│   ├── index.js                  # AI 與 IG API Worker
│   ├── staging.js                # Access 前的安全 staging Worker
│   ├── wrangler.jsonc            # Worker 建置設定
│   ├── wrangler.staging.jsonc    # Static Assets staging 設定
│   └── .dev.vars.example         # 本機環境變數名稱範例
├── tests/
│   ├── backup-restore.test.cjs   # JSON 備份與還原測試
│   ├── worker.test.mjs           # Worker 路由契約測試
│   └── staging.test.mjs          # staging 建置／路由安全測試
├── package.json
└── .gitignore
```

Worker 程式由 `s4112930/futures-ai-worker` 的 `main`（來源 commit `2095523`）遷入。舊 repo 與現有 Worker 部署暫時保留，供回滾與行為比對；整合與 staging 均不改變 GitHub Pages、正式 Worker 流量或 repo 可見性。

## 本機驗證

需求：Node.js 20 以上。

```bash
npm install
npm test
npm run check
npm run build:worker
npm run build:staging
npm run smoke:live
```

- `build:worker`：Wrangler dry-run，不部署正式 Worker。
- `build:staging`：先由根目錄 `index.html` 產生 `dist/index.html`，再執行 Static Assets Wrangler dry-run。
- `smoke:live`：只確認既有 GitHub Pages 與舊 Worker 可連線，不登入 IG、不呼叫 AI、不修改資料。

## Cloudflare Static Assets staging

`worker/wrangler.staging.jsonc` 使用 Cloudflare Workers Static Assets：

- 靜態資產目錄：`dist/`
- SPA fallback：`single-page-application`
- API 與前端使用同一 origin
- `/health`、`/ig/*`、`/api/*` 會先進 Worker
- `dist/index.html` 會加入 `noindex,nofollow,noarchive`

staging 建置時才把前端 API 改為同源；根目錄 `index.html` 完全不改，因此現有 GitHub Pages 仍繼續呼叫舊 Worker，可作為回滾路徑。

### Access 前的安全閘門

Issue #7 只建立平行 staging，不提前開放私人能力。`worker/staging.js` 在 Cloudflare Access 尚未完成前：

- `/health` 可用於無敏感資訊的健康檢查。
- `/ig/*` 與 `/api/analyze` 固定回傳 503。
- staging 設定不綁定 IG secrets，也不綁定 Workers AI。
- 因此不能把 #7 的 staging 誤當成正式 AI／IG 環境；本人登入與受保護 API 由後續 #8、#9 完成。

### 部署 staging

先完成本機 dry-run，Cloudflare 登入憑證只存在本機或受保護的 CI secret，不得提交 Git：

```bash
npm run build:staging
npx wrangler login
npm run deploy:staging
```

部署後，以實際 staging URL 執行：

```bash
STAGING_URL="https://<staging-host>" npm run smoke:staging
```

smoke test 會確認首頁、同源 `/health`、SPA fallback，以及 Access 尚未建立時敏感 API 仍被停用。

### 回滾

若 staging 部署本身異常，可使用 Wrangler 回到上一版本：

```bash
npx wrangler rollback --config worker/wrangler.staging.jsonc
```

若要完全撤回 repo 內的 #7 變更，revert 對應 PR 即可。現有 GitHub Pages 與舊 Worker 不會因 staging 部署而停止或重新指向。

## Worker 環境綁定

| 名稱 | 類型 | 用途 |
|---|---|---|
| `AI` | Workers AI binding | 單筆交易客觀分析 |
| `IG_API_KEY` | Secret | IG API key |
| `IG_IDENTIFIER` | Secret | IG 登入識別 |
| `IG_PASSWORD` | Secret | IG 登入密碼 |

本機開發時複製 `worker/.dev.vars.example` 為 `worker/.dev.vars`，只在本機填值。正式環境使用 Cloudflare secret／binding 管理，不得把真實值寫入 Git、Issue、PR、日誌或前端。#7 staging 不使用這些敏感 binding。

## 部署與回滾界線

- 現行前端仍由根目錄 `index.html` 提供，正式網址及 GitHub Pages 設定不變。
- 現行前端仍呼叫既有 `https://futures-ai-worker.s4112930.workers.dev`；只有 staging 的 `dist/index.html` 改為同源 API。
- 2026-08-29 的只讀檢查顯示：舊 Worker 正式部署的 OPTIONS 回應為 200，但來源 repo 現行程式回傳 204；此部署漂移不影響目前可用性，平行部署需持續比對。
- `worker/wrangler.jsonc` 可建置遷入後的 Worker，但在 Cloudflare Access 與端點驗證完成前，不應取代正式部署。
- 若整合或 staging 版本有問題，回滾對應 PR 即可；舊 `futures-ai-worker` repo 與已部署 Worker 均未刪除或封存。

## 安全現況

遷入的正式 Worker 原始碼保留既有行為，方便以測試確認沒有功能遺失。目前 `/ig/test`、`/ig/login-test`、`/ig/accounts`、`/ig/transactions` 與 AI 路由尚未加入本人驗證；CORS 不等於登入保護。這些端點必須在後續 Cloudflare Access 與 API 安全任務完成後才可作為新的正式入口。
