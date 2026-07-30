/* ============================================================
   UI layer — rendering, the identity picker, and the pay buttons.
   All the money logic lives in app.js.
   ============================================================ */
import {
  PEOPLE, RENT, DUE_DAY,
  BILLS, BILLS_FILE, PAYMENTS, BILL_PAYERS, OWED_LEAD_DAYS, PAY_UNTIL_DAY, KINDS,
  draft, setDraft, mergeBills, DRAFT_KEY, saveDraft,
  payDraft, setPayDraft, savePayDraft,
  money, r2, monthLabel, dateLabel, TODAY,
  utilitiesFor, buildSchedule, computeBalances, isPerson,
  initStore, storeMode,
} from "./app.js";

const el = (id) => document.getElementById(id);

/* ---------- session snapshot: what things looked like on page load ---------- */
const clone = (x) => JSON.parse(JSON.stringify(x));
let SESSION0 = { draft: {}, pay: [] };
const sessionDirty = () =>
  JSON.stringify(draft) !== JSON.stringify(SESSION0.draft) ||
  JSON.stringify(payDraft) !== JSON.stringify(SESSION0.pay);

/* ---------- who am I ---------- */
const ME_KEY = "rent-tracker-me";
let ME = localStorage.getItem(ME_KEY);
if (!PEOPLE.includes(ME)) ME = null;

function setMe(name) {
  ME = name;
  localStorage.setItem(ME_KEY, name);
  el("sheet").classList.remove("on");
  render();
}

el("pick").innerHTML = PEOPLE.map((p) =>
  `<button data-p="${p}"><span class="avatar">${p[0]}</span>${p}</button>`).join("");
el("pick").querySelectorAll("button").forEach((b) => (b.onclick = () => setMe(b.dataset.p)));
el("who-btn").onclick = () => el("sheet").classList.add("on");
el("sheet").onclick = (e) => {
  if (e.target === el("sheet") && ME) el("sheet").classList.remove("on");
};

/* ---------- payment buttons ---------- */
function logPayment(by, amount, to, note, covers) {
  const entry = { date: new Date().toISOString().slice(0, 10), by, amount: r2(amount), to, note };
  if (covers) entry.covers = covers;
  payDraft.push(entry);
  savePayDraft();
  render();
}

function payButton({ label, amount, by, to, note, covers, cls = "" }) {
  return `<button class="btn ${cls}" data-by="${by}" data-amt="${r2(amount)}"
    data-to="${to}" data-note="${note}"
    ${covers ? `data-covers='${JSON.stringify(covers)}'` : ""}
    ${amount <= 0.005 ? "disabled" : ""}>
    <span>${label}</span><b>${money(Math.max(amount, 0))}</b></button>`;
}

function wirePayButtons(root) {
  root.querySelectorAll(".btn[data-amt]").forEach((b) => {
    b.onclick = () => {
      const amt = Number(b.dataset.amt);
      if (!(amt > 0)) return;
      const covers = b.dataset.covers ? JSON.parse(b.dataset.covers) : null;
      const dest = isPerson(b.dataset.to) ? b.dataset.to : b.dataset.to.toLowerCase();
      const extra = covers ? "\n\nThe others' shares get logged as owed to you." : "";
      if (!confirm(`Log ${money(amt)} paid by ${b.dataset.by} to ${dest}?${extra}`)) return;
      logPayment(b.dataset.by, amt, b.dataset.to, b.dataset.note, covers);
    };
  });
}

