# Futures Journal

個人使用的期貨交易日誌與分析網頁。這個 repo 是前端、Cloudflare Worker、測試與治理文件的唯一主儲存庫。

## 專案結構

主要檔案：
- index.html：GitHub Pages 前端交易日誌。
- worker/index.js：Access JWT 驗證、IG 同步與 AI API。
- worker/staging.js：同源 Static Assets 與 API wrapper。
- worker/wrangler*.jsonc：正式與 staging 建置設定。
- tests/：備份還原、Worker、staging 契約測試。
- scripts/：建置與部署 smoke test。

## 功能與 API 契約

目前只保留交易日誌所需能力：IG 帳戶與交易同步、手動新增交易、單月份／近 3 個月／近半年統計、損益與商品別績效、每筆交易明細、AI 客觀檢討，以及 JSON 匯出／還原備份。

前端使用 POST /api/analyze；舊的 POST / 暫時保留為回滾相容入口。AI 回應使用版本化 schemaVersion: 1.0，前端與 Worker 共用 canonical schema，包括 resultType、resultSummary、directReason、confirmedFactors、possibleFactors、missingFactors、進出場分析、風險管理、持倉時間與客觀結論。

AI 僅使用送入的交易欄位與使用者備註，不假裝取得即時行情、新聞或技術指標；備註視為不可信文字，不能覆寫系統規則或要求模型洩漏秘密。

IG 同步支援多頁抓取、429／5xx 退避重試、交易鍵去重，以及頁數／筆數／循環保護上限。

## 本機驗證

需求：Node.js 20 以上。

npm install
npm test
npm run check
npm run build:worker
npm run build:staging
npm run smoke:live

- npm test：JSON 備份／還原、Worker 與 staging 契約測試。
- npm run check：Node 語法檢查與建置腳本檢查。
- build:worker 與 build:staging：Wrangler dry-run，不部署正式環境。
- smoke:live：只做正式 GitHub Pages 與 Worker 的只讀連線檢查，不登入 IG、不呼叫 AI、不修改資料。

## Cloudflare 環境設定

Worker 需要下列受保護設定：

| 名稱 | 類型 | 用途 |
|---|---|---|
| AI | Workers AI binding | 單筆交易客觀分析 |
| IG_API_KEY | Secret | IG API key |
| IG_IDENTIFIER | Secret | IG 登入識別 |
| IG_PASSWORD | Secret | IG 登入密碼 |
| ACCESS_TEAM_DOMAIN | Secret／var | Cloudflare Access team domain |
| ACCESS_AUD | Secret／var | Access application 的 AUD tag |
| ACCESS_JWKS_URL | 可選 var | 自訂 JWKS URL；留白則由 team domain 推導 |
| APP_ORIGIN | var | 允許的前端 Origin |

本機可複製 worker/.dev.vars.example 為 worker/.dev.vars，只在本機填值。真實 secret、AUD、email、cookie、交易資料不可提交到 Git、Issue、PR、日誌或前端。設定檔只描述 binding；真正的 secret 必須在 Cloudflare 另外設定。

### 身分驗證

CORS 不是登入。/ig/accounts、/ig/transactions 與 /api/analyze 都必須提供 Cloudflare Access JWT。Worker 會驗證 Cf-Access-Jwt-Assertion、RS256 簽章與 JWKS、issuer、audience、exp 與 nbf。缺少、過期、錯誤簽章或錯誤 audience 的請求會在呼叫 IG／AI 上游前拒絕。

/ig/test 與 /ig/login-test 已移除。GET /health 僅回傳非敏感健康狀態與 request id。

## Static Assets staging

worker/wrangler.staging.jsonc 使用 Cloudflare Workers Static Assets：靜態資產目錄為 dist/、啟用 SPA fallback，且 /health、/ig/*、/api/analyze 先進 Worker。staging 已宣告 Workers AI binding；Access team domain、AUD tag、IG secrets 必須在 Cloudflare 另外設定。

staging smoke test 會確認首頁、同源 health、SPA fallback，以及未授權敏感 API 被 Access 或 Worker 拒絕；未登入不能被視為成功。

部署前先完成 dry-run：

npm run build:staging
npx wrangler login
npm run deploy:staging
STAGING_URL=https://<staging-host> npm run smoke:staging

## 正式切換與回滾界線

- GitHub Pages 與現有正式 Worker 在驗收前保持不變。
- 正式 Worker 必須先建立對應的 Cloudflare Access application，並設定 ACCESS_TEAM_DOMAIN、ACCESS_AUD、IG secrets 與 Workers AI binding。
- 完成 CI、staging、匿名／錯誤 JWT、跨頁 IG、AI schema、桌面／手機檢查前，不應停止 GitHub Pages、刪除 D1 或私人化 repo。
- 若新版本異常，先回滾 Worker／staging deployment 或 revert PR；現有舊服務保留作為回滾路徑。
- D1 與 TV_TOKEN 可暫留，但已不在交易日誌主流程；未確認備份與依賴關係前不要刪除。
