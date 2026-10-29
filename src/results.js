// The results card (lazy chunk, loaded by main.js at the touchdown or a drill's end): the
// grade, score, personal best, the stabilized-gate verdict and one bar per factor. DOM only;
// main.js pauses the flight first (in the air, 0047; on the rollout, 0106).
import { GRADE_COLOURS } from './landing.js';
import { landingTip } from './landingTip.js';

const byId = (id) => document.getElementById(id);
export function showResults(sim, result, best, end, gate) {
  const card = byId('resultsCard');
  const goAround = result.kind === 'goAround';
  byId('txtResultTitle').textContent = result.title ?? (goAround ? 'Go-around complete' : 'Landing grade');
  byId('btnKeepRolling').textContent = sim.onGround ? 'KEEP ROLLING' : 'KEEP FLYING';
  const gradeEl = byId('txtGrade');
  gradeEl.textContent = result.grade;
  gradeEl.className = `${result.grade === 'CRASH' ? 'text-2xl' : 'text-5xl'} font-black w-20 text-center ${GRADE_COLOURS[result.grade]}`;
  byId('txtScore').textContent = String(result.score);
  byId('txtResultRunway').textContent = end.name;
  const reason = byId('txtGradeReason');
  reason.textContent = result.reason || '';
  reason.classList.toggle('hidden', !result.reason);
  // The one thing to fix next time (0061); none for an S or a drill's own card.
  const tip = landingTip(result, { kid: sim.assist === 'kid', noEngine: !!sim.engineFailed });
  byId('txtTip').textContent = tip || '';
  byId('tipRow').classList.toggle('hidden', !tip);
  const bestEl = byId('txtBest');
  if (best.isNewBest) bestEl.textContent = best.previous ? `★ New personal best (was ${best.previous.score})` : '★ First personal best on this mission';
  else bestEl.textContent = best.best ? `Personal best: ${best.best.grade} · ${best.best.score}` : '';
  // Kid and Learner bests are their own (assists.js): say which level this grade is for.
  if (bestEl.textContent && sim.assist !== 'pilot') bestEl.textContent = `${sim.assist === 'kid' ? 'Kid' : 'Learner'} level · ${bestEl.textContent}`;
  // Not scored: the stabilized-gate verdict (null when the mission started below the gate).
  const gateEl = byId('txtStabilized');
  gateEl.classList.toggle('hidden', !gate && !result.note);
  if (gate) {
    gateEl.textContent = gate.stable ? `Stabilized at ${gate.gateHeight} ft ✓`
      : `Unstabilized at ${gate.gateHeight} ft ✗ ${gate.failing.join(', ')}`;
    // The drill flown back to stable: landing was the right call (0047).
    if (gate.stable && sim.goAround) gateEl.textContent += ' You fixed it: landing was right';
    gateEl.classList.toggle('text-emerald-300', gate.stable); // over the amber default (later in the CSS)
  } else if (result.note) {
    gateEl.textContent = `${result.note} ✓`;
    gateEl.classList.add('text-emerald-300');
  }
  const list = byId('resultsFactors');
  list.innerHTML = '';
  for (const f of result.factors) {
    const li = document.createElement('li');
    li.className = 'flex flex-col gap-0.5';
    const tone = f.score >= 85 ? 'bg-emerald-400' : f.score >= 60 ? 'bg-amber-400' : 'bg-red-400';
    li.innerHTML = `<div class="flex justify-between"><span class="text-slate-400">${f.label}</span><span>${f.value}</span></div>`
      + `<div class="h-1.5 rounded bg-slate-800 overflow-hidden"><div class="h-full ${tone}" style="width:${f.score}%"></div></div>`;
    list.appendChild(li);
  }
  card.classList.remove('hidden');
}
