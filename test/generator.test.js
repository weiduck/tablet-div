/**
 * 直式除法：產生器／步驟引擎檢查（純 Node，無相依套件）
 * 執行：npm test  或  node test/generator.test.js
 */
"use strict";

const assert = require("node:assert");
const path = require("node:path");
const Core = require(path.join(__dirname, "..", "div-core.js"));

const N_PER_COMBO = 500;
const MODES = ["exact", "remainder", "any"];
let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}\n    ${err.message}`);
  }
}

/** 從步驟引擎的結果「讀回」直式上寫的商與餘數 */
function readBoard(plan) {
  const qCells = plan.rows[0].cells.slice().sort((a, b) => a.col - b.col);
  const qStr = qCells.map((c) => c.value).join("");
  const remCells = plan.rows[plan.remainderRow].cells
    .filter((c) => !c.divisor)
    .sort((a, b) => a.col - b.col);
  const rStr = remCells.map((c) => c.value).join("");
  return { qStr, rStr };
}

function verifyPlan(dividend, divisor) {
  const plan = Core.buildSteps(dividend, divisor);
  const q = Math.floor(dividend / divisor);
  const r = dividend % divisor;
  assert.strictEqual(plan.quotient, q, `quotient ${plan.quotient} != ${q}`);
  assert.strictEqual(plan.remainder, r, `remainder ${plan.remainder} != ${r}`);
  const { qStr, rStr } = readBoard(plan);
  // 商：最高位不寫 0（商 0 本身例外），中間／末尾 0 要寫
  assert.strictEqual(qStr, String(q), `board quotient "${qStr}" != ${q}`);
  assert.strictEqual(Number(rStr), r, `board remainder "${rStr}" != ${r}`);
  assert.ok(rStr === String(r), `remainder row shows leading zero "${rStr}"`);
  // 每個步驟填一位數，且每格只有一個步驟
  const seen = new Set();
  plan.steps.forEach((s) => {
    assert.ok(Number.isInteger(s.expected) && s.expected >= 0 && s.expected <= 9, "digit 0-9");
    assert.ok(s.question && s.hint && s.phase, "texts present");
    const key = `${s.row}-${s.col}`;
    assert.ok(!seen.has(key), `cell ${key} filled twice`);
    seen.add(key);
    assert.ok(s.col >= 0 && s.col < plan.nCols, "col in range");
    if (s.kind === "quotient") {
      assert.strictEqual(Core.judgeQuotient(s.partial, s.divisor, s.expected), "ok");
    }
  });
  // 積／差列數值正確、差 < 除數
  plan.rows.forEach((row) => {
    if (row.type === "diff" && row.cells.length) {
      // 差列可能含移下來的數字，數值必小於 除數×10
      const v = Number(row.cells.slice().sort((a, b) => a.col - b.col).map((c) => c.value).join(""));
      assert.ok(v < divisor * 10, "diff row value sane");
    }
  });
  // 驗算
  const chk = Core.buildCheckSteps(dividend, divisor);
  assert.strictEqual(chk.product + chk.remainder, dividend, "check sum");
  const lastRow = chk.rows[chk.rows.length - 1];
  const lastVal = Number(lastRow.cells.slice().sort((a, b) => a.col - b.col).map((c) => c.value).join(""));
  assert.strictEqual(lastVal, dividend, "check final row equals dividend");
  return plan;
}

// ---------- 每個題型 × 每種模式 × 500 題 ----------
const summary = [];
Core.LEVELS.forEach((L) => {
  MODES.forEach((mode) => {
    const name = `${L.tag} / ${mode}`;
    const distinct = new Set();
    let exactCount = 0;
    check(name, () => {
      for (let i = 0; i < N_PER_COMBO; i++) {
        const { dividend, divisor } = Core.generate(L.id, mode);
        const tag = `${dividend}÷${divisor}`;
        distinct.add(tag);
        assert.ok(Core.checkLevel(L.id, dividend, divisor), `${tag} fails checkLevel(${L.id})`);
        const r = dividend % divisor;
        if (r === 0) exactCount += 1;
        if (mode === "exact") assert.strictEqual(r, 0, `${tag} should be 整除`);
        if (mode === "remainder") assert.notStrictEqual(r, 0, `${tag} should have 餘數`);
        const q = Math.floor(dividend / divisor);
        assert.ok(r < divisor, `${tag} remainder < divisor`);
        assert.strictEqual(q * divisor + r, dividend, `${tag} q×d+r`);
        try {
          verifyPlan(dividend, divisor);
        } catch (e) {
          throw new Error(`${tag}: ${e.message}`);
        }
      }
      assert.ok(distinct.size >= 10, `only ${distinct.size} distinct problems`);
    });
    summary.push(`${name.padEnd(16)} distinct=${String(distinct.size).padStart(3)} 整除=${exactCount}`);
  });
});

// ---------- 題目範例 ----------
const EXAMPLES = [
  [2, 2453, 8, 306, 5],
  [2, 1006, 3, 335, 1],
  [2, 1080, 3, 360, 0],
  [3, 90, 20, 4, 10],
  [3, 92, 30, 3, 2],
  [4, 86, 21, 4, 2],
  [4, 95, 28, 3, 11],
  [4, 87, 25, 3, 12],
  [4, 26, 29, 0, 26],
  [5, 215, 32, 6, 23],
  [5, 180, 30, 6, 0],
  [6, 672, 21, 32, 0],
  [6, 500, 32, 15, 20],
  [7, 6820, 20, 341, 0],
  [7, 2150, 26, 82, 18],
  [8, 1900, 18, 105, 10],
  [8, 1860, 18, 103, 6],
];
EXAMPLES.forEach(([lv, D, d, q, r]) => {
  check(`example L${lv} ${D}÷${d}`, () => {
    assert.ok(Core.checkLevel(lv, D, d), `checkLevel(${lv}, ${D}, ${d})`);
    const plan = verifyPlan(D, d);
    assert.strictEqual(plan.quotient, q);
    assert.strictEqual(plan.remainder, r);
  });
});

// 範例不屬於其他相鄰題型（區隔）
check("levels are distinct", () => {
  assert.ok(!Core.checkLevel(1, 2453, 8), "2453÷8 not L1");
  assert.ok(!Core.checkLevel(7, 1900, 18), "1900÷18 not L7");
  assert.ok(!Core.checkLevel(8, 2150, 26), "2150÷26 not L8");
  assert.ok(!Core.checkLevel(5, 672, 21), "672÷21 not L5");
  assert.ok(!Core.checkLevel(4, 90, 20), "90÷20 not L4");
});

// 備用題也要符合題型與模式
check("fallbacks valid", () => {
  Core.FALLBACK.forEach((fb, lv) => {
    assert.ok(Core.checkLevel(lv, fb.exact[0], fb.exact[1]), `fallback exact L${lv}`);
    assert.strictEqual(fb.exact[0] % fb.exact[1], 0);
    assert.ok(Core.checkLevel(lv, fb.remainder[0], fb.remainder[1]), `fallback remainder L${lv}`);
    assert.notStrictEqual(fb.remainder[0] % fb.remainder[1], 0);
  });
});

// ---------- 版面規則 ----------
check("245÷8: quotient 3 sits over the 4, then 0", () => {
  const plan = Core.buildSteps(245, 8);
  const qCells = plan.rows[0].cells.map((c) => [c.col, c.value]);
  assert.deepStrictEqual(qCells, [[1, 3], [2, 0]]);
  assert.strictEqual(plan.quotient, 30);
  assert.strictEqual(plan.remainder, 5);
  // 24−24=0 不寫，直接把 5 移下來；商 0 不寫積列
  const kinds = plan.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, ["quotient", "product", "product", "bring", "quotient"]);
});

check("2453÷8: middle 0 skips product/subtraction", () => {
  const plan = Core.buildSteps(2453, 8);
  const kinds = plan.steps.map((s) => s.kind).join(",");
  assert.strictEqual(
    kinds,
    "quotient,product,product,bring,quotient,bring,quotient,product,product,diff"
  );
  const zeroStep = plan.steps.find((s) => s.kind === "quotient" && s.expected === 0);
  assert.ok(/商 0 佔位/.test(zeroStep.hint));
  const afterZero = plan.steps[zeroStep.index + 1];
  assert.strictEqual(afterZero.kind, "bring");
  assert.ok(/不用寫/.test(afterZero.hint));
});

check("26÷29: quotient 0, remainder 26", () => {
  const plan = Core.buildSteps(26, 29);
  assert.strictEqual(plan.steps[0].expected, 0);
  assert.strictEqual(plan.rows[0].cells.length, 1);
  assert.strictEqual(readBoard(plan).rStr, "26");
});

check("judgeQuotient too big / too small", () => {
  assert.strictEqual(Core.judgeQuotient(86, 21, 5), "big");
  assert.strictEqual(Core.judgeQuotient(87, 25, 2), "small");
  assert.strictEqual(Core.judgeQuotient(87, 25, 3), "ok");
  const step = Core.buildSteps(86, 21).steps[0];
  assert.ok(/太大/.test(Core.feedbackFor(step, 5)));
  assert.ok(/太小/.test(Core.feedbackFor(step, 3)));
});

check("estimate hint rounds divisor", () => {
  assert.strictEqual(Core.roundDivisor(21), 20);
  assert.strictEqual(Core.roundDivisor(28), 30);
  assert.strictEqual(Core.roundDivisor(30), 30);
  assert.ok(/21 看成 20/.test(Core.estimateHint(86, 21, 4)));
  assert.ok(/28 看成 30/.test(Core.estimateHint(95, 28, 3)));
  // 87÷25：25 看成 30 → 先試 2 太小 → 3
  const h = Core.estimateHint(87, 25, 3);
  assert.ok(/試 2/.test(h) && /太小/.test(h) && /商 3 剛剛好/.test(h), h);
  // 215÷32：32 看成 30 → 先試 7 太大 → 6
  const h2 = Core.estimateHint(215, 32, 6);
  assert.ok(/試 7/.test(h2) && /太大/.test(h2) && /商 6 剛剛好/.test(h2), h2);
});

check("equation text", () => {
  assert.strictEqual(Core.equation(2453, 8), "2453 ÷ 8 = 306 … 5");
  assert.strictEqual(Core.equation(1080, 3), "1080 ÷ 3 = 360");
});

check("check steps (驗算)", () => {
  const c = Core.buildCheckSteps(1900, 18);
  assert.strictEqual(c.rows.length, 2);
  assert.strictEqual(c.product, 1890);
  const c2 = Core.buildCheckSteps(672, 21);
  assert.strictEqual(c2.rows.length, 1);
});

// ---------- 結果 ----------
console.log("直式除法 generator test");
console.log(summary.map((s) => "  " + s).join("\n"));
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
