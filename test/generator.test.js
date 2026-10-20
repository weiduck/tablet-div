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

// ---------- 四選一與三層提示 ----------
/** 這一層提示有沒有「說出要寫幾」 */
function revealsAnswer(text, ans) {
  return (
    new RegExp(`(寫|商|填)\\s*${ans}(?![0-9])`).test(text) || /這格|剛剛好/.test(text)
  );
}

function verifyChoicesAndHints(steps, seed, tag) {
  steps.forEach((s, i) => {
    const where = `${tag} step ${i} (${s.kind})`;
    const built = Core.buildChoices(s, Core.makeRng(seed + i));
    const v = built.values;
    assert.strictEqual(v.length, 4, `${where}: 4 options`);
    assert.strictEqual(new Set(v).size, 4, `${where}: distinct ${v}`);
    v.forEach((x) => assert.ok(Number.isInteger(x) && x >= 0 && x <= 9, `${where}: digit ${x}`));
    assert.ok(v.includes(s.expected), `${where}: includes answer ${s.expected}`);
    assert.ok(!(s.expected in built.tags), `${where}: answer not tagged as error`);
    Object.keys(built.why).forEach((k) => assert.ok(built.why[k], `${where}: why text`));
    // 同一個 seed → 同樣的選項（含順序）
    const again = Core.buildChoices(s, Core.makeRng(seed + i));
    assert.deepStrictEqual(again.values, v, `${where}: same seed same options`);
    // 三層提示
    assert.ok(Array.isArray(s.hints) && s.hints.length === Core.HINT_LEVELS, `${where}: 3 hints`);
    s.hints.forEach((h) => assert.ok(typeof h === "string" && h.length > 0, `${where}: hint text`));
    assert.ok(!/[0-9０-９]/.test(s.hints[0]), `${where}: level 1 has numerals: ${s.hints[0]}`);
    assert.ok(!revealsAnswer(s.hints[0], s.expected), `${where}: level 1 reveals answer`);
    assert.ok(!revealsAnswer(s.hints[1], s.expected), `${where}: level 2 reveals answer: ${s.hints[1]}`);
    assert.ok(s.hints[2].includes(String(s.expected)), `${where}: level 3 gives answer`);
  });
}

const choiceStats = {};
Core.LEVELS.forEach((L) => {
  MODES.forEach((mode) => {
    check(`choices/hints ${L.tag} / ${mode}`, () => {
      const rng = Core.makeRng(1000 + L.id * 10 + MODES.indexOf(mode));
      for (let i = 0; i < 150; i++) {
        const { dividend, divisor } = Core.generate(L.id, mode, rng);
        const tag = `${dividend}÷${divisor}`;
        const plan = Core.buildSteps(dividend, divisor);
        verifyChoicesAndHints(plan.steps, i * 97, tag);
        if (L.id >= Core.VERIFY_MIN_LEVEL) {
          verifyChoicesAndHints(Core.buildCheckSteps(dividend, divisor).steps, i * 89, `${tag} 驗算`);
        }
        plan.steps.forEach((s) => {
          const t = Core.buildChoices(s, rng).tags;
          Object.values(t).forEach((k) => (choiceStats[k] = (choiceStats[k] || 0) + 1));
        });
      }
    });
  });
});

check("generate is reproducible with a seeded rng", () => {
  const a = Core.generate(7, "any", Core.makeRng(42));
  const b = Core.generate(7, "any", Core.makeRng(42));
  assert.deepStrictEqual(a, b);
});

check("correct option position varies with seed", () => {
  const step = Core.buildSteps(86, 21).steps[0];
  const positions = new Set();
  for (let seed = 0; seed < 40; seed++) {
    positions.add(Core.buildChoices(step, Core.makeRng(seed)).values.indexOf(4));
  }
  assert.strictEqual(positions.size, 4, `positions ${[...positions]}`);
});

/** 找出某題某一步的選項與錯誤類型 */
function choicesAt(D, d, pick, check) {
  const plan = check ? Core.buildCheckSteps(D, d) : Core.buildSteps(D, d);
  const step = plan.steps.find(pick);
  assert.ok(step, `step not found in ${D}÷${d}`);
  return { step, built: Core.buildChoices(step, Core.makeRng(7)) };
}

check("86÷21 商: 3 太小、5 太大", () => {
  const { built } = choicesAt(86, 21, (s) => s.kind === "quotient");
  assert.ok(built.values.includes(4));
  assert.strictEqual(built.tags[3], "small");
  assert.strictEqual(built.tags[5], "big");
  assert.ok(/太小了：相減後的差會 ≥ 除數/.test(built.why[3]), built.why[3]);
  assert.ok(/太大了：積會比被除的數大/.test(built.why[5]), built.why[5]);
});

