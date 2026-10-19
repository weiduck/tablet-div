/**
 * 直式除法練習：介面（點選數字鍵，一格一格填）
 * 純邏輯（出題、題型約束、步驟引擎）在 div-core.js（window.DivCore）。
 */
(function () {
  "use strict";

  const Core = window.DivCore;
  const ADVANCE_MS = 550;
  const WRONG_FLASH_MS = 700;

  const state = {
    level: 0,
    mode: "any",
    verify: false,
    plan: null,
    check: null,
    phase: "div", // div → check（驗算）→ done
    idx: 0,
    cidx: 0,
    checkDone: false,
    values: {},
    hintOpen: false,
    locked: false,
    wrongFlash: null,
    lastProblem: "",
    timers: [],
  };

  const $ = (id) => document.getElementById(id);

  function verifyActive() {
    return state.verify && state.level >= Core.VERIFY_MIN_LEVEL;
  }

  function currentStep() {
    if (state.phase === "div") return state.plan.steps[state.idx] || null;
    if (state.phase === "check") return state.check.steps[state.cidx] || null;
    return null;
  }

  function keyOf(area, row, col) {
    return (area === "check" ? "c-" : "d-") + row + "-" + col;
  }

  function stepKey(step) {
    return keyOf(step.area, step.row, step.col);
  }

  function later(fn, ms) {
    state.timers.push(window.setTimeout(fn, ms));
  }

  function clearTimers() {
    state.timers.forEach((t) => window.clearTimeout(t));
    state.timers = [];
  }

  // ---------- 題型／模式／驗算 按鈕 ----------
  function renderLevelList() {
    const list = $("levelList");
    list.innerHTML = "";
    const rows = [document.createElement("div"), document.createElement("div")];
    rows.forEach((r) => (r.className = "deck-jump-row"));
    Core.LEVELS.forEach((L, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "deck-jump-btn";
      btn.setAttribute("role", "option");
      btn.dataset.level = String(i);
      btn.innerHTML =
        `<span class="dj-num">${L.tag}</span><span class="dj-stage">${L.desc}</span>`;
      btn.setAttribute("aria-label", `${L.tag} ${L.title}`);
      btn.title = `${L.title}（例：${L.example}）`;
      btn.addEventListener("click", () => startProblem(i));
      rows[i < 5 ? 0 : 1].appendChild(btn);
    });
    rows.forEach((r) => list.appendChild(r));
  }

  function renderModeSeg() {
    const seg = $("modeSeg");
    seg.innerHTML = "";
    Core.MODES.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seg-btn";
      btn.dataset.mode = m.id;
      btn.setAttribute("role", "radio");
      btn.textContent = m.label;
      btn.addEventListener("click", () => {
        if (state.mode === m.id) return;
        state.mode = m.id;
        startProblem(state.level);
      });
      seg.appendChild(btn);
    });
  }

  function renderKeypad() {
    const pad = $("keypad");
    pad.innerHTML = "";
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((n) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "key";
      btn.dataset.digit = String(n);
      btn.textContent = String(n);
      btn.setAttribute("aria-label", `數字 ${n}`);
      btn.addEventListener("click", () => onDigit(n, btn));
      pad.appendChild(btn);
    });
  }

  function syncControls() {
    document.querySelectorAll(".deck-jump-btn").forEach((btn) => {
      const on = Number(btn.dataset.level) === state.level;
      btn.classList.toggle("is-current", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".seg-btn").forEach((btn) => {
      const on = btn.dataset.mode === state.mode;
      btn.classList.toggle("is-current", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    const vb = $("verifyBtn");
    const allowed = state.level >= Core.VERIFY_MIN_LEVEL;
    vb.disabled = !allowed;
    vb.classList.toggle("is-on", allowed && state.verify);
    vb.setAttribute("aria-pressed", allowed && state.verify ? "true" : "false");
    vb.textContent = !allowed
      ? `驗算（L${Core.VERIFY_MIN_LEVEL} 起）`
      : state.verify
        ? "驗算：開"
        : "驗算：關";
  }

  // ---------- 直式板 ----------
  function renderBoard() {
    const plan = state.plan;
    const board = $("board");
    const step = currentStep();
    const active = step && !state.locked;
    const curKey = active ? stepKey(step) : null;
    const rings = new Set(
      (active ? step.highlights || [] : []).map((h) => keyOf(step.area, h.row, h.col))
    );
    const done = state.phase === "done";
    const revealIdx = state.phase === "div" ? state.idx : Infinity;
    const n = plan.nCols;
    // 欄：1 = 除數（整個數字一格）、2 = 「厂」、3.. = 被除數各位、最後 = 列名
    const colOf = (c) => 3 + c;
    const tagCol = 3 + n;

    const tmpl = [];
    let html = "";
    let gr = 1;
    tmpl.push("auto");
    html += `<div class="place-label divisor-label" style="grid-row:${gr};grid-column:1">除數</div>`;
    for (let c = 0; c < n; c++) {
      html += `<div class="place-label" style="grid-row:${gr};grid-column:${colOf(c)}">${Core.PLACE_SHORT[n - 1 - c]}</div>`;
    }

    plan.rows.forEach((row, r) => {
      if (!(r <= 1 || row.revealAt <= revealIdx)) return;
      gr += 1;
      tmpl.push("var(--cell)");
      if (row.type === "dividend") {
        html += `<div class="bracket" style="grid-row:${gr};grid-column:2 / ${3 + n}"></div>`;
        const ringed = row.cells.some(
          (cell) => cell.divisor && rings.has(keyOf("div", r, cell.col))
        );
        html +=
          `<div class="divisor-num" style="grid-row:${gr};grid-column:1">${plan.divisor}` +
          (ringed ? '<span class="ring" aria-hidden="true"></span>' : "") +
          "</div>";
      }
      row.cells.forEach((cell) => {
        if (cell.divisor) return;
        const key = keyOf("div", r, cell.col);
        html += cellHtml(cell, key, curKey, rings, `grid-row:${gr};grid-column:${colOf(cell.col)}`);
      });
      const isRem = done && r === plan.remainderRow;
      html += `<div class="row-tag${isRem ? " tag-rem" : ""}" style="grid-row:${gr};grid-column:${tagCol}">${isRem ? "餘數" : row.label}</div>`;
      if (row.line) {
        gr += 1;
        tmpl.push("calc(var(--cell) * 0.16)");
        html += `<div class="hline" style="grid-row:${gr};grid-column:${colOf(row.line.from)} / ${colOf(row.line.to) + 1}"></div>`;
      }
    });

    board.style.gridTemplateColumns =
      `auto calc(var(--cell) * 0.3) repeat(${n}, var(--cell)) calc(var(--cell) * 1.4)`;
    board.style.gridTemplateRows = tmpl.join(" ");
    board.innerHTML = html;
    renderCheck(curKey, rings);
    revealCurrent();
  }

  /** 直式板可捲動時，把目前的藍框捲進畫面 */
  function revealCurrent() {
    const area = $("boardArea");
    const el = area && area.querySelector ? area.querySelector(".cell.current") : null;
    if (!el || !el.getBoundingClientRect) return;
    const a = area.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < a.top + 4) area.scrollTop -= a.top + 4 - r.top;
    else if (r.bottom > a.bottom - 4) area.scrollTop += r.bottom - (a.bottom - 4);
  }

  function cellHtml(cell, key, curKey, rings, style) {
    let cls;
    let text = "";
    if (cell.given) {
      cls = "cell fixed";
      text = String(cell.value);
    } else if (key === curKey && state.wrongFlash !== null) {
      cls = "cell current wrong";
      text = String(state.wrongFlash);
    } else if (key in state.values) {
      cls = "cell filled";
      text = String(state.values[key]);
    } else if (key === curKey) {
      cls = "cell current";
    } else {
      cls = "cell empty";
    }
    const ring = rings.has(key) ? '<span class="ring" aria-hidden="true"></span>' : "";
    return `<div class="${cls}" data-key="${key}" style="${style}">${text || "&nbsp;"}${ring}</div>`;
  }

  function renderCheck(curKey, rings) {
    const area = $("checkArea");
    const show = state.phase === "check" || (state.phase === "done" && state.checkDone);
    area.classList.toggle("hidden", !show);
    if (!show) {
      area.innerHTML = "";
      return;
    }
    const chk = state.check;
    let html = `<p class="check-title">驗算：除數 × 商 + 餘數 = 被除數</p>`;
    html += `<div class="check-grid" style="grid-template-columns:auto repeat(${chk.width}, var(--cell))">`;
    let gr = 0;
    chk.rows.forEach((row, r) => {
      if (state.phase === "check" && row.revealAt > state.cidx) return;
      gr += 1;
      html += `<div class="check-left" style="grid-row:${gr};grid-column:1">${row.left}</div>`;
      row.cells.forEach((cell) => {
        const key = keyOf("check", r, cell.col);
        html += cellHtml(cell, key, curKey, rings, `grid-row:${gr};grid-column:${cell.col + 2}`);
      });
    });
    html += "</div>";
    area.innerHTML = html;
  }

  /**
   * 依可用空間算格子大小（整題固定，不隨揭示列數跳動）。
   * 格子至少 MIN_CELL；放不下時不再縮小，改讓直式板區內部捲動。
   */
  const MIN_CELL = 44;
  const MAX_CELL = 64;

  function fitBoard() {
    const area = $("boardArea");
    if (!area || !state.plan) return;
    const plan = state.plan;
    const H = area.clientHeight - 14;
    const W = area.clientWidth - 10;
    const gap = 6;
    const cellRows = plan.rows.length;
    const lines = plan.rows.filter((r) => r.line).length;
    const units = cellRows + 0.6 + lines * 0.16;
    const fixed = (cellRows + lines + 1) * gap;
    // 除數是一個緊密的數字（每位約 0.62 格寬）
    let wUnits = plan.divisorLen * 0.62 + 0.3 + plan.nCols + 1.4;
    const wFixed = (plan.nCols + 3) * 4;
    let byH = (H - fixed) / units;
    if (verifyActive()) {
      const checkRows = state.check.rows.length;
      const withCheck =
        (H - fixed - 24 - checkRows * gap) / (units + checkRows + 0.6);
      // 驗算列塞得下就一起算；塞不下就只以直式為準，驗算列捲動到下方
      if (withCheck >= MIN_CELL) byH = withCheck;
      // 驗算列左邊的算式約 0.3 格／字
      const leftChars = Math.max(...state.check.rows.map((r) => r.left.length));
      wUnits = Math.max(wUnits, leftChars * 0.3 + state.check.width + 0.4);
    }
    const byW = (W - wFixed) / wUnits;
    const cell = Math.floor(Math.max(MIN_CELL, Math.min(MAX_CELL, byH, byW)));
    area.style.setProperty("--cell", cell + "px");
    revealCurrent();
  }

  // ---------- 步驟區 ----------
  function setHint(step) {
    const hintBox = $("hintBox");
    hintBox.textContent = step ? step.hint : "";
    hintBox.classList.toggle("show", state.hintOpen && !!step);
    const hintBtn = $("hintBtn");
    hintBtn.textContent = state.hintOpen ? "收起提示" : "給我一個提示";
    hintBtn.classList.toggle("active", state.hintOpen);
  }

  function totalSteps() {
    return state.plan.steps.length + (verifyActive() ? state.check.steps.length : 0);
  }

  function doneSteps() {
    if (state.phase === "div") return state.idx;
    if (state.phase === "check") return state.plan.steps.length + state.cidx;
    return totalSteps();
  }

  function renderProgress() {
    const total = totalSteps();
    const doneN = doneSteps();
    const shown = state.phase === "done" ? total : Math.min(doneN + 1, total);
    $("stepLabel").textContent = `第 ${shown} 步，共 ${total} 步`;
    $("progressFill").style.width = `${(doneN / total) * 100}%`;
  }

  function renderStep() {
    const step = currentStep();
    if (!step) return;
    $("stepActive").classList.remove("hidden");
    $("stepComplete").classList.add("hidden");
    renderProgress();
    $("phaseLabel").textContent = step.phase;
    $("questionText").textContent = step.question;
    $("boardPrompt").textContent = step.prompt;
    const fb = $("feedback");
    fb.className = "feedback";
    fb.textContent = "";
    setHint(step);
    document.querySelectorAll(".key").forEach((k) => {
      k.disabled = false;
      k.classList.remove("wrong", "correct");
    });
    state.locked = false;
    state.wrongFlash = null;
    renderBoard();
  }

  function onDigit(n, btn) {
    if (state.locked) return;
    const step = currentStep();
    if (!step) return;
    btn = btn || document.querySelector(`.key[data-digit="${n}"]`);
    const fb = $("feedback");

    if (n !== step.expected) {
      fb.className = "feedback show wrong";
      fb.textContent = Core.feedbackFor(step, n);
      $("footerNote").textContent = "按錯沒關係，可以再按一次；需要的話點「給我一個提示」。";
      if (btn) {
        btn.classList.add("wrong");
        later(() => btn.classList.remove("wrong"), WRONG_FLASH_MS);
      }
      state.wrongFlash = n;
      renderBoard();
      const flashedStep = step;
      later(() => {
        if (currentStep() === flashedStep && !state.locked) {
          state.wrongFlash = null;
          renderBoard();
        }
      }, WRONG_FLASH_MS);
      return;
    }

    state.locked = true;
    state.wrongFlash = null;
    state.values[stepKey(step)] = n;
    if (btn) btn.classList.add("correct");
    document.querySelectorAll(".key").forEach((k) => (k.disabled = true));
    fb.className = "feedback show correct";
    fb.textContent = step.okText || "答對了！";
    renderBoard();
    later(advance, ADVANCE_MS);
  }

  function advance() {
    state.hintOpen = false;
    if (state.phase === "div") {
      state.idx += 1;
      if (state.idx < state.plan.steps.length) return renderStep();
      if (verifyActive()) return startCheck();
      return showComplete();
    }
    if (state.phase === "check") {
      state.cidx += 1;
      if (state.cidx < state.check.steps.length) return renderStep();
      state.checkDone = true;
      return showComplete();
    }
  }

  function startCheck() {
    state.phase = "check";
    state.cidx = 0;
    state.hintOpen = false;
    fitBoard();
    renderStep();
  }

  function showComplete() {
    state.phase = "done";
    state.locked = true;
    const { dividend, divisor, quotient, remainder } = state.plan;
    $("boardPrompt").textContent = "完成的直式";
    renderBoard();
    renderProgress();
    $("stepActive").classList.add("hidden");
    $("stepComplete").classList.remove("hidden");
    $("completeTitle").textContent =
      remainder === 0 ? "整除！每個數字都放對位置" : "每個數字都放對位置";
    $("completeRem").textContent =
      remainder === 0
        ? "餘數是 0，剛好分完（整除）✓"
        : `餘數 ${remainder} 比除數 ${divisor} 小 ✓`;
    $("completeEq").textContent = state.plan.equation;
    const chk = $("completeCheck");
    if (state.checkDone) {
      chk.textContent =
        remainder === 0
          ? `驗算：${divisor} × ${quotient} = ${dividend} ✓`
          : `驗算：${divisor} × ${quotient} + ${remainder} = ${dividend} ✓`;
      chk.classList.remove("hidden");
    } else {
      chk.classList.add("hidden");
    }
    let note = "商對齊被除數的位值；最高位不夠商不寫，中間或末尾不夠商要商 0 佔位。";
    if (!state.checkDone && state.level >= Core.VERIFY_MIN_LEVEL) {
      note += "想檢查的話，打開上方「驗算」。";
    }
    $("completeNote").textContent = note;
    $("footerNote").textContent = "完成了！按「再練一次」或 ↻ 換一題。";
  }

  function startProblem(level) {
    clearTimers();
    state.level = level;
    let p = Core.generate(level, state.mode);
    for (let i = 0; i < 6 && `${p.dividend}/${p.divisor}` === state.lastProblem; i++) {
      p = Core.generate(level, state.mode);
    }
    state.lastProblem = `${p.dividend}/${p.divisor}`;
    state.plan = Core.buildSteps(p.dividend, p.divisor);
    state.check = Core.buildCheckSteps(p.dividend, p.divisor);
    state.phase = "div";
    state.idx = 0;
    state.cidx = 0;
    state.checkDone = false;
    state.values = {};
    state.hintOpen = false;
    state.locked = false;
    state.wrongFlash = null;
    $("problemPill").textContent = `${p.dividend} ÷ ${p.divisor} = ?`;
    $("footerNote").textContent =
      "每個題型會隨機出題。用數字鍵填藍框；點錯沒關係，可以再按一次。";
    syncControls();
    fitBoard();
    renderStep();
  }

  function toggleVerify() {
    if (state.level < Core.VERIFY_MIN_LEVEL) return;
    state.verify = !state.verify;
    syncControls();
    fitBoard();
    if (state.phase === "done" && verifyActive() && !state.checkDone) {
      clearTimers();
      return startCheck();
    }
    if (state.phase === "check" && !verifyActive()) {
      clearTimers();
      return showComplete();
    }
    if (state.phase === "done") renderProgress();
    else if (!state.locked) renderProgress();
  }

  // ---------- 平板：鎖捲動（直向橫向都可用） ----------
  function installScrollGuards() {
    document.addEventListener(
      "touchmove",
      (e) => {
        let node = e.target;
        while (node && node !== document.body && node !== document.documentElement) {
          if (node.classList && node.classList.contains("scroll-ok")) {
            const style = window.getComputedStyle(node);
            const canY =
              (style.overflowY === "auto" || style.overflowY === "scroll") &&
              node.scrollHeight > node.clientHeight + 1;
            if (canY) return;
            break;
          }
          node = node.parentNode;
        }
        e.preventDefault();
      },
      { passive: false }
    );

    const blockGesture = (e) => e.preventDefault();
    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });
    document.addEventListener("gestureend", blockGesture, { passive: false });

    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      },
      { passive: false }
    );
  }

  function init() {
    renderLevelList();
    renderModeSeg();
    renderKeypad();

    $("hintBtn").addEventListener("click", () => {
      state.hintOpen = !state.hintOpen;
      setHint(currentStep());
    });
    $("againBtn").addEventListener("click", () => startProblem(state.level));
    $("refreshBtn").addEventListener("click", () => startProblem(state.level));
    $("verifyBtn").addEventListener("click", toggleVerify);

    // 實體鍵盤（外接鍵盤或電腦測試）
    document.addEventListener("keydown", (e) => {
      if (/^[0-9]$/.test(e.key)) onDigit(Number(e.key));
    });

    installScrollGuards();
    window.addEventListener("resize", fitBoard);
    window.addEventListener("orientationchange", () => later(fitBoard, 200));
    if (window.ResizeObserver) {
      new ResizeObserver(fitBoard).observe($("boardArea"));
    }

    startProblem(0);
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
