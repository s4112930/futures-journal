export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "https://s4112930.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=UTF-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Only POST requests are accepted."
        }),
        {
          status: 405,
          headers
        }
      );
    }

    try {
      const trade = await request.json();

      if (!trade.product || !trade.direction) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "缺少商品名稱或交易方向"
          }),
          {
            status: 400,
            headers
          }
        );
      }

      const systemPrompt = `
你是一個期貨交易客觀分析系統。

只分析已完成的交易紀錄。

規則：
1. 只能使用輸入資料中的可驗證資訊。
2. 不得自行補充市場行情、成交量、新聞或技術指標。
3. 不得推測交易者情緒、心理、人格或主觀動機。
4. 禁止使用「貪心、恐懼、衝動、沒耐心、心態不好、太急」。
5. 獲利不代表進場正確。
6. 虧損不代表進場錯誤。
7. 資料不足時必須明確說「資料不足，無法客觀判定」。
8. 不提供未來買進、賣出、加碼、減碼或持有建議。
9. 使用繁體中文。
10. 簡潔、中性、專業。
`;

      const tradeText = `
商品：${trade.product || "未提供"}
方向：${trade.direction || "未提供"}
進場時間：${trade.entryTime || "未提供"}
出場時間：${trade.exitTime || "未提供"}
進場價：${trade.entryPrice || "未提供"}
出場價：${trade.exitPrice || "未提供"}
停損價：${trade.stopLoss || "未提供"}
停利價：${trade.takeProfit || "未提供"}
口數：${trade.quantity ?? "未提供"}
手續費：${trade.fee ?? "未提供"}
實際損益：${trade.profit ?? "未提供"}
個人紀錄：${trade.note || "未提供"}
`;

      const schema = {
        type: "object",
        properties: {
          summary: {
            type: "string"
          },
          holdingTime: {
            type: "string"
          },
          priceChange: {
            type: "string"
          },
          entryAnalysis: {
            type: "string"
          },
          exitAnalysis: {
            type: "string"
          },
          riskManagement: {
            type: "string"
          },
          verifiedFactors: {
            type: "array",
            items: {
              type: "string"
            }
          },
          missingData: {
            type: "array",
            items: {
              type: "string"
            }
          },
          objectiveConclusion: {
            type: "string"
          }
        },
        required: [
          "summary",
          "holdingTime",
          "priceChange",
          "entryAnalysis",
          "exitAnalysis",
          "riskManagement",
          "verifiedFactors",
          "missingData",
          "objectiveConclusion"
        ]
      };

      const result = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct-fast",
        {
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: tradeText
            }
          ],

          response_format: {
            type: "json_schema",
            json_schema: schema
          },

          max_tokens: 900,
          temperature: 0.1
        }
      );

      let analysis = result.response;

      if (typeof analysis === "string") {
        try {
          analysis = JSON.parse(analysis);
        } catch {
          throw new Error("AI 回傳內容不是有效 JSON");
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          analysis
        }),
        {
          status: 200,
          headers
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "AI 分析失敗",
          detail: String(error)
        }),
        {
          status: 500,
          headers
        }
      );
    }
  }
};
