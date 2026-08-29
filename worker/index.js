export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Access-Control-Allow-Origin": "https://s4112930.github.io",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=UTF-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    try {
      if (url.pathname === "/ig/test") {
        return jsonResponse(
          {
            ok: true,
            IG_API_KEY: !!env.IG_API_KEY,
            IG_IDENTIFIER: !!env.IG_IDENTIFIER,
            IG_PASSWORD: !!env.IG_PASSWORD
          },
          200,
          headers
        );
      }

      if (url.pathname === "/ig/login-test") {
        const session = await loginIG(env);

        return jsonResponse(
          {
            ok: true,
            message: "IG 登入成功",
            currentAccountId: session.currentAccountId || null
          },
          200,
          headers
        );
      }

      if (url.pathname === "/ig/accounts") {
        const session = await loginIG(env);

        const response = await fetch(
          "https://api.ig.com/gateway/deal/accounts",
          {
            method: "GET",
            headers: {
              "X-IG-API-KEY": env.IG_API_KEY,
              "CST": session.cst,
              "X-SECURITY-TOKEN": session.securityToken,
              "VERSION": "1",
              "Accept": "application/json"
            }
          }
        );

        const data = await parseResponse(response);

        if (!response.ok) {
          return jsonResponse(
            {
              ok: false,
              error: "取得 IG 帳戶失敗",
              status: response.status,
              detail: data
            },
            response.status,
            headers
          );
        }

        return jsonResponse(
          {
            ok: true,
            accounts: data.accounts || data
          },
          200,
          headers
        );
      }

      if (url.pathname === "/ig/transactions") {
        const session = await loginIG(env);

        const igUrl = new URL(
          "https://api.ig.com/gateway/deal/history/transactions"
        );

        igUrl.searchParams.set("type", "ALL");
        igUrl.searchParams.set("pageSize", "100");
        igUrl.searchParams.set("pageNumber", "1");

        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        if (from) {
          igUrl.searchParams.set("from", from);
        }

        if (to) {
          igUrl.searchParams.set("to", to);
        }

        const response = await fetch(
          igUrl.toString(),
          {
            method: "GET",
            headers: {
              "X-IG-API-KEY": env.IG_API_KEY,
              "CST": session.cst,
              "X-SECURITY-TOKEN": session.securityToken,
              "VERSION": "2",
              "Accept": "application/json"
            }
          }
        );

        const data = await parseResponse(response);

        if (!response.ok) {
          return jsonResponse(
            {
              ok: false,
              error: "取得 IG 交易紀錄失敗",
              status: response.status,
              detail: data
            },
            response.status,
            headers
          );
        }

        return jsonResponse(
          {
            ok: true,
            count: Array.isArray(data.transactions)
              ? data.transactions.length
              : 0,
            transactions: data.transactions || [],
            metadata: data.metadata || null
          },
          200,
          headers
        );
      }

      if (request.method !== "POST") {
        return jsonResponse(
          {
            ok: false,
            error: "Only POST requests are accepted."
          },
          405,
          headers
        );
      }

      const trade = await request.json();

      if (!trade.product || !trade.direction) {
        return jsonResponse(
          {
            ok: false,
            error: "缺少商品名稱或交易方向"
          },
          400,
          headers
        );
      }

      const systemPrompt = `
你是一個期貨交易客觀分析系統。

只分析已完成的交易紀錄。

規則：
1. 只能使用輸入資料中的可驗證資訊。
2. 不得自行補充市場行情、成交量、新聞或技術指標。
3. 不得推測交易者情緒、心理、人格或主觀動機。
4. 禁止使用「貪心、恐懼、衝動、沒耐心、心態不好、太急」等主觀推測。
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
交易點數：${trade.points ?? "未提供"}
持倉分鐘：${trade.holdingMinutes ?? "未提供"}
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
        analysis = JSON.parse(analysis);
      }

      return jsonResponse(
        {
          ok: true,
          analysis
        },
        200,
        headers
      );

    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: "Worker 執行失敗",
          detail: String(error)
        },
        500,
        headers
      );
    }
  }
};

async function loginIG(env) {
  if (!env.IG_API_KEY) {
    throw new Error("缺少 IG_API_KEY");
  }

  if (!env.IG_IDENTIFIER) {
    throw new Error("缺少 IG_IDENTIFIER");
  }

  if (!env.IG_PASSWORD) {
    throw new Error("缺少 IG_PASSWORD");
  }

  const response = await fetch(
    "https://api.ig.com/gateway/deal/session",
    {
      method: "POST",
      headers: {
        "X-IG-API-KEY": env.IG_API_KEY,
        "VERSION": "2",
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        identifier: env.IG_IDENTIFIER,
        password: env.IG_PASSWORD
      })
    }
  );

  const body = await parseResponse(response);

  if (!response.ok) {
    const errorCode =
      body?.errorCode ||
      body?.error ||
      "Unknown error";

    throw new Error(
      "IG 登入失敗：" +
      response.status +
      " " +
      errorCode
    );
  }

  const cst =
    response.headers.get("CST");

  const securityToken =
    response.headers.get("X-SECURITY-TOKEN");

  if (!cst || !securityToken) {
    throw new Error(
      "IG 登入成功，但沒有取得安全 Token"
    );
  }

  return {
    ...body,
    cst,
    securityToken
  };
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text
    };
  }
}

function jsonResponse(data, status, headers) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}
