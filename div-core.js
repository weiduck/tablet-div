/**
 * 直式除法練習：純邏輯（不碰 DOM）
 * - 長除法計算、題型約束 checkLevel、隨機出題 generate、步驟引擎 buildSteps、驗算 buildCheckSteps
 * - UMD：瀏覽器 → window.DivCore；Node → require('./div-core.js')
 *
 * 版面規則（康軒直式除法）：
 * - 商對齊「部分被除數」的最後一位；最高位不夠商時不寫 0
 * - 中間／末尾不夠商要商 0 佔位；商 0 時不寫 0 那一列、不減，直接把下一位移下來
 * - 相減剛好為 0 而且後面還要移下來時，0 不寫
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DivCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** 由右往左：index 0 = 個位 */
  const PLACE = ["個位", "十位", "百位", "千位", "萬位"];
  const PLACE_SHORT = ["個", "十", "百", "千", "萬"];

  const MODES = [
    { id: "exact", label: "整除" },
    { id: "remainder", label: "有餘數" },
    { id: "any", label: "都可以" },
  ];

  /** 驗算從這一級開始提供 */
  const VERIFY_MIN_LEVEL = 4;

  // ---------- 小工具 ----------
  function digitsOf(n) {
    return String(n).split("").map(Number);
  }

  function lenOf(n) {
    return String(n).length;
  }

  function hasZero(n) {
    return String(n).indexOf("0") !== -1;
  }

  /** 商的中間有 0（不含最高位與個位），如 105、103、1023 */
  function hasMiddleZero(q) {
    return String(q).slice(1, -1).indexOf("0") !== -1;
  }

  function randInt(rng, lo, hi) {
    if (lo > hi) return null;
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  function placeOf(width, col) {
    return PLACE[width - 1 - col];
  }

  // ---------- 長除法 ----------
  /**
   * 回傳每一個商位的計算：
   * blocks[i] = { col, partial, q, product, diff }
   * col 為商所在（＝部分被除數最後一位）在被除數中的欄位（0 = 最高位）
   */
  function longDivide(dividend, divisor) {
    const ds = digitsOf(dividend);
    const n = ds.length;
    let qStart = n - 1;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc = acc * 10 + ds[i];
      if (acc >= divisor) {
        qStart = i;
        break;
      }
    }
    let partial = 0;
    for (let i = 0; i <= qStart; i++) partial = partial * 10 + ds[i];
    const blocks = [];
    for (let col = qStart; col < n; col++) {
      if (col > qStart) partial = partial * 10 + ds[col];
      const q = Math.floor(partial / divisor);
      const product = q * divisor;
      const diff = partial - product;
      blocks.push({ col, partial, q, product, diff });
      partial = diff;
    }
    const quotient = Number(blocks.map((b) => b.q).join(""));
    return { digits: ds, qStart, blocks, quotient, remainder: partial };
  }

  /**
   * 商 0 之後又要移下來、而目前部分被除數是 0（會寫出 00、005 這種前導 0 列）。
   * 課本不出這類題，產生器避開。
   */
  function hasAwkwardZero(dividend, divisor) {
    const { blocks } = longDivide(dividend, divisor);
    return blocks.some(
      (b, i) => i < blocks.length - 1 && b.q === 0 && b.partial === 0
    );
  }

  // ---------- 題型 ----------
  const LEVELS = [
    {
      id: 0,
      tag: "L0 暖身",
      desc: "二三位÷一位",
      title: "二、三位數 ÷ 一位數",
      example: "84 ÷ 4、275 ÷ 6",
      pick(rng) {
        const d = randInt(rng, 2, 9);
        const twoDigit = rng() < 0.4;
        const q = twoDigit
          ? randInt(rng, Math.ceil(10 / d), Math.floor(99 / d))
          : randInt(rng, Math.ceil(100 / d), Math.floor(999 / d));
        return q === null ? null : { d, q };
      },
    },
    {
      id: 1,
      tag: "L1",
      desc: "四位÷一位",
      title: "四位數 ÷ 一位數（商沒有 0）",
      example: "8492 ÷ 4、5376 ÷ 7",
      pick(rng) {
        const d = randInt(rng, 2, 9);
        return { d, q: randInt(rng, Math.ceil(1000 / d), Math.floor(9999 / d)) };
      },
    },
    {
      id: 2,
      tag: "L2",
      desc: "四位÷一位・有0",
      title: "四位數 ÷ 一位數（商或被除數有 0）",
      example: "2453 ÷ 8、1006 ÷ 3、1080 ÷ 3",
      pick(rng) {
        const d = randInt(rng, 2, 9);
        let q = randInt(rng, Math.ceil(1000 / d), Math.floor(9999 / d));
        if (rng() < 0.6) {
          // 偏好商中間或末尾有 0
          const s = String(q).split("");
          s[randInt(rng, 1, s.length - 1)] = "0";
          q = Number(s.join(""));
        }
        return { d, q };
      },
    },
    {
      id: 3,
      tag: "L3",
      desc: "二位÷整十",
      title: "二位數 ÷ 整十",
      example: "90 ÷ 20、92 ÷ 30",
      pick(rng) {
        return { d: 10 * randInt(rng, 1, 9), q: randInt(rng, 1, 9) };
      },
      remainder(d, q, rng) {
        // 偏好整十 ÷ 整十（餘數也是整十）
        if (d >= 20 && rng() < 0.4) return 10 * randInt(rng, 1, d / 10 - 1);
        return randInt(rng, 1, d - 1);
      },
    },
    {
      id: 4,
      tag: "L4",
      desc: "二位÷二位・估商",
      title: "二位數 ÷ 二位數（估商）",
      example: "86 ÷ 21、95 ÷ 28、87 ÷ 25、26 ÷ 29",
      pick(rng) {
        let d;
        do {
          d = randInt(rng, 11, 99);
        } while (d % 10 === 0);
        // 偶爾被除數比除數小（商 0）
        const q = rng() < 0.12 ? 0 : randInt(rng, 1, Math.floor(99 / d));
        return { d, q };
      },
    },
    {
      id: 5,
      tag: "L5",
      desc: "三位÷二位・商一位",
      title: "三位數 ÷ 二位數（商是一位數）",
      example: "215 ÷ 32、180 ÷ 30",
      pick(rng) {
        const d = rng() < 0.3 ? 10 * randInt(rng, 2, 9) : randInt(rng, 11, 99);
        const qMin = Math.max(1, Math.floor(100 / d));
        return qMin > 9 ? null : { d, q: randInt(rng, qMin, 9) };
      },
    },
    {
      id: 6,
      tag: "L6",
      desc: "三位÷二位・商二位",
      title: "三位數 ÷ 二位數（商是二位數）",
      example: "672 ÷ 21、500 ÷ 32",
      pick(rng) {
        const d = randInt(rng, 10, 99);
        const q = randInt(rng, 10, Math.floor(999 / d));
        return q === null ? null : { d, q };
      },
    },
    {
      id: 7,
      tag: "L7",
      desc: "四位÷二位",
      title: "四位數 ÷ 二位數（商中間沒有 0）",
      example: "6820 ÷ 20、2150 ÷ 26",
      pick(rng) {
        const d = randInt(rng, 10, 99);
        const q = randInt(
          rng,
          Math.max(10, Math.floor(1000 / d)),
          Math.min(999, Math.floor(9999 / d))
        );
        return q === null ? null : { d, q };
      },
    },
    {
      id: 8,
      tag: "L8",
      desc: "四位÷二位・商中間0",
      title: "四位數 ÷ 二位數（商中間有 0）",
      example: "1900 ÷ 18、1860 ÷ 18",
      pick(rng) {
        const d = randInt(rng, 10, 99);
        return { d, q: randInt(rng, 1, 9) * 100 + randInt(rng, 0, 9) };
      },
    },
  ];

  /** 題型約束（被除數、除數皆為正整數） */
  function checkLevel(level, dividend, divisor) {
    if (!Number.isInteger(dividend) || !Number.isInteger(divisor)) return false;
    if (dividend < 1 || divisor < 2) return false;
    if (hasAwkwardZero(dividend, divisor)) return false;
    const q = Math.floor(dividend / divisor);
    const nD = lenOf(dividend);
    const nd = lenOf(divisor);
    switch (level) {
      case 0:
        return nd === 1 && (nD === 2 || nD === 3) && q >= 1 && !hasZero(q);
      case 1:
        return nd === 1 && nD === 4 && !hasZero(q) && !hasZero(dividend);
      case 2:
        return nd === 1 && nD === 4 && (hasZero(q) || hasZero(dividend));
      case 3:
        return nd === 2 && divisor % 10 === 0 && nD === 2 && dividend >= divisor;
      case 4:
        return nd === 2 && divisor % 10 !== 0 && nD === 2;
      case 5:
        return nd === 2 && nD === 3 && q >= 1 && q <= 9;
      case 6:
        return nd === 2 && nD === 3 && q >= 10;
      case 7:
        return nd === 2 && nD === 4 && (lenOf(q) === 2 || lenOf(q) === 3) && !hasMiddleZero(q);
      case 8:
        return nd === 2 && nD === 4 && lenOf(q) === 3 && hasMiddleZero(q);
      default:
        return false;
    }
  }

  function modeOK(mode, dividend, divisor) {
    if (mode === "exact") return dividend % divisor === 0;
    if (mode === "remainder") return dividend % divisor !== 0;
    return true;
  }

  /** 萬一隨機找不到（理論上不會），用這些已驗證的題目 */
  const FALLBACK = [
    { exact: [84, 4], remainder: [85, 4] },
    { exact: [4884, 4], remainder: [4885, 4] },
    { exact: [1080, 3], remainder: [2453, 8] },
    { exact: [90, 30], remainder: [92, 30] },
    { exact: [84, 21], remainder: [86, 21] },
    { exact: [180, 30], remainder: [215, 32] },
    { exact: [672, 21], remainder: [500, 32] },
    { exact: [6820, 20], remainder: [2150, 26] },
    { exact: [1890, 18], remainder: [1900, 18] },
  ];

  /**
   * 依題型與「整除／有餘數／都可以」隨機出題。
   * 先選除數與商，再依模式加上餘數，最後用 checkLevel 篩。
   * 某些組合（如商 0）不可能整除，就換別的數字。
   */
  function generate(level, mode, rng) {
    rng = rng || Math.random;
    mode = mode || "any";
    const L = LEVELS[level];
    if (!L) throw new Error("unknown level " + level);
    for (let t = 0; t < 5000; t++) {
      const pq = L.pick(rng);
      if (!pq || pq.q === null) continue;
      const d = pq.d;
      const q = pq.q;
      const exact =
        mode === "exact" ? true : mode === "remainder" ? false : rng() < 0.4;
      if (exact && q === 0) continue;
      let r = 0;
      if (!exact) {
        if (q === 0) r = randInt(rng, 10, d - 1);
        else if (L.remainder) r = L.remainder(d, q, rng);
        else r = randInt(rng, 1, d - 1);
        if (r === null) continue;
      }
      const dividend = d * q + r;
      if (checkLevel(level, dividend, d) && modeOK(mode, dividend, d)) {
        return { dividend, divisor: d };
      }
    }
    const fb = FALLBACK[level][mode === "remainder" ? "remainder" : "exact"];
    return { dividend: fb[0], divisor: fb[1] };
  }

  // ---------- 提示文字 ----------
  /** 四捨五入成整十（估商用）；一位數與整十不變 */
  function roundDivisor(d) {
    if (d < 10 || d % 10 === 0) return d;
    return Math.round(d / 10) * 10;
  }

  function judgeQuotient(partial, divisor, digit) {
    if (digit * divisor > partial) return "big";
    if (partial - digit * divisor >= divisor) return "small";
    return "ok";
  }

  function estimateHint(partial, d, q) {
    if (d < 10) {
      let s = `想 ${d} 的乘法：${d} × ${q} = ${d * q}`;
      if (q < 9) s += `，${d} × ${q + 1} = ${d * (q + 1)} 就比 ${partial} 大了`;
      return s + `，所以商 ${q}。`;
    }
    const rd = roundDivisor(d);
    const est = Math.min(9, Math.max(1, Math.floor(partial / rd)));
    let s;
    if (d % 10 === 0) {
      const tens = Math.floor(partial / 10);
      s =
        `${d} 是 ${d / 10} 個十，${partial} 大約是 ${tens} 個十。` +
        `想 ${d / 10} × ? 最接近 ${tens} 又不超過，先試 ${est}。`;
    } else {
      s =
        `估商：把 ${d} 看成 ${rd}（${d % 10 <= 4 ? "四捨" : "五入"}），` +
        `${partial} ÷ ${rd} 大約是 ${est}，先試 ${est}。` +
        (rd < d ? "除數看小了，商可能太大；" : "除數看大了，商可能太小；") +
        "再調整。";
    }
    let t = est;
    for (let k = 0; k < 10; k++) {
      const p = t * d;
      if (p > partial) {
        s += ` 試 ${t}：${d} × ${t} = ${p}，比 ${partial} 大，太大了，改小 1。`;
        t -= 1;
      } else if (partial - p >= d) {
        s += ` 試 ${t}：${d} × ${t} = ${p}，${partial} − ${p} = ${partial - p}，沒有比 ${d} 小，太小了，改大 1。`;
        t += 1;
      } else {
        s += ` 試 ${t}：${d} × ${t} = ${p}，${partial} − ${p} = ${partial - p} 比 ${d} 小，商 ${t} 剛剛好！`;
        break;
      }
    }
    return s;
  }

  function mulBreakdown(q, d) {
    if (d < 10) return `${q} × ${d} = ${q * d}`;
    if (d % 10 === 0) {
      return `${q} × ${d} = ${q * d}（先算 ${q} × ${d / 10} = ${(q * d) / 10}，再補一個 0）`;
    }
    const tens = Math.floor(d / 10) * 10;
    const ones = d % 10;
    return `${q} × ${d} = ${q} × ${tens} + ${q} × ${ones} = ${q * tens} + ${q * ones} = ${q * d}`;
  }

  /** 答錯時的回饋（UI 直接顯示） */
  function feedbackFor(step, digit) {
    if (step.kind === "quotient") {
      const d = step.divisor;
      const p = digit * d;
      const j = judgeQuotient(step.partial, d, digit);
      if (j === "big") {
        return `太大了：${digit} × ${d} = ${p}，比 ${step.partial} 大，不夠減。試小一點。`;
      }
      if (j === "small") {
        return `太小了：${step.partial} − ${p} = ${step.partial - p}，沒有比除數 ${d} 小，還可以再多商。試大一點。`;
      }
      return "";
    }
    if (step.kind === "product") {
      return `還差一點。算算看 ${step.q} × ${step.divisor}，積從右往左一位一位寫。`;
    }
    if (step.kind === "diff") {
      return `還差一點。${step.partial} − ${step.product}，從右往左減，不夠減要向左邊借 1。`;
    }
    if (step.kind === "bring") {
      return "還差一點。看被除數紅圈的那一位，直直往下移。";
    }
    if (step.kind === "check-mul") {
      return `還差一點。再算一次 ${step.divisor} × ${step.quotient}，從右往左寫。`;
    }
    if (step.kind === "check-add") {
      return `還差一點。再算一次 ${step.product} + ${step.remainder}，從右往左加。`;
    }
    return "還差一點，再試一次。";
  }

  function equation(dividend, divisor) {
    const q = Math.floor(dividend / divisor);
    const r = dividend % divisor;
    return r === 0
      ? `${dividend} ÷ ${divisor} = ${q}`
      : `${dividend} ÷ ${divisor} = ${q} … ${r}`;
  }

  // ---------- 步驟引擎 ----------
  /**
   * rows[r] = { type, label, cells:[{col, value, given}], line, revealAt }
   *   r=0 商、r=1 被除數（除數放在負欄位 -dl..-1），之後依序為積／差列
   *   line = { from, to }：積下面那條減法橫線涵蓋的欄位
   * steps[i] = { area:'div', row, col, expected, kind, phase, prompt, question, hint, highlights, ... }
   */
  function buildSteps(dividend, divisor) {
    const ld = longDivide(dividend, divisor);
    const ds = ld.digits;
    const n = ds.length;
    const dl = lenOf(divisor);
    const rows = [];
    const steps = [];

    function addRow(type, label) {
      rows.push({ type, label, cells: [], line: null, revealAt: null });
      return rows.length - 1;
    }
    function addStep(s) {
      s.area = "div";
      s.index = steps.length;
      steps.push(s);
      const row = rows[s.row];
      row.cells.push({ col: s.col, value: s.expected, given: false, step: s.index });
      if (row.revealAt === null) row.revealAt = s.index;
    }
    const place = (col) => placeOf(n, col);
    const range = (a, b) => {
      const out = [];
      for (let i = a; i <= b; i++) out.push(i);
      return out;
    };

    const qRow = addRow("quotient", "商");
    const dvRow = addRow("dividend", "被除數");
    rows[qRow].revealAt = 0;
    rows[dvRow].revealAt = 0;
    ds.forEach((v, c) => rows[dvRow].cells.push({ col: c, value: v, given: true }));
    digitsOf(divisor).forEach((v, i) =>
      rows[dvRow].cells.push({ col: i - dl, value: v, given: true, divisor: true })
    );
    const divisorCells = range(-dl, -1).map((c) => ({ row: dvRow, col: c }));

    const wholeZero = ld.quotient === 0;
    let curRow = dvRow;
    let pStart = 0;
    let prev = null;

    ld.blocks.forEach((b, bi) => {
      const { col, partial, q, product, diff } = b;
      const last = col === n - 1;
      const partialCells = range(pStart, col).map((c) => ({ row: curRow, col: c }));

      // 1. 商
      let qHint;
      let qQuestion = `${partial} 裡面有幾個 ${divisor}？商寫在藍框（${place(col)}）。`;
      if (wholeZero) {
        qQuestion = `${partial} 裡面有幾個 ${divisor}？`;
        qHint =
          `${partial} 比 ${divisor} 小，一個 ${divisor} 都不夠分，商寫 0。` +
          `接著 0 × ${divisor} = 0，${partial} − 0 = ${partial}，餘數就是 ${partial}。`;
      } else if (q === 0) {
        qHint =
          `${partial} 比 ${divisor} 小，不夠商，商 0 佔位：` +
          `${place(col)}要寫 0，不能省略（不然位值會跑掉）。`;
      } else {
        let lead = "";
        if (bi === 0) {
          if (ld.qStart > 0) {
            const prefix = Number(ds.slice(0, ld.qStart).join(""));
            lead =
              `被除數前面的 ${prefix} 比 ${divisor} 小，不夠商，那裡不寫商（最高位的 0 不用寫）。` +
              `要看 ${partial}，商寫在${place(col)}，對齊 ${partial} 的最後一位。`;
          } else {
            lead = `先看最高位 ${partial}，夠除，商寫在${place(col)}上面。`;
          }
        }
        qHint = lead + estimateHint(partial, divisor, q);
      }
      addStep({
        kind: "quotient",
        row: qRow,
        col,
        expected: q,
        partial,
        divisor,
        phase: `商·${place(col)}：估商`,
        prompt: "估商：商寫在藍框",
        question: qQuestion,
        hint: qHint,
        okText: `答對了！商 ${q}。`,
        highlights: partialCells.concat(divisorCells),
      });

      if (q > 0 || wholeZero) {
        // 2. 積（從右往左）
        const pRow = addRow("product", "積");
        rows[pRow].line = { from: pStart, to: col };
        const pd = digitsOf(product);
        for (let k = 0; k < pd.length; k++) {
          const c = col - k;
          const digit = pd[pd.length - 1 - k];
          addStep({
            kind: "product",
            row: pRow,
            col: c,
            expected: digit,
            q,
            divisor,
            product,
            phase: `積·${place(c)}：商 × 除數`,
            prompt: "商 × 除數，積從右往左寫",
            question:
              k === 0
                ? `商 ${q} × 除數 ${divisor} = ？先寫最右邊（${place(c)}）。`
                : `${q} × ${divisor} = ？${place(c)}寫幾？`,
            hint:
              mulBreakdown(q, divisor) +
              "。" +
              (k === 0 ? `積的最右邊要對齊商（${place(col)}），` : "") +
              `這格寫 ${digit}。`,
            highlights: [{ row: qRow, col }].concat(divisorCells),
          });
        }

        // 3. 差（從右往左；差 0 而且後面還要移下來時不寫）
        const fRow = addRow("diff", "差");
        const writeDiff = !(diff === 0 && !last);
        let newStart = col + 1;
        if (writeDiff) {
          const dd = digitsOf(diff);
          const pa = digitsOf(partial).reverse();
          const pb = digitsOf(product).reverse();
          let borrow = 0;
          for (let k = 0; k < dd.length; k++) {
            const c = col - k;
            const digit = dd[dd.length - 1 - k];
            const top = pa[k];
            const bottom = pb[k] || 0;
            const borrowIn = borrow;
            const need = top - borrowIn < bottom;
            borrow = need ? 1 : 0;
            let note = "";
            if (borrowIn) note += `這一位被右邊借走 1，${top} 變成 ${top - 1}。`;
            if (need) {
              note += `${top - borrowIn} 不夠減 ${bottom}，向左邊借 1，變成 ${top - borrowIn + 10} − ${bottom} = ${digit}。`;
            }
            const isLastDigit = k === dd.length - 1;
            let tail = "";
            if (isLastDigit) {
              tail =
                diff === 0
                  ? "剛好減完，寫 0。"
                  : `差 ${diff} 比除數 ${divisor} 小，表示商 ${q} 是對的。` +
                    (dd.length < pa.length ? "左邊不用寫 0。" : "");
            }
            addStep({
              kind: "diff",
              row: fRow,
              col: c,
              expected: digit,
              partial,
              product,
              diff,
              divisor,
              phase: `差·${place(c)}：相減`,
              prompt: "相減，差從右往左寫",
              question: `${partial} − ${product} = ？${place(c)}寫幾？`,
              hint: `${partial} − ${product} = ${diff}。${note}這格寫 ${digit}。${tail}`,
              highlights: [
                { row: curRow, col: c },
                { row: pRow, col: c },
              ],
            });
          }
          newStart = col - dd.length + 1;
        }
        curRow = fRow;
        pStart = newStart;
        prev = { type: writeDiff ? "diff" : "diffZero", partial, product, diff };
      } else {
        prev = { type: "zero", partial };
      }

      // 4. 移下來
      if (!last) {
        const c = col + 1;
        const digit = ds[c];
        const newPartial = diff * 10 + digit;
        let hint;
        if (prev.type === "zero") {
          hint =
            `上一步商 0（不夠商，商 0 佔位）。0 × ${divisor} = 0，` +
            `0 這一列不用寫、也不用減，直接把下一位 ${digit} 移下來，和 ${prev.partial} 合起來是 ${newPartial}。`;
        } else if (prev.type === "diffZero") {
          hint =
            `${prev.partial} − ${prev.product} = 0，剛好減完；0 不用寫，` +
            `直接把被除數${place(c)}的 ${digit} 移下來。`;
        } else {
          hint =
            `把被除數${place(c)}的 ${digit} 直直往下移，寫在差 ${diff} 的右邊，變成 ${newPartial}。`;
        }
        addStep({
          kind: "bring",
          row: curRow,
          col: c,
          expected: digit,
          divisor,
          phase: `移下來·${place(c)}`,
          prompt: "把下一位移下來",
          question: `被除數${place(c)}的數字移下來，藍框寫幾？`,
          hint,
          highlights: [{ row: dvRow, col: c }],
        });
        if (prev.type === "diffZero") pStart = c;
      }
    });

    return {
      dividend,
      divisor,
      quotient: ld.quotient,
      remainder: ld.remainder,
      nCols: n,
      divisorLen: dl,
      qStart: ld.qStart,
      rows,
      steps,
      remainderRow: curRow,
      equation: equation(dividend, divisor),
    };
  }

  /**
   * 驗算：除數 × 商 = 積；（有餘數時）積 + 餘數 = 被除數
   * rows[r] = { key, left, cells:[{col, value}], revealAt }，欄寬 width（右對齊）
   */
  function buildCheckSteps(dividend, divisor) {
    const Q = Math.floor(dividend / divisor);
    const R = dividend % divisor;
    const P = divisor * Q;
    const width = Math.max(lenOf(P), lenOf(dividend));
    const rows = [];
    const steps = [];
    const place = (col) => placeOf(width, col);

    function addRow(key, left) {
      rows.push({ key, left, cells: [], revealAt: steps.length });
      return rows.length - 1;
    }
    function addStep(s) {
      s.area = "check";
      s.index = steps.length;
      steps.push(s);
      rows[s.row].cells.push({ col: s.col, value: s.expected });
    }

    const mulRow = addRow("mul", `${divisor} × ${Q} =`);
    const pd = digitsOf(P);
    for (let k = 0; k < pd.length; k++) {
      const c = width - 1 - k;
      const digit = pd[pd.length - 1 - k];
      const lastDigit = k === pd.length - 1;
      addStep({
        kind: "check-mul",
        row: mulRow,
        col: c,
        expected: digit,
        divisor,
        quotient: Q,
        phase: `驗算·${place(c)}：除數 × 商`,
        prompt: "驗算：除數 × 商 + 餘數 = 被除數",
        question: `驗算：${divisor} × ${Q} = ？${place(c)}寫幾？`,
        hint:
          `${divisor} × ${Q} = ${P}，這格寫 ${digit}。` +
          (lastDigit && R === 0
            ? `積 ${P} 就是被除數 ${dividend}，整除，算對了！`
            : ""),
        highlights: [],
      });
    }

    if (R > 0) {
      const addRowIdx = addRow("add", `${P} + ${R} =`);
      const dd = digitsOf(dividend);
      for (let k = 0; k < dd.length; k++) {
        const c = width - 1 - k;
        const digit = dd[dd.length - 1 - k];
        addStep({
          kind: "check-add",
          row: addRowIdx,
          col: c,
          expected: digit,
          product: P,
          remainder: R,
          phase: `驗算·${place(c)}：再加餘數`,
          prompt: "驗算：除數 × 商 + 餘數 = 被除數",
          question: `驗算：${P} + ${R} = ？${place(c)}寫幾？`,
          hint:
            `${P} + ${R} = ${dividend}，這格寫 ${digit}。` +
            (k === dd.length - 1 ? `和被除數 ${dividend} 一樣，表示除法算對了！` : ""),
          highlights: [],
        });
      }
    }

    return { dividend, divisor, quotient: Q, remainder: R, product: P, width, rows, steps };
  }

  return {
    PLACE,
    PLACE_SHORT,
    MODES,
    LEVELS,
    FALLBACK,
    VERIFY_MIN_LEVEL,
    digitsOf,
    hasMiddleZero,
    longDivide,
    hasAwkwardZero,
    checkLevel,
    modeOK,
    generate,
    roundDivisor,
    judgeQuotient,
    estimateHint,
    feedbackFor,
    equation,
    buildSteps,
    buildCheckSteps,
  };
});
