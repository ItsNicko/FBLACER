export function renderAleksChart(canvasOrId, scores) {
  let canvas = typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
  if (!canvas || canvas.tagName !== "CANVAS") throw new Error("Canvas required");

  const ctx = canvas.getContext("2d");
  const textColor = getComputedStyle(document.documentElement).getPropertyValue("--text-color").trim() || "#102027";
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";

  let tooltip = document.getElementById("aleksTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "aleksTooltip";
    tooltip.style.cssText = "position:fixed;pointer-events:none;padding:8px 10px;border-radius:6px;z-index:2147483647;display:none;max-width:320px;white-space:nowrap;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,0.12);";
    tooltip.style.background = surface;
    tooltip.style.color = textColor;
    document.body.appendChild(tooltip);
  }

  const DEFAULT_COLORS = ["#4CAF50", "#2196F3", "#FFC107", "#E91E63", "#9C27B0", "#FF7043", "#26A69A", "#7E57C2"];
  function brightenHex(hex, amt) {
    const c = hex.replace("#", "");
    const num = parseInt(c, 16);
    let r = Math.min(255, Math.max(0, (num >> 16) + Math.round(255 * amt)));
    let g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + Math.round(255 * amt)));
    let b = Math.min(255, Math.max(0, (num & 0x0000ff) + Math.round(255 * amt)));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  let entries = [];
  let totalValue = 0;
  let highlightIndex = -1;

  function computeEntries(scoresObj) {
    const topics = scoresObj?.topics || {};
    const out = [];
    for (const label of Object.keys(topics)) {
      const t = topics[label] || { firstAttemptCorrect: 0, total: 0 };
      const first = Number(t.firstAttemptCorrect) || 0;
      const tot = Number(t.total) || 0;
      const ratio = tot > 0 ? first / tot : 0;
      out.push({ label, correct: first, total: tot, value: ratio * tot });
    }
    return out;
  }

  function draw(hoverIdx) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const baseRadius = Math.min(rect.width, rect.height) * 0.18;
    const maxOuterRadius = Math.min(rect.width, rect.height) * 0.48;
    
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    if (!entries.length || totalValue <= 0) {
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = Math.max(8, baseRadius * 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy, (baseRadius + maxOuterRadius) / 2, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    let angle = -Math.PI / 2;
    entries.forEach((e, i) => {
      const sliceAngle = (e.value / totalValue) * Math.PI * 2;
      const start = angle;
      const end = angle + sliceAngle;
      const corrRatio = e.total > 0 ? e.correct / e.total : 0;
      const targetOuter = baseRadius + (maxOuterRadius - baseRadius) * corrRatio;
      const outerR = targetOuter + (i === hoverIdx ? Math.min(12, (maxOuterRadius - baseRadius) * 0.08) : 0);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, start, end);
      ctx.closePath();
      ctx.fillStyle = i === hoverIdx ? brightenHex(DEFAULT_COLORS[i % DEFAULT_COLORS.length], 0.18) : DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, start, end);
      ctx.stroke();
      angle = end;
    });

    ctx.fillStyle = textColor;
    ctx.font = `600 ${Math.max(14, baseRadius * 0.18)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const totalCorrect = entries.reduce((s, e) => s + (e.correct || 0), 0);
    const totalQuestions = entries.reduce((s, e) => s + (e.total || 0), 0);
    ctx.fillText(`${totalCorrect}/${totalQuestions}`, cx, cy);

    const legendEl = document.getElementById("topicLegend");
    if (legendEl) {
      legendEl.innerHTML = "";
      entries.forEach((e, idx) => {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `<span class="swatch" style="background:${DEFAULT_COLORS[idx % DEFAULT_COLORS.length]};display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:8px;"></span><span>${e.label} — ${e.correct}/${e.total}</span>`;
        legendEl.appendChild(item);
      });
    }
  }

  function handleMouseMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const dx = ev.clientX - rect.left - rect.width / 2;
    const dy = ev.clientY - rect.top - rect.height / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const baseRadius = Math.min(rect.width, rect.height) * 0.18;
    const maxOuterRadius = Math.min(rect.width, rect.height) * 0.48;

    if (dist < baseRadius || dist > maxOuterRadius) {
      tooltip.style.display = "none";
      draw(-1);
      return;
    }

    let ang = Math.atan2(dy, dx) + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;

    let a = 0, found = -1;
    for (let i = 0; i < entries.length; i++) {
      const portion = entries[i].value / totalValue;
      if (ang >= a * Math.PI * 2 && ang <= (a + portion) * Math.PI * 2) {
        found = i;
        break;
      }
      a += portion;
    }

    if (found === -1) {
      tooltip.style.display = "none";
      draw(-1);
      return;
    }

    const e = entries[found];
    tooltip.textContent = `${e.label}\n${e.correct} / ${e.total} correct (${Math.round((e.correct / e.total) * 100) || 0}%)`;
    tooltip.style.left = Math.min(window.innerWidth - 8 - tooltip.offsetWidth, ev.clientX + 12) + "px";
    tooltip.style.top = Math.min(window.innerHeight - 8 - tooltip.offsetHeight, ev.clientY + 12) + "px";
    tooltip.style.display = "block";
    draw(found);
  }

  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; draw(-1); });
  window.addEventListener("resize", () => draw(-1));

  entries = computeEntries(scores || {});
  totalValue = entries.reduce((s, e) => s + (e.value || 0), 0) || entries.length;
  if (totalValue === entries.length) entries.forEach(e => e.value = 1);

  draw(-1);

  return {
    update(newScores) {
      entries = computeEntries(newScores);
      totalValue = entries.reduce((s, e) => s + (e.value || 0), 0) || entries.length;
      if (totalValue === entries.length) entries.forEach(e => e.value = 1);
      draw(-1);
    },
    destroy() {
      canvas.removeEventListener("mousemove", handleMouseMove);
      if (tooltip) tooltip.remove();
    },
    el: canvas
  };
}
