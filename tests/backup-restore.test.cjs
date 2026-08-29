const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const html = fs.readFileSync("index.html", "utf8");
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];

assert.ok(inlineScript, "找不到 index.html 內的 JavaScript");

const start = inlineScript.indexOf("const BACKUP_SCHEMA_VERSION");
const end = inlineScript.indexOf("function deleteTrade", start);

assert.ok(start >= 0 && end > start, "找不到備份與還原程式區段");

const testCode = `
${inlineScript.slice(start, end)}

(async () => {
  const original = [
    {
      id: 101,
      product: "NQ",
      profit: 320,
      customFutureField: { mood: "calm", tags: ["A", "B"] }
    },
    {
      igUniqueId: "ig-202",
      product: "黃金",
      profit: -80,
      unknownFlag: true
    }
  ];

  trades = JSON.parse(JSON.stringify(original));

  const backup = await createTradesBackup();
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.storageKey, "futuresTrades");
  assert.equal(backup.recordCount, original.length);
  assert.match(backup.checksum.value, /^[a-f0-9]{64}$/);
  assert.deepEqual(backup.trades, original, "匯出必須保留未知欄位");

  const restored = await parseTradesBackup(JSON.stringify(backup));
  assert.deepEqual(restored.trades, original, "合法備份必須可完整解析");

  const reordered = [{ b: 2, a: 1 }];
  const ordered = [{ a: 1, b: 2 }];
  assert.equal(stableStringify(reordered), stableStringify(ordered));

  const tampered = JSON.parse(JSON.stringify(backup));
  tampered.trades[0].profit = 999999;
  await assert.rejects(
    () => parseTradesBackup(JSON.stringify(tampered)),
    /完整性檢查失敗/
  );

  await assert.rejects(
    () => parseTradesBackup("not-json"),
    /不是有效的 JSON/
  );

  trades = [{ id: 303, apiKey: "must-not-export" }];
  await assert.rejects(
    () => createTradesBackup(),
    /疑似祕密欄位/
  );

  assert.equal(getTradeRestoreKey({ id: 1 }), "id:1");
  assert.equal(
    getTradeRestoreKey({ igUniqueId: "abc", id: 1 }),
    "igUniqueId:abc"
  );

  trades = [{ id: 1, product: "NQ" }];
  pendingRestore = {
    newTrades: [{ id: 2, product: "YM" }],
    validTrades: [{ id: 2, product: "YM" }]
  };
  restoreTradesBackup("merge");
  assert.deepEqual(
    trades,
    [
      { id: 2, product: "YM" },
      { id: 1, product: "NQ" }
    ],
    "合併還原必須保留現有資料"
  );

  pendingRestore = {
    newTrades: [],
    validTrades: [{ id: 9, product: "BTC", extra: "preserved" }]
  };
  restoreTradesBackup("replace");
  assert.deepEqual(
    trades,
    [{ id: 9, product: "BTC", extra: "preserved" }],
    "二次確認後才可取代全部資料"
  );

  console.log("backup/restore tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
`;

const context = {
  assert,
  console,
  process,
  TextEncoder,
  setTimeout,
  location: { origin: "https://example.test" },
  window: { crypto: webcrypto },
  trades: [],
  document: {
    getElementById() {
      return { disabled: false, style: {}, textContent: "" };
    }
  },
  localStorage: {
    setItem() {}
  },
  confirm() {
    return true;
  },
  saveTrades() {},
  render() {}
};

vm.runInNewContext(testCode, context, {
  filename: "backup-restore-inline.test.js"
});