check("500÷32 商 5：用 30 估會估成 6（估商誘答）", () => {
  const { built } = choicesAt(500, 32, (s) => s.kind === "quotient" && s.partial === 180);
  assert.strictEqual(built.tags[6], "estimate");
  assert.ok(/看成 30/.test(built.why[6]) && /太大/.test(built.why[6]), built.why[6]);
});

check("245÷8 最高位：只看第一位的 0", () => {
  const { built } = choicesAt(245, 8, (s) => s.kind === "quotient" && s.lead);
  assert.strictEqual(built.tags[0], "first-digit");
});

check("2453÷8 商中間 0：有「忘了商 0 佔位」的非 0 選項", () => {
  const { step, built } = choicesAt(2453, 8, (s) => s.kind === "quotient" && s.expected === 0);
  const skip = Object.keys(built.tags).find((k) => built.tags[k] === "skip-zero");
  assert.ok(skip !== undefined, JSON.stringify(built.tags));
  assert.strictEqual(Number(skip), 6, "skip-zero offers the next quotient digit 6");
  assert.ok(/商 0 佔位/.test(built.why[skip]));
  assert.strictEqual(step.hints[0].includes("0"), false);
});

check("500÷32 差 18：借位錯誤", () => {
  // 50 − 32：個位 0 不夠減 2 → 倒過來減 2、寫 0；十位被借走沒減 1 → 2
  const ones = choicesAt(500, 32, (s) => s.kind === "diff" && s.partial === 50 && s.k === 0).built;
  assert.ok(ones.values.includes(8));
  assert.strictEqual(ones.tags[2], "swap");
  assert.strictEqual(ones.tags[0], "zero-cant");
  const tens = choicesAt(500, 32, (s) => s.kind === "diff" && s.partial === 50 && s.k === 1).built;
  assert.ok(tens.values.includes(1));
  assert.strictEqual(tens.tags[2], "borrow-not-reduced");
  assert.ok(/借走 1/.test(tens.why[2]));
});

check("500÷32 積 160：進位錯誤", () => {
  // 5 × 32：十位 5×3=15，加進位 1 → 6；忘了進位 5、進位加兩次 7
  const { built } = choicesAt(500, 32, (s) => s.kind === "product" && s.q === 5 && s.k === 1);
  assert.ok(built.values.includes(6));
  assert.strictEqual(built.tags[5], "forgot-carry");
  assert.strictEqual(built.tags[7], "carry-twice");
  assert.ok(/忘了加進位 1/.test(built.why[5]));
});

check("2453÷8 積 24：寫成十位數字", () => {
  const { built } = choicesAt(2453, 8, (s) => s.kind === "product" && s.q === 3 && s.k === 0);
  assert.strictEqual(built.tags[2], "tens-digit");
});

check("6820÷20 移下來：鄰近的被除數數字", () => {
  const { built } = choicesAt(6820, 20, (s) => s.kind === "bring" && s.col === 2);
  assert.ok(built.values.includes(2));
  assert.strictEqual(built.tags[0], "next-digit");
  assert.strictEqual(built.tags[8], "used-digit");
});

check("1900÷18 驗算：乘法與加法的進位錯誤", () => {
  // 18 × 105：個位 8×5 = 40 寫 0 進位 4；十位 1×5 + 8×0 = 5，加進位 4 = 9
  const mul = choicesAt(1900, 18, (s) => s.kind === "check-mul" && s.k === 1, true).built;
  assert.ok(mul.values.includes(9));
  assert.strictEqual(mul.tags[5], "forgot-carry");
  assert.strictEqual(mul.tags[3], "carry-twice");
  // 1890 + 10：十位 9 + 1 = 10 → 寫 0、進位 1；百位 8 + 進位 1 = 9
  const add = choicesAt(1900, 18, (s) => s.kind === "check-add" && s.k === 2, true).built;
  assert.ok(add.values.includes(9));
  assert.strictEqual(add.tags[8], "forgot-carry");
});

check("hints: level 1 concept, level 3 answer (examples)", () => {
  const s = Core.buildSteps(86, 21).steps[0];
  assert.ok(/估商/.test(s.hints[0]));
  assert.ok(/21 看成 20/.test(s.hints[1]) && !revealsAnswer(s.hints[1], 4));
  assert.ok(/商 4 剛剛好/.test(s.hints[2]));
});

// ---------- 結果 ----------
console.log("直式除法 generator test");
console.log(summary.map((s) => "  " + s).join("\n"));
console.log(
  "  誘答類型：" +
    Object.keys(choiceStats)
      .sort()
      .map((k) => `${k}=${choiceStats[k]}`)
      .join(" ")
);
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
