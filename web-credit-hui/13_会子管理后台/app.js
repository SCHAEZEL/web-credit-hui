const STORAGE_KEY = "web-credit-hui-admin-v1";

const state = loadState();

const typeLabel = {
  fixed: "固定轮会",
  bid: "标会",
  draw: "摇会",
};

const riskLabel = {
  normal: "正常",
  watch: "关注",
  high: "高风险",
};

const paymentStatusLabel = {
  unpaid: "未缴",
  partial: "部分",
  paid: "已缴",
};

const views = {
  dashboard: "仪表盘",
  hui: "会局管理",
  members: "会员管理",
  payments: "收缴登记",
  payouts: "得会记录",
  risk: "风险预警",
  reports: "报表备份",
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {
      activeHuiId: "",
      members: [],
      huis: [],
      payments: [],
      payouts: [],
    };
  }
  try {
    const parsed = JSON.parse(saved);
    return {
      activeHuiId: parsed.activeHuiId || "",
      members: parsed.members || [],
      huis: parsed.huis || [],
      payments: parsed.payments || [],
      payouts: parsed.payouts || [],
    };
  } catch {
    return {
      activeHuiId: "",
      members: [],
      huis: [],
      payments: [],
      payouts: [],
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function activeHui() {
  return state.huis.find((hui) => hui.id === state.activeHuiId) || state.huis[0] || null;
}

function activeMembers() {
  const hui = activeHui();
  if (!hui) return [];
  return state.members.filter((member) => hui.memberIds.includes(member.id));
}

function getPayment(huiId, period, memberId) {
  return state.payments.find((item) => item.huiId === huiId && Number(item.period) === Number(period) && item.memberId === memberId);
}

function upsertPayment(record) {
  const index = state.payments.findIndex((item) => item.huiId === record.huiId && Number(item.period) === Number(record.period) && item.memberId === record.memberId);
  if (index >= 0) state.payments[index] = { ...state.payments[index], ...record };
  else state.payments.push({ id: id("pay"), ...record });
}

function getPayout(huiId, period) {
  return state.payouts.find((item) => item.huiId === huiId && Number(item.period) === Number(period));
}

function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

function render() {
  renderActiveHuiSelect();
  renderMemberPicker();
  renderStats();
  renderHuiTable();
  renderMemberTable();
  renderPaymentTable();
  renderPayoutForm();
  renderPayoutTable();
  renderRiskList();
  renderReport();
}

function renderActiveHuiSelect() {
  const select = document.querySelector("#activeHuiSelect");
  select.innerHTML = "";
  if (!state.huis.length) {
    select.innerHTML = `<option value="">暂无会局</option>`;
    return;
  }
  state.huis.forEach((hui) => {
    const option = document.createElement("option");
    option.value = hui.id;
    option.textContent = hui.name;
    select.appendChild(option);
  });
  if (!state.activeHuiId || !state.huis.some((hui) => hui.id === state.activeHuiId)) {
    state.activeHuiId = state.huis[0].id;
    saveState();
  }
  select.value = state.activeHuiId;
}

function renderMemberPicker() {
  const picker = document.querySelector("#huiMemberPicker");
  if (!state.members.length) {
    picker.innerHTML = `<div class="summary-row"><span>请先在会员管理中新增会员。</span></div>`;
    return;
  }
  picker.innerHTML = state.members.map((member) => `
    <label>
      <input type="checkbox" name="memberIds" value="${member.id}" checked>
      ${escapeHtml(member.name)}
    </label>
  `).join("");
}

function renderStats() {
  const hui = activeHui();
  const members = activeMembers();
  const period = Math.max(1, Number(document.querySelector("#paymentPeriod").value || 1));
  const due = hui ? members.length * Number(hui.contribution || 0) : 0;
  const paid = hui ? members.reduce((sum, member) => sum + Number(getPayment(hui.id, period, member.id)?.amount || 0), 0) : 0;
  const gap = Math.max(due - paid, 0);

  document.querySelector("#statHui").textContent = state.huis.length;
  document.querySelector("#statMembers").textContent = state.members.length;
  document.querySelector("#statDue").textContent = money(due);
  document.querySelector("#statGap").textContent = money(gap);

  document.querySelector("#activeHuiBadge").textContent = hui ? typeLabel[hui.type] : "未选择";
  document.querySelector("#huiSummary").innerHTML = hui ? `
    <div class="summary-row"><span>会局名称</span><strong>${escapeHtml(hui.name)}</strong></div>
    <div class="summary-row"><span>成员人数</span><strong>${members.length}</strong></div>
    <div class="summary-row"><span>总期数</span><strong>${hui.periods}</strong></div>
    <div class="summary-row"><span>每期缴款</span><strong>${money(hui.contribution)}</strong></div>
    <div class="summary-row"><span>预计资金池</span><strong>${money(members.length * Number(hui.contribution || 0))}</strong></div>
  ` : `<div class="summary-row"><span>暂无会局，请先新建会局。</span></div>`;

  const todos = buildTodos(hui, members, period);
  document.querySelector("#todoList").innerHTML = todos.length
    ? todos.map((todo) => `<div class="todo-item"><strong>${todo.title}</strong><br><span>${todo.detail}</span></div>`).join("")
    : `<div class="todo-item"><strong>暂无待处理事项</strong><br><span>当前会局没有明显缺口或缺失记录。</span></div>`;
}

function buildTodos(hui, members, period) {
  if (!hui) return [{ title: "先建立会局", detail: "创建会局后才能登记收缴和得会。" }];
  const todos = [];
  const missing = members.filter((member) => Number(getPayment(hui.id, period, member.id)?.amount || 0) < Number(hui.contribution || 0));
  if (missing.length) todos.push({ title: `第 ${period} 期还有 ${missing.length} 人未足额缴款`, detail: missing.map((member) => member.name).join("、") });
  if (!getPayout(hui.id, period)) todos.push({ title: `第 ${period} 期未登记得会`, detail: "建议在收齐款项后登记得会会员、实发金额和出价贴现。" });
  if (!hui.notes) todos.push({ title: "会局规则备注为空", detail: "建议写清缴款日、逾期处理、得会规则和争议处理方式。" });
  return todos;
}

function renderHuiTable() {
  const table = document.querySelector("#huiTable");
  table.innerHTML = state.huis.map((hui) => `
    <tr>
      <td><strong>${escapeHtml(hui.name)}</strong><br><span>${escapeHtml(hui.startDate || "")}</span></td>
      <td>${typeLabel[hui.type]}</td>
      <td>${hui.memberIds.length}</td>
      <td>${money(hui.contribution)}</td>
      <td>${statusBadge(hui.status)}</td>
      <td>
        <button class="link-button" data-action="set-hui" data-id="${hui.id}">设为当前</button>
        <button class="link-button" data-action="delete-hui" data-id="${hui.id}">删除</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="6">暂无会局。</td></tr>`;
}

function renderMemberTable() {
  const table = document.querySelector("#memberTable");
  table.innerHTML = state.members.map((member) => `
    <tr>
      <td><strong>${escapeHtml(member.name)}</strong><br><span>${escapeHtml(member.notes || "")}</span></td>
      <td>${escapeHtml(member.phone || "")}</td>
      <td>${escapeHtml(member.address || "")}</td>
      <td>${riskBadge(member.riskLevel)}</td>
      <td><button class="link-button" data-action="delete-member" data-id="${member.id}">删除</button></td>
    </tr>
  `).join("") || `<tr><td colspan="5">暂无会员。</td></tr>`;
}

function renderPaymentTable() {
  const hui = activeHui();
  const members = activeMembers();
  const periodInput = document.querySelector("#paymentPeriod");
  if (hui) periodInput.max = hui.periods;
  const period = Math.max(1, Number(periodInput.value || 1));
  const table = document.querySelector("#paymentTable");
  if (!hui) {
    table.innerHTML = `<tr><td colspan="7">请先创建并选择会局。</td></tr>`;
    return;
  }
  table.innerHTML = members.map((member) => {
    const payment = getPayment(hui.id, period, member.id) || {};
    const due = Number(hui.contribution || 0);
    const amount = Number(payment.amount || 0);
    const status = amount >= due ? "paid" : amount > 0 ? "partial" : "unpaid";
    return `
      <tr>
        <td>${escapeHtml(member.name)}</td>
        <td>${money(due)}</td>
        <td><input data-pay-field="amount" data-member-id="${member.id}" type="number" min="0" step="0.01" value="${payment.amount ?? ""}"></td>
        <td><input data-pay-field="date" data-member-id="${member.id}" type="date" value="${payment.date || ""}"></td>
        <td>
          <select data-pay-field="method" data-member-id="${member.id}">
            ${option("现金", payment.method)}
            ${option("转账", payment.method)}
            ${option("微信", payment.method)}
            ${option("支付宝", payment.method)}
            ${option("其他", payment.method)}
          </select>
        </td>
        <td>${paymentStatusBadge(status)}</td>
        <td><input data-pay-field="notes" data-member-id="${member.id}" value="${escapeAttr(payment.notes || "")}" placeholder="可填逾期原因"></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7">当前会局没有参与会员。</td></tr>`;
}

function renderPayoutForm() {
  const hui = activeHui();
  const select = document.querySelector("#payoutForm select[name='memberId']");
  const amount = document.querySelector("#payoutForm input[name='amount']");
  const date = document.querySelector("#payoutForm input[name='date']");
  select.innerHTML = activeMembers().map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join("");
  if (hui) amount.placeholder = `建议资金池 ${money(activeMembers().length * Number(hui.contribution || 0) - Number(hui.fee || 0))}`;
  if (!date.value) date.value = today();
}

function renderPayoutTable() {
  const hui = activeHui();
  const table = document.querySelector("#payoutTable");
  if (!hui) {
    table.innerHTML = `<tr><td colspan="6">请先选择会局。</td></tr>`;
    return;
  }
  const rows = state.payouts
    .filter((item) => item.huiId === hui.id)
    .sort((a, b) => Number(a.period) - Number(b.period))
    .map((item) => {
      const member = state.members.find((entry) => entry.id === item.memberId);
      return `
        <tr>
          <td>${item.period}</td>
          <td>${escapeHtml(member?.name || "未知")}</td>
          <td>${money(item.amount)}</td>
          <td>${money(item.bid)}</td>
          <td>${escapeHtml(item.date || "")}</td>
          <td><button class="link-button" data-action="delete-payout" data-id="${item.id}">删除</button></td>
        </tr>
      `;
    });
  table.innerHTML = rows.join("") || `<tr><td colspan="6">暂无得会记录。</td></tr>`;
}

function renderRiskList() {
  const hui = activeHui();
  const list = document.querySelector("#riskList");
  const risks = [];
  if (!hui) {
    list.innerHTML = `<div class="risk-item watch"><strong>暂无会局</strong><br><span>创建会局后才能生成风险预警。</span></div>`;
    return;
  }

  if (hui.memberIds.length < 3) {
    risks.push({ level: "watch", title: "成员数量较少", detail: "成员过少时互助分摊能力有限，建议明确兜底责任。" });
  }
  const highRiskMembers = activeMembers().filter((member) => member.riskLevel === "high");
  if (highRiskMembers.length) {
    risks.push({ level: "high", title: "存在高风险会员", detail: highRiskMembers.map((member) => member.name).join("、") });
  }
  for (let period = 1; period <= Number(hui.periods || 0); period += 1) {
    const missingCount = activeMembers().filter((member) => Number(getPayment(hui.id, period, member.id)?.amount || 0) < Number(hui.contribution || 0)).length;
    if (missingCount && period <= currentPeriodEstimate(hui)) {
      risks.push({ level: missingCount >= 2 ? "high" : "watch", title: `第 ${period} 期存在缴款缺口`, detail: `${missingCount} 人未足额缴款，应在得会前复核。` });
    }
  }
  const payoutMembers = state.payouts.filter((item) => item.huiId === hui.id).map((item) => item.memberId);
  const duplicates = payoutMembers.filter((memberId, index) => payoutMembers.indexOf(memberId) !== index);
  if (duplicates.length) {
    risks.push({ level: "high", title: "同一会员可能重复得会", detail: "请检查得会台账是否录入错误或存在特殊约定。" });
  }
  if (hui.type === "bid") {
    const aggressiveBids = state.payouts.filter((item) => item.huiId === hui.id && Number(item.bid || 0) > Number(hui.contribution || 0) * 0.3);
    if (aggressiveBids.length) {
      risks.push({ level: "watch", title: "标会出价偏高", detail: "高出价可能意味着融资压力较大，需复核资金用途和还款能力。" });
    }
  }

  list.innerHTML = risks.length
    ? risks.map((risk) => `<div class="risk-item ${risk.level}"><strong>${risk.title}</strong><br><span>${risk.detail}</span></div>`).join("")
    : `<div class="risk-item"><strong>未发现明显风险</strong><br><span>仍需定期核对现金、转账记录和会员确认。</span></div>`;
}

function currentPeriodEstimate(hui) {
  if (!hui.startDate) return 1;
  const start = new Date(`${hui.startDate}T00:00:00`);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  return Math.min(Math.max(months + 1, 1), Number(hui.periods || 1));
}

function renderReport() {
  const hui = activeHui();
  const lines = [];
  lines.push("会子管理后台报表");
  lines.push(`生成时间：${new Date().toLocaleString("zh-CN")}`);
  lines.push("");
  lines.push(`会局总数：${state.huis.length}`);
  lines.push(`会员总数：${state.members.length}`);
  if (hui) {
    lines.push("");
    lines.push(`当前会局：${hui.name}`);
    lines.push(`类型：${typeLabel[hui.type]}`);
    lines.push(`状态：${hui.status}`);
    lines.push(`成员数：${hui.memberIds.length}`);
    lines.push(`总期数：${hui.periods}`);
    lines.push(`每期缴款：${money(hui.contribution)}`);
    lines.push(`会首手续费：${money(hui.fee)}`);
    lines.push("");
    lines.push("得会记录：");
    const payouts = state.payouts.filter((item) => item.huiId === hui.id).sort((a, b) => Number(a.period) - Number(b.period));
    if (!payouts.length) lines.push("- 暂无");
    payouts.forEach((item) => {
      const member = state.members.find((entry) => entry.id === item.memberId);
      lines.push(`- 第 ${item.period} 期：${member?.name || "未知"}，实发 ${money(item.amount)}，出价/贴现 ${money(item.bid)}`);
    });
  }
  document.querySelector("#reportText").textContent = lines.join("\n");
}

function statusBadge(status) {
  const text = status === "active" ? "进行中" : status === "draft" ? "筹备中" : "已结束";
  const cls = status === "active" ? "muted" : status === "draft" ? "warn" : "muted";
  return `<span class="badge ${cls}">${text}</span>`;
}

function riskBadge(level) {
  const cls = level === "high" ? "danger" : level === "watch" ? "warn" : "muted";
  return `<span class="badge ${cls}">${riskLabel[level] || "正常"}</span>`;
}

function paymentStatusBadge(status) {
  const cls = status === "paid" ? "muted" : status === "partial" ? "warn" : "danger";
  return `<span class="badge ${cls}">${paymentStatusLabel[status]}</span>`;
}

function option(value, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.view}`).classList.add("active");
      document.querySelector("#viewTitle").textContent = views[button.dataset.view];
      render();
    });
  });

  document.querySelector("#activeHuiSelect").addEventListener("change", (event) => {
    state.activeHuiId = event.target.value;
    saveState();
    render();
  });

  document.querySelector("#memberForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.members.push({ id: id("member"), ...data, createdAt: new Date().toISOString() });
    saveState();
    event.target.reset();
    toast("会员已保存");
    render();
  });

  document.querySelector("#huiForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const memberIds = formData.getAll("memberIds");
    if (!memberIds.length) {
      toast("至少选择一名参与会员");
      return;
    }
    const hui = {
      id: id("hui"),
      name: formData.get("name"),
      type: formData.get("type"),
      startDate: formData.get("startDate"),
      periods: Number(formData.get("periods")),
      contribution: Number(formData.get("contribution")),
      fee: Number(formData.get("fee") || 0),
      status: formData.get("status"),
      notes: formData.get("notes"),
      memberIds,
      createdAt: new Date().toISOString(),
    };
    state.huis.push(hui);
    state.activeHuiId = hui.id;
    saveState();
    event.target.reset();
    toast("会局已保存");
    render();
  });

  document.querySelector("#huiTable").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    const idValue = event.target.dataset.id;
    if (action === "set-hui") {
      state.activeHuiId = idValue;
      saveState();
      toast("已切换当前会局");
      render();
    }
    if (action === "delete-hui" && confirm("确认删除该会局及其收缴、得会记录？")) {
      state.huis = state.huis.filter((hui) => hui.id !== idValue);
      state.payments = state.payments.filter((item) => item.huiId !== idValue);
      state.payouts = state.payouts.filter((item) => item.huiId !== idValue);
      if (state.activeHuiId === idValue) state.activeHuiId = "";
      saveState();
      render();
    }
  });

  document.querySelector("#memberTable").addEventListener("click", (event) => {
    if (event.target.dataset.action === "delete-member" && confirm("确认删除会员？相关会局不会自动重排。")) {
      const idValue = event.target.dataset.id;
      state.members = state.members.filter((member) => member.id !== idValue);
      state.huis.forEach((hui) => {
        hui.memberIds = hui.memberIds.filter((memberId) => memberId !== idValue);
      });
      state.payments = state.payments.filter((item) => item.memberId !== idValue);
      state.payouts = state.payouts.filter((item) => item.memberId !== idValue);
      saveState();
      render();
    }
  });

  document.querySelector("#paymentPeriod").addEventListener("input", render);

  document.querySelector("#paymentTable").addEventListener("change", (event) => {
    const field = event.target.dataset.payField;
    if (!field) return;
    const hui = activeHui();
    if (!hui) return;
    const period = Number(document.querySelector("#paymentPeriod").value || 1);
    const memberId = event.target.dataset.memberId;
    const existing = getPayment(hui.id, period, memberId) || {};
    const record = {
      huiId: hui.id,
      period,
      memberId,
      amount: Number(existing.amount || 0),
      date: existing.date || "",
      method: existing.method || "现金",
      notes: existing.notes || "",
    };
    record[field] = field === "amount" ? Number(event.target.value || 0) : event.target.value;
    upsertPayment(record);
    saveState();
    render();
  });

  document.querySelector("#markAllPaidBtn").addEventListener("click", () => {
    const hui = activeHui();
    if (!hui) return;
    const period = Number(document.querySelector("#paymentPeriod").value || 1);
    activeMembers().forEach((member) => {
      upsertPayment({
        huiId: hui.id,
        period,
        memberId: member.id,
        amount: Number(hui.contribution || 0),
        date: today(),
        method: "现金",
        notes: "",
      });
    });
    saveState();
    toast("本期已全部标记实收");
    render();
  });

  document.querySelector("#payoutForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const hui = activeHui();
    if (!hui) {
      toast("请先选择会局");
      return;
    }
    const data = Object.fromEntries(new FormData(event.target));
    const existing = getPayout(hui.id, Number(data.period));
    if (existing && !confirm("该期已有得会记录，是否覆盖？")) return;
    if (existing) state.payouts = state.payouts.filter((item) => item.id !== existing.id);
    state.payouts.push({
      id: id("payout"),
      huiId: hui.id,
      period: Number(data.period),
      memberId: data.memberId,
      bid: Number(data.bid || 0),
      amount: Number(data.amount || 0),
      date: data.date,
      notes: data.notes || "",
    });
    saveState();
    event.target.reset();
    toast("得会记录已保存");
    render();
  });

  document.querySelector("#payoutTable").addEventListener("click", (event) => {
    if (event.target.dataset.action === "delete-payout" && confirm("确认删除得会记录？")) {
      state.payouts = state.payouts.filter((item) => item.id !== event.target.dataset.id);
      saveState();
      render();
    }
  });

  document.querySelector("#seedBtn").addEventListener("click", () => {
    if (state.members.length || state.huis.length) {
      if (!confirm("载入样例会追加数据，不会清空现有台账。继续？")) return;
    }
    seedData();
    saveState();
    toast("样例数据已载入");
    render();
  });

  document.querySelector("#exportBtn").addEventListener("click", downloadBackup);
  document.querySelector("#downloadJsonBtn").addEventListener("click", downloadBackup);
  document.querySelector("#printBtn").addEventListener("click", () => window.print());

  document.querySelector("#importJsonInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const imported = JSON.parse(text);
      state.activeHuiId = imported.activeHuiId || "";
      state.members = imported.members || [];
      state.huis = imported.huis || [];
      state.payments = imported.payments || [];
      state.payouts = imported.payouts || [];
      saveState();
      toast("备份已导入");
      render();
    } catch {
      toast("JSON 格式无法识别");
    }
    event.target.value = "";
  });

  document.querySelector("#clearBtn").addEventListener("click", () => {
    if (!confirm("确认清空本地全部数据？建议先导出备份。")) return;
    state.activeHuiId = "";
    state.members = [];
    state.huis = [];
    state.payments = [];
    state.payouts = [];
    saveState();
    render();
  });
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `会子后台备份_${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function seedData() {
  const members = [
    { id: id("member"), name: "陈阿明", phone: "13800000001", address: "泉州", riskLevel: "normal", notes: "熟人介绍" },
    { id: id("member"), name: "林小惠", phone: "13800000002", address: "晋江", riskLevel: "normal", notes: "历史履约正常" },
    { id: id("member"), name: "黄建生", phone: "13800000003", address: "石狮", riskLevel: "watch", notes: "曾迟缴一次" },
    { id: id("member"), name: "许丽琴", phone: "13800000004", address: "南安", riskLevel: "normal", notes: "经营周转" },
    { id: id("member"), name: "吴志强", phone: "13800000005", address: "惠安", riskLevel: "normal", notes: "保人已登记" },
  ];
  const hui = {
    id: id("hui"),
    name: "样例十期互助会",
    type: "fixed",
    startDate: today(),
    periods: 10,
    contribution: 1000,
    fee: 0,
    status: "active",
    notes: "每月一会，固定成员，得会后继续按期缴款。逾期需补充说明并由会首登记。",
    memberIds: members.map((member) => member.id),
    createdAt: new Date().toISOString(),
  };
  state.members.push(...members);
  state.huis.push(hui);
  state.activeHuiId = hui.id;
}

bindEvents();
render();