/* ---------- render ---------- */
export function render() {
  const schedule = buildSchedule();
  const { balances, moves, iou } = computeBalances(schedule);
  const bal = Object.fromEntries(balances.map((b) => [b.name, b]));
  const nextRow = schedule.find((r) => r.dueDate >= TODAY);

  /* undo-this-visit button */
  el("undo-btn").classList.toggle("on", sessionDirty());

  /* footer note reflects how changes are being saved */
  el("mode-note").innerHTML = storeMode() === "server"
    ? "✓ Changes save automatically and everyone sees them. Rents and lease dates live in <code>data.js</code>."
    : "Changes are saved on this device only. To share them, add the free Redis store on Vercel (Storage tab) — or paste edits into <code>data.js</code> and push.";

  /* identity chip */
  el("who-initial").textContent = ME ? ME[0] : "?";
  el("who-name").textContent = ME || "Who are you?";
  if (!ME) el("sheet").classList.add("on");
  el("pick").querySelectorAll("button").forEach((b) =>
    b.classList.toggle("on", b.dataset.p === ME));

  /* hero */
  if (ME) {
    const out = bal[ME].out;
    el("my-amt").textContent = money(Math.abs(out));
    el("my-amt").className = "big num " + (out > 0.005 ? "neg" : out < -0.005 ? "pos" : "");
    el("my-state").textContent =
      out > 0.005 ? "you owe" : out < -0.005 ? "you're owed" : "all square";
  } else {
    el("my-amt").textContent = "—";
    el("my-amt").className = "big num";
    el("my-state").textContent = "pick your name to see your balance";
  }

  if (nextRow) {
    const days = Math.round((nextRow.dueDate - TODAY) / 86400000);
    const mine = ME ? nextRow.per[ME] : null;
    el("next-det").innerHTML =
      `<b>Next due ${dateLabel(nextRow.dueDate)}</b> — ${
        days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}<br>` +
      [nextRow.rentMonth ? `${monthLabel(nextRow.rentMonth)} rent` : null,
       nextRow.utilMonth ? `${monthLabel(nextRow.utilMonth)} utilities` : null]
        .filter(Boolean).join(" + ") +
      `<br><b>${money(nextRow.total)}</b> for the house` +
      (mine ? ` · <b>${money(mine.rent + mine.util)}</b> yours` : "");
  } else {
    el("next-det").innerHTML = "<b>No upcoming due dates.</b>";
  }

  /* everyone */
  el("cards").innerHTML = balances.map((b) => {
    const state = b.out > 0.005 ? "owes" : b.out < -0.005 ? "ahead" : "even";
    return `<div class="card ${state}${b.name === ME ? " me" : ""}">
      <div class="card-name">${b.name}${b.name === ME ? " <em>YOU</em>" : ""}</div>
      <div class="card-amt num">${money(Math.abs(b.out))}</div>
      <div class="card-state">${
        state === "owes" ? "owes" : state === "ahead" ? "is owed" : "all square"}</div>
    </div>`;
  }).join("");

  /* ---- PAY: the two outside bills ---- */
  const who = ME || PEOPLE[0];

  /* The payable cycle: window runs from OWED_LEAD_DAYS before the due date
     through the PAY_UNTIL_DAY of the following month (28th → next 7th). */
  const winStart = (r) => {
    const d = new Date(r.dueDate);
    d.setDate(d.getDate() - OWED_LEAD_DAYS);
    return d;
  };
  const winEnd = (r) =>
    new Date(r.dueDate.getFullYear(), r.dueDate.getMonth() + 1, PAY_UNTIL_DAY, 23, 59, 59);
  const payRow = schedule.find((r) => TODAY >= winStart(r) && TODAY <= winEnd(r)) || nextRow;

  const per = payRow ? payRow.per
    : Object.fromEntries(PEOPLE.map((p) => [p, { rent: 0, util: 0, water: 0, other: 0 }]));

  const groups = [
    {
      title: "Rent + water", to: "Landlord", payer: BILL_PAYERS.rentWater,
      sub: payRow?.rentMonth
        ? `${monthLabel(payRow.rentMonth)} rent${
            payRow.utilMonth ? ` · ${monthLabel(payRow.utilMonth)} water` : ""}`
        : "nothing due",
      per: Object.fromEntries(PEOPLE.map((p) => [p, r2(per[p].rent + per[p].water)])),
    },
    {
      title: "Other utilities", to: "Utility co", payer: BILL_PAYERS.otherUtilities,
      sub: `wifi · gas · electric${payRow?.utilMonth ? ` — ${monthLabel(payRow.utilMonth)}` : ""}`,
      per: Object.fromEntries(PEOPLE.map((p) => [p, r2(per[p].other)])),
    },
  ];

  /* Once the whole-house payment is logged for this cycle, the button
     hides until the next window opens. */
  const cycleStart = payRow ? winStart(payRow) : null;
  const windowOpen = !!payRow && TODAY >= winStart(payRow) && TODAY <= winEnd(payRow);
  const isCyclePay = (g) => (p) =>
    p.covers && p.to === g.to && new Date(p.date + "T00:00:00") >= cycleStart;
  const paidThisCycle = (g) =>
    cycleStart && [...PAYMENTS, ...payDraft].some(isCyclePay(g));
  /* index in payDraft of this cycle's whole-house payment (−1 if it's baked into data.js) */
  const cyclePayIndex = (g) => (cycleStart ? payDraft.findIndex(isCyclePay(g)) : -1);

  /* each bill card only shows for the person who fronts it */
  el("pay-actions").innerHTML = groups
    .filter((g) => !ME || g.payer === ME)
    .map((g) => {
      const house = r2(PEOPLE.reduce((s, p) => s + g.per[p], 0));
      const isMine = g.payer === who;
      const paid = paidThisCycle(g);
      const action = !isMine
        ? `<div class="act-to" style="margin-top:12px">${g.payer} fronts this bill</div>`
        : paid
        ? `<div class="act-btns paid-pair">
             <button class="btn done" disabled>Paid ✓ — back next month</button>
             ${cyclePayIndex(g) >= 0
               ? `<button class="btn sec undo-house" data-i="${cyclePayIndex(g)}">Undo</button>`
               : ""}
           </div>`
        : windowOpen
        ? `<div class="act-btns">
            ${payButton({ label: "Pay for the whole house", amount: house, by: g.payer, to: g.to,
                          note: `${g.title} — whole house`, covers: g.per })}
           </div>`
        : `<div class="act-to" style="margin-top:12px">Nothing to pay yet — opens ${
            cycleStart ? dateLabel(cycleStart) : "next cycle"}</div>`;
      return `<div class="act">
        <div class="act-top">
          <div>
            <div class="act-title">${g.title}</div>
            <div class="act-to">to ${g.to} · ${g.sub}</div>
          </div>
          <div class="act-amt num">${money(house)}<i>whole house</i></div>
        </div>
        <div class="act-split">${PEOPLE.map((p) =>
          `<span class="chip">${p} ${money(g.per[p])}</span>`).join("")}</div>
        ${action}
      </div>`;
    }).join("") ||
    `<div class="act">
       <div class="act-title">No bills for you to front</div>
       <div class="act-to">${groups.map((g) => `${g.payer} pays ${g.title.toLowerCase()}`).join(" · ")}
         — your part shows under Settle up once they've paid</div>
     </div>`;
  wirePayButtons(el("pay-actions"));
  el("pay-actions").querySelectorAll(".undo-house").forEach((b) => {
    b.onclick = () => {
      const p = payDraft[+b.dataset.i];
      if (!p) return;
      if (!confirm(`Undo the ${money(p.amount)} whole-house payment by ${p.by}?`)) return;
      payDraft.splice(+b.dataset.i, 1);
      savePayDraft();
      render();
    };
  });

  /* ---- settle up with roommates ---- */
  const mineMoves = moves.filter((m) => m.from === who);
  const otherMoves = moves.filter((m) => m.from !== who);
  el("settle-actions").innerHTML =
    (mineMoves.length
      ? `<div class="act">
           <div class="act-top"><div>
             <div class="act-title">Pay a roommate back</div>
             <div class="act-to">they covered part of your share</div>
           </div></div>
           <div class="act-btns">${mineMoves.map((m) => payButton({
             label: `Pay ${m.to}`, amount: m.amt, by: who, to: m.to,
             note: `Settle up with ${m.to}` })).join("")}</div>
         </div>`
      : `<div class="act">
           <div class="act-title">Nothing to settle</div>
           <div class="act-to">you don't owe any roommate right now</div>
         </div>`) +
    (otherMoves.length
      ? `<div class="box" style="margin-top:12px">${otherMoves.map((m) =>
          `<div class="move"><span style="font-weight:400"><b>${m.from}</b> pays <b>${m.to}</b></span>
           <span>${money(m.amt)}</span></div>`).join("")}</div>`
      : "");
  wirePayButtons(el("settle-actions"));

  el("pay-bar").className =
    storeMode() === "local" && payDraft.length ? "draftbar on" : "draftbar";

  /* ---- bills editor ---- */
  const months = Object.keys(BILLS).sort();
  const openNow = new Set([...document.querySelectorAll(".bill[open]")].map((d) => d.dataset.mk));
  el("draft-bar").className =
    storeMode() === "local" && Object.keys(draft).length ? "draftbar on" : "draftbar";

  el("bills").innerHTML = months.map((mk) => {
    const u = utilitiesFor(mk);
    const missing = KINDS.filter((k) => (BILLS[mk] || {})[k] == null);
    const edited = draft[mk] || {};
    return `<details class="bill" data-mk="${mk}" ${openNow.has(mk) ? "open" : ""}>
      <summary><span>${monthLabel(mk)}${Object.keys(edited).length ? "<em>edited</em>" : ""}</span>
        <span class="bill-total num">${u.hasAny ? money(u.total) : "—"}${
          missing.length ? `<i>${missing.length} not billed</i>` : ""}</span></summary>
      <div class="bill-body">
        ${KINDS.map((k) => {
          const v = (BILLS[mk] || {})[k];
          return `<label class="erow${edited[k] !== undefined ? " ed" : ""}">
            <span>${k}</span>
            <span class="inp">$<input type="number" inputmode="decimal" step="0.01" min="0"
              placeholder="—" value="${v == null ? "" : v}" data-mk="${mk}" data-kind="${k}"></span>
          </label>`;
        }).join("")}
        ${u.hasAny ? `<div class="row split">${PEOPLE.map((p) =>
          `<span>${p}<b>${money(u.share[p])}</b></span>`).join("")}</div>` : ""}
        ${u.lines.map((l) => `<div class="hint">${l.kind}: ${l.note}</div>`).join("")}
      </div>
    </details>`;
  }).join("");

  el("bills").querySelectorAll("input").forEach((inp) => {
    inp.onchange = () => {
      const { mk, kind } = inp.dataset;
      const raw = inp.value.trim();
      draft[mk] = draft[mk] || {};
      draft[mk][kind] = raw === "" ? null : Number(raw);
      const original = (BILLS_FILE[mk] || {})[kind] ?? null;
      if (draft[mk][kind] === original) delete draft[mk][kind];
      if (!Object.keys(draft[mk]).length) delete draft[mk];
      saveDraft();
      mergeBills();
      render();
    };
  });

  /* ---- schedule ---- */
  el("schedule").innerHTML = schedule.map((row) => `
    <div class="srow ${row.isPast ? "past" : row === nextRow ? "now" : ""}">
      <div class="sdate">${dateLabel(row.dueDate)}<i>${
        [row.rentMonth ? `${monthLabel(row.rentMonth)} rent` : null,
         row.utilMonth ? `${monthLabel(row.utilMonth)} utilities` : null]
          .filter(Boolean).join(" + ")}</i></div>
      <div class="samt">${money(row.total)}<i>${
        row.isPast ? "past" : row.isDue ? "due now" : "upcoming"}</i></div>
    </div>`).join("");

  /* ---- history ---- */
  el("log").innerHTML =
    payDraft.map((p, i) => `
      <div class="prow new">
        <div><b>${p.by}</b> → ${isPerson(p.to) ? p.to : p.to.toLowerCase()}<i>${p.note}${
          storeMode() === "local" ? " · not in data.js yet" : ` · ${p.date}`}</i></div>
        <div class="pamt">${money(p.amount)}<button class="undo" data-i="${i}">undo</button></div>
      </div>`).reverse().join("") +
    [...PAYMENTS].reverse().map((p) => `
      <div class="prow">
        <div><b>${p.by}</b> → ${isPerson(p.to) ? p.to : p.to.toLowerCase()}<i>${p.note || ""}</i></div>
        <div class="pamt">${money(p.amount)}<i>${p.date}</i></div>
      </div>`).join("");
  el("log").querySelectorAll(".undo").forEach((b) => {
    b.onclick = () => { payDraft.splice(+b.dataset.i, 1); savePayDraft(); render(); };
  });

  /* ---- admin: every transaction, deletable ---- */
  el("admin-list").innerHTML =
    (PAYMENTS.map((p) => `
      <div class="arow locked">
        <span>${p.date} — ${p.by} → ${p.to} — ${p.note || ""}</span>
        <span>${money(p.amount)} · in data.js</span>
      </div>`).join("")) +
    (payDraft.map((p, i) => `
      <div class="arow">
        <span>${p.date} — ${p.by} → ${p.to} — ${p.note || ""}</span>
        <span><button class="adel" data-i="${i}">delete</button>${money(p.amount)}</span>
      </div>`).join("")) ||
    `<div class="arow">no transactions</div>`;
  el("admin-list").querySelectorAll(".adel").forEach((b) => {
    b.onclick = () => {
      const p = payDraft[+b.dataset.i];
      if (!confirm(`Delete: ${p.by} → ${p.to} ${money(p.amount)}?`)) return;
      payDraft.splice(+b.dataset.i, 1);
      savePayDraft();
      render();
    };
  });

  el("settle").innerHTML = moves.length
    ? moves.map((m) => `<div class="move"><span style="font-weight:400"><b>${m.from}</b> pays
        <b>${m.to}</b></span><span>${money(m.amt)}</span></div>`).join("")
    : `<div class="empty">Everyone's square 🎉</div>`;

  el("next-breakdown").innerHTML = nextRow
    ? PEOPLE.map((p) => {
        const x = nextRow.per[p];
        return `<div class="move"><span style="font-weight:500">${p}</span>
                  <span>${money(x.rent + x.util)}</span></div>
                <div class="sub">rent ${money(x.rent)} · water ${money(x.water)} · other ${
                  money(x.other)}</div>`;
      }).join("")
    : `<div class="empty">Nothing upcoming.</div>`;

  /* ---- MATH: the numbers, explained — kept deliberately spare ---- */
  el("math").innerHTML = `
    <h2 class="tight">How it works</h2>
    <div class="box">
      <div class="mrule"><span>📅</span>Everything is due the ${DUE_DAY}th: next month's rent
        + last month's utilities.</div>
      <div class="mrule"><span>➗</span>Utilities split evenly ${PEOPLE.length} ways. Rent:
        ${PEOPLE.map((p) => `${p} ${money(RENT[p])}`).join(" · ")}.</div>
      <div class="mrule"><span>💳</span>${BILL_PAYERS.rentWater} fronts rent + water,
        ${BILL_PAYERS.otherUtilities} fronts the rest — your share becomes what you owe them.</div>
      <div class="mrule"><span>🔁</span>Debts get netted so everyone makes at most one payment.</div>
    </div>

    <h2>Balances</h2>
    <div class="box">
      ${balances.map((b) => `
        <div class="mbal">
          <div class="mbal-top">
            <span>${b.name}</span>
            <b class="${b.out > 0.005 ? "neg" : b.out < -0.005 ? "pos" : ""}">${
              b.out > 0.005 ? money(b.out) : b.out < -0.005 ? money(-b.out) : "—"}
              <i>${b.out > 0.005 ? "owes" : b.out < -0.005 ? "is owed" : "square"}</i></b>
          </div>
          <div class="meq num">${money(b.owed)} owed − ${money(b.paid)} paid${
            r2(b.out - b.outside) !== 0
              ? ` ${b.out - b.outside > 0 ? "+" : "−"} ${money(Math.abs(r2(b.out - b.outside)))} roommates`
              : ""}</div>
        </div>`).join("")}
    </div>

    <h2>Settle up</h2>
    <div class="box">
      ${moves.length ? moves.map((m) => `
        <div class="mflow num"><b>${m.from}</b><span class="arr">→</span><b>${m.to}</b>
          <span class="amt">${money(m.amt)}</span></div>`).join("")
      : `<div class="empty">Everyone's square 🎉</div>`}
    </div>
    <p class="note">Live — recalculates whenever anyone logs a payment or edits a bill.
      The History tab has every transaction.</p>`;
}

/* ---------- paste-ready snippets for data.js ---------- */
function billsSnippet() {
  const body = Object.keys(BILLS).sort().map((mk) => {
    const kept = KINDS.filter((k) => BILLS[mk][k] != null)
      .map((k) => `${k}: ${Number(BILLS[mk][k]).toFixed(2)}`).join(", ");
    return `  "${mk}": { ${kept} },`;
  }).join("\n");
  return `export const BILLS = {\n${body}\n};`;
}
function paySnippet() {
  return payDraft.map((p) => {
    const covers = p.covers
      ? `,\n    covers: { ${Object.entries(p.covers).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join(", ")} }`
      : "";
    return `  { date: "${p.date}", by: "${p.by}", amount: ${p.amount.toFixed(2)}, to: "${p.to}", note: "${p.note}"${covers} },`;
  }).join("\n");
}
async function copyText(btn, text) {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied ✓"; }
  catch { prompt("Copy this into data.js:", text); }
  setTimeout(() => (btn.textContent = label), 1800);
}

el("copy-draft").onclick = (e) => copyText(e.currentTarget, billsSnippet());
el("copy-pay").onclick = (e) => copyText(e.currentTarget, paySnippet());
el("reset-draft").onclick = () => {
  if (!confirm("Discard your local bill edits?")) return;
  setDraft({});
  saveDraft();
  mergeBills();
  render();
};
el("reset-pay").onclick = () => {
  if (!confirm("Discard the payments logged on this device?")) return;
  setPayDraft([]);
  savePayDraft();
  render();
};

/* ---------- admin bulk actions ---------- */
el("admin-clear-bills").onclick = () => {
  if (!confirm("Clear ALL bill edits? Bills go back to what's in data.js.")) return;
  setDraft({});
  saveDraft();
  mergeBills();
  render();
};
el("admin-clear-pays").onclick = () => {
  if (!confirm("Delete ALL logged payments? (Payments written in data.js stay.)")) return;
  if (!confirm("Really sure? This affects everyone if shared storage is on.")) return;
  setPayDraft([]);
  savePayDraft();
  render();
};

/* ---------- tabs + sticky header ---------- */
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === t));
    document.querySelectorAll(".panel").forEach((x) =>
      x.classList.toggle("on", x.id === "panel-" + t.dataset.p));
  };
});
addEventListener("scroll",
  () => el("topbar").classList.toggle("stuck", scrollY > 4), { passive: true });

/* ---------- undo everything from this visit ---------- */
el("undo-btn").onclick = () => {
  if (!confirm("Undo all bill edits and logged payments from this visit?\n\nEverything goes back to how it was when you opened the page.")) return;
  setDraft(clone(SESSION0.draft));
  saveDraft();
  mergeBills();
  setPayDraft(clone(SESSION0.pay));
  savePayDraft();
  render();
};

/* ---------- light / dark toggle: auto → light → dark → auto ---------- */
const THEME_KEY = "rent-tracker-theme";
function themeIcon() {
  const t = localStorage.getItem(THEME_KEY);
  el("theme-btn").textContent = t === "light" ? "☀️" : t === "dark" ? "🌙" : "◐";
  el("theme-btn").title =
    t === "light" ? "Light — tap for dark" : t === "dark" ? "Dark — tap for auto" : "Auto — tap for light";
}
el("theme-btn").onclick = () => {
  const cur = localStorage.getItem(THEME_KEY);
  const next = cur === "light" ? "dark" : cur === "dark" ? null : "light";
  if (next) {
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
  } else {
    localStorage.removeItem(THEME_KEY);
    delete document.documentElement.dataset.theme;
  }
  themeIcon();
};
themeIcon();

/* ---------- boot: load shared state (if the server store exists), then render ---------- */
initStore().then(() => {
  SESSION0 = { draft: clone(draft), pay: clone(payDraft) };
  render();
});

/* keep devices in sync: refetch when the tab regains focus, when the page is
   restored from the back/app-switcher cache, and every 30s while visible */
const resync = () => {
  if (storeMode() !== "server" || document.hidden) return;
  /* don't yank the keyboard away mid-edit */
  if (document.activeElement?.tagName === "INPUT") return;
  initStore().then(render);
};
document.addEventListener("visibilitychange", resync);
window.addEventListener("pageshow", (e) => { if (e.persisted) resync(); });
setInterval(resync, 30_000);
