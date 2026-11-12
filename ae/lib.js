// Touquet 2027 artist card: expression library for After Effects.
// Every expression in the comp starts with
//   eval(thisComp.layer("LIB").text.sourceText);
// and then calls the helpers below. It is a line-for-line port of the web
// tool's engine (src/engine.ts): same seeded randomness, same easing, same
// keyframe chains, so the same seeds give the same picture in both.
var CTRL = thisComp.layer("CTRL");
function sl(n) { try { return CTRL.effect(n)("Slider").value; } catch (e) { return 0; } }
function colorOf(n) { try { return CTRL.effect(n)("Color").value; } catch (e) { return [1, 0, 1, 1]; } }
function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v) || lo)); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
var W = thisComp.width, H = thisComp.height, SS = Math.min(W, H), UNIT = SS / 24;
var ORDER = (function () { var m = 3; try { m = CTRL.effect("Stagger order")("Menu").value; } catch (e) {} return m == 1 ? "top" : m == 2 ? "bottom" : "center"; })();
var P = {
  rowsTop: clampInt(sl("Rows top"), 1, 12), rowsBottom: clampInt(sl("Rows bottom"), 1, 12), focus: "bottom",
  blockWidth: clampInt(sl("Block width"), 1, 8), blockTravel: Math.max(0, sl("Block travel")), blockSeed: Math.round(sl("Block seed")),
  moveMin: 1.8, moveMax: 3.6,
  floatCount: clampInt(sl("Floaters"), 0, 12), floatSize: Math.max(0.5, sl("Floaters size")), floatTravel: Math.max(0, sl("Floaters travel")),
  floatMoveMin: 1, floatMoveMax: 2.5,
  opening: clampN(sl("Opening %"), 0, 100), irregularity: clampN(sl("Irregularity %"), 0, 100), shapeSeed: Math.round(sl("Shape seed")),
  duration: Math.max(0.1, sl("Opening time")), stagger: Math.max(0, sl("Rows stagger")), staggerOrder: ORDER,
  easing: [0.7, 0.1, 0.1, 0.9], holdClosed: Math.max(0, sl("Hold closed")), holdOpen: Math.max(0, sl("Hold open")),
  labelY: clampN(sl("Label Y %"), 0, 100) / 100
};
var LABEL_EASING = [0.45, 0.05, 0.2, 1], LABEL_DURATION = 1, CAP = 0.694, D540 = 540;
var STYLE_BIG = { fs: 72 / D540, padTop: 12 / D540, padBottom: 24 / D540, padX: 3 / D540 };
var STYLE_SMALL = { fs: 36 / D540, padTop: 18 / D540, padBottom: 18 / D540, padX: 3 / D540 };
var STYLE_TINY = { fs: 18 / D540, padTop: 18 / D540, padBottom: 18 / D540, padX: 3 / D540 };
var LABEL_GAP = 4.5 / D540;

// ---- deterministic randomness (identical to the tool) ----
function hashN(nums) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < nums.length; i++) {
    var x = Math.floor(nums[i]) | 0;
    h ^= x; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  }
  return h >>> 0;
}
function rand() {
  var t = (hashN(Array.prototype.slice.call(arguments)) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- easing ----
function bezierEase(b) {
  var x1 = b[0], y1 = b[1], x2 = b[2], y2 = b[3];
  function A(a1, a2) { return 1 - 3 * a2 + 3 * a1; }
  function B(a1, a2) { return 3 * a2 - 6 * a1; }
  function Cc(a1) { return 3 * a1; }
  function calc(t, a1, a2) { return ((A(a1, a2) * t + B(a1, a2)) * t + Cc(a1)) * t; }
  function slope(t, a1, a2) { return 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + Cc(a1); }
  return function (x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    if (x1 === y1 && x2 === y2) return x;
    var t = x;
    for (var i = 0; i < 8; i++) { var s = slope(t, x1, x2); if (Math.abs(s) < 1e-6) break; t -= (calc(t, x1, x2) - x) / s; }
    if (!(t >= 0 && t <= 1) || Math.abs(calc(t, x1, x2) - x) > 1e-4) {
      var lo = 0, hi = 1;
      for (var j = 0; j < 40; j++) { t = (lo + hi) / 2; if (calc(t, x1, x2) < x) lo = t; else hi = t; }
    }
    return calc(t, y1, y2);
  };
}
var EASE = bezierEase(P.easing), LEASE = bezierEase(LABEL_EASING);

// ---- chains ----
function stepWithin(cur, lo, hi, r) {
  var o = []; if (cur - 1 >= lo) o.push(cur - 1); if (cur + 1 <= hi) o.push(cur + 1);
  if (!o.length) return cur; return o[Math.min(o.length - 1, Math.floor(r * o.length))];
}
function nextValue(cur, avoid, lo, hi, r) {
  var o = []; if (cur - 1 >= lo) o.push(cur - 1); if (cur + 1 <= hi) o.push(cur + 1);
  var pref = []; for (var i = 0; i < o.length; i++) if (o[i] !== avoid) pref.push(o[i]);
  var pool = pref.length ? pref : o; if (!pool.length) return cur;
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}
function fillSpan(start, span, min, max, r) {
  if (span <= 0) return [];
  var durs = [], acc = 0, i = 0;
  while (acc < span && i < 400) { var d = min + r(i) * (max - min); durs.push(d); acc += d; i++; }
  var k = span / acc, times = [], t = start;
  for (var j = 0; j < durs.length - 1; j++) { t += durs[j] * k; times.push(t); }
  return times;
}
function driftChain(T, moveMin, moveMax, travelMin, travelMax, r) {
  var keys = [{ t: 0, v: 0 }];
  if (travelMax > 0) {
    var times = fillSpan(0, T, moveMin, moveMax, function (i) { return r(1000 + i); });
    var v = 0;
    for (var i = 0; i < times.length; i++) {
      var delta = travelMin + r(2000 + i) * (travelMax - travelMin);
      if (r(3000 + i) < 0.5) delta = -delta;
      if (Math.abs(v + delta) > travelMax) delta = -delta;
      v += delta; keys.push({ t: times[i], v: v });
    }
  }
  keys.push({ t: T, v: 0 });
  return keys;
}
function intChain(T, lo, hi, moveMin, moveMax, r) {
  var start = lo + Math.floor(r(0) * (hi - lo + 1));
  var keys = [{ t: 0, v: start }];
  if (hi > lo) {
    var times = fillSpan(0, T, moveMin, moveMax, function (i) { return r(1 + i); });
    var v = start;
    for (var i = 0; i < times.length; i++) { v = stepWithin(v, lo, hi, r(500 + i)); keys.push({ t: times[i], v: v }); }
    if (keys.length > 1 && keys[keys.length - 1].v === start) keys[keys.length - 1].v = stepWithin(start, lo, hi, r(999));
  }
  keys.push({ t: T, v: start });
  return keys;
}
function easedU(u, curve) { if (u <= 0.004) return 0; if (u >= 0.996) return 1; return clamp01(curve(u)); }
function evalChain(keys, t) {
  if (keys.length < 2) return keys.length ? keys[0].v : 0;
  var t0 = keys[0].t, period = keys[keys.length - 1].t - t0;
  var tt = period > 0 ? t0 + ((((t - t0) % period) + period) % period) : t0;
  for (var i = 0; i < keys.length - 1; i++) {
    var a = keys[i], b = keys[i + 1];
    if (tt >= a.t && tt < b.t) { if (b.v === a.v) return a.v; return a.v + (b.v - a.v) * easedU((tt - a.t) / (b.t - a.t), EASE); }
  }
  return keys[keys.length - 1].v;
}
function segmentProgress(t, openAt, openD, closeAt, closeD, curve) {
  if (t < openAt) return 0;
  if (t < openAt + openD) return easedU((t - openAt) / openD, curve);
  if (t < closeAt) return 1;
  if (t < closeAt + closeD) return 1 - easedU((t - closeAt) / closeD, curve);
  return 0;
}

// ---- text inputs ----
function inputText(name) { try { return String(thisComp.layer(name).text.sourceText); } catch (e) { return ""; } }
function splitWords(s, upper) {
  var t = upper ? s.toUpperCase() : s;
  var a = t.replace(/^\s+|\s+$/g, "").split(/\s+/), o = [];
  for (var i = 0; i < a.length; i++) if (a[i]) o.push(a[i]);
  return o;
}
var TXT = { day: inputText("INPUT Day"), timeStart: inputText("INPUT Time start"), timeEnd: inputText("INPUT Time end"), artist: inputText("INPUT Artist"), stage: inputText("INPUT Stage") };

// ---- scene ----
function buildScene() {
  var p = P, nTop = p.rowsTop, nBot = p.rowsBottom, n = nTop + nBot, rows = [];
  for (var i = 0; i < n; i++) {
    var half = i < nTop ? "top" : "bottom";
    var y0 = half === "top" ? (H / 2) * (i / nTop) : H / 2 + (H / 2) * ((i - nTop) / nBot);
    var y1 = half === "top" ? (H / 2) * ((i + 1) / nTop) : H / 2 + (H / 2) * ((i - nTop + 1) / nBot);
    var rank; if (p.staggerOrder === "center") rank = half === "top" ? nTop - 1 - i : i - nTop; else if (p.staggerOrder === "top") rank = i; else rank = n - 1 - i;
    rows.push({ index: i, half: half, y0: y0, y1: y1, rank: rank, delay: 0, closeDelay: 0, phase: 0, m0: 1, anchor: 0, remL: 0, remR: 0, edgeL: [], edgeR: [], widthKeys: [], shiftKeys: [], floaters: [] });
  }
  var maxRank = 0; for (i = 0; i < n; i++) maxRank = Math.max(maxRank, rows[i].rank);
  var span = p.stagger * maxRank;
  var tOpen = p.holdClosed, tOpenEnd = tOpen + p.duration + span, tClose = tOpenEnd + p.holdOpen, tCloseEnd = tClose + p.duration + span;

  // label clocks (one pace for every label move)
  var wordsOf = function (s) { return splitWords(s, false).length; };
  var bottomRow = rows[n - 1], bottomDelay = p.stagger * bottomRow.rank, bottomCloseDelay = span - bottomDelay;
  var seamBlocks = wordsOf(TXT.stage) + wordsOf(TXT.day);
  var artistBlocks = (TXT.timeStart.replace(/\s/g, "") ? 1 : 0) + (TXT.timeEnd.replace(/\s/g, "") ? 1 : 0) + wordsOf(TXT.artist) + wordsOf(TXT.stage);
  var seamDelay = Math.min(p.stagger * rows[nTop - 1].rank, p.stagger * (rows[nTop] ? rows[nTop].rank : Infinity));
  var seamOpenAt = tOpen + seamDelay;
  var labelD = LABEL_DURATION, labelStagger = p.stagger;
  var groupSpan = function (b) { return (Math.max(1, b) - 1) * labelStagger + labelD; };
  var artistOpenAt = Math.max(tOpen + bottomDelay + 1.5 * p.stagger, seamOpenAt + groupSpan(seamBlocks) + 0.05);
  var artist = { openAt: artistOpenAt, openD: labelD, openStagger: labelStagger, closeAt: tClose + bottomCloseDelay, closeD: labelD, closeStagger: labelStagger };
  var artistGone = artist.closeAt + groupSpan(artistBlocks);
  var seam = { openAt: seamOpenAt, openD: labelD, openStagger: labelStagger, closeAt: Math.max(tCloseEnd, artistGone + 0.05), closeD: labelD, closeStagger: labelStagger };
  var total = seam.closeAt + groupSpan(seamBlocks);
  var tl = { tOpen: tOpen, tOpenEnd: tOpenEnd, tClose: tClose, tCloseEnd: tCloseEnd, total: total, span: span };
  var T = total;

  var moveMin = Math.max(0.2, Math.min(p.moveMin, p.moveMax)), moveMax = Math.max(moveMin, p.moveMax);
  var travelMax = Math.max(0, p.blockTravel) * UNIT, travelMin = travelMax / 4;
  var edgeHi = clampInt(p.blockWidth, 0, 12), edgeLo = Math.max(0, edgeHi - 2);
  var open = clamp01(p.opening / 100), irr = clamp01(p.irregularity / 100);
  var baseUnits = Math.round(((1 - open) * (W / 2)) / UNIT);
  for (i = 0; i < n; i++) {
    var r = rows[i], k = r.index;
    r.delay = p.stagger * r.rank; r.closeDelay = span - r.delay;
    r.phase = ((((k * 0.618) % 1) + rand(p.blockSeed, k, 1) * 0.6) % 1) * 2;
    r.m0 = r.half === p.focus ? 3 : 1;
    var yc = (r.y0 + r.y1) / 2, hill = Math.abs(yc - H / 2) / (H / 2);
    r.remL = baseUnits + Math.round(irr * 4 * (0.5 * hill + 0.5 * rand(p.shapeSeed, k, 10)));
    r.remR = baseUnits + Math.round(irr * 4 * (0.5 * hill + 0.5 * rand(p.shapeSeed, k, 11)));
  }
  for (i = nTop - 2; i >= 0; i--) { rows[i].remL = Math.max(rows[i].remL, rows[i + 1].remL); rows[i].remR = Math.max(rows[i].remR, rows[i + 1].remR); }
  for (i = nTop + 1; i < n; i++) { rows[i].remL = Math.max(rows[i].remL, rows[i - 1].remL); rows[i].remR = Math.max(rows[i].remR, rows[i - 1].remR); }
  var chainsOf = function (r) {
    if (r.widthKeys.length) return r;
    (function (r) {
      var k = r.index;
      var rr = function (key) { return rand(p.blockSeed, k, key); };
      var openAt = tOpen + r.delay, closeAt = tClose + r.closeDelay;
      var keys = [{ t: openAt, v: r.m0 }], v = r.m0, openSpan = closeAt - openAt;
      var t = openAt + Math.min(moveMin + rr(100) * (moveMax - moveMin), openSpan * 0.6);
      v = stepWithin(v, 1, 3, rr(3)); keys.push({ t: t, v: v });
      var times = fillSpan(t, closeAt - t, moveMin, moveMax, function (i) { return rr(110 + i); });
      for (var j = 0; j < times.length; j++) { v = stepWithin(v, 1, 3, rr(130 + j)); keys.push({ t: times[j], v: v }); }
      v = nextValue(v, r.m0, 1, 3, rr(150));
      keys.push({ t: closeAt, v: v });
      keys.push({ t: Math.min(closeAt + p.duration, openAt + T), v: r.m0 });
      keys.push({ t: openAt + T, v: r.m0 });
      r.widthKeys = keys;
      r.shiftKeys = driftChain(T, moveMin, moveMax, travelMin, travelMax, rr);
      r.edgeL = intChain(T, edgeLo, edgeHi, moveMin, moveMax, function (i) { return rr(7000 + i); });
      r.edgeR = intChain(T, edgeLo, edgeHi, moveMin, moveMax, function (i) { return rr(8000 + i); });
    })(r);
    return r;
  };
  for (i = 0; i < n; i++) rows[i].anchor = W * (0.3 + 0.4 * rand(p.blockSeed, rows[i].index, 7));
  // floaters, spread over the rows innermost first
  var count = p.floatCount, floaters = [];
  if (count > 0) {
    var fmax = Math.max(0.2, p.floatSize) * UNIT, fmin = fmax / 2;
    var fMoveMin = Math.max(0.2, Math.min(p.floatMoveMin, p.floatMoveMax)), fMoveMax = Math.max(fMoveMin, p.floatMoveMax);
    var fTravelMax = Math.max(0, p.floatTravel), fTravelMin = fTravelMax / 2;
    var order = rows.slice().sort(function (a, b) { var da = Math.abs((a.y0 + a.y1) / 2 - H / 2), db = Math.abs((b.y0 + b.y1) / 2 - H / 2); return da - db || a.index - b.index; });
    var hosts = []; for (i = 0; i < order.length; i++) { var rr0 = order[i]; if (Math.min(W / 2 - rr0.remL * UNIT, W / 2 - rr0.remR * UNIT) > UNIT) hosts.push(rr0); }
    for (var j = 0; j < count && hosts.length; j++) floaters.push({ j: j, row: hosts[j % hosts.length], widthKeys: [] });
  }
  var floaterChains = function (f) {
    if (f.widthKeys.length) return f;
      (function (j) {
        var r = f.row, k = r.index;
        var reach = Math.min(W / 2 - r.remL * UNIT, W / 2 - r.remR * UNIT);
        var fmax = Math.max(0.2, p.floatSize) * UNIT, fmin = fmax / 2;
        var fMoveMin = Math.max(0.2, Math.min(p.floatMoveMin, p.floatMoveMax)), fMoveMax = Math.max(fMoveMin, p.floatMoveMax);
        var fTravelMax = Math.max(0, p.floatTravel), fTravelMin = fTravelMax / 2;
        var fr = function (key) { return rand(p.blockSeed, k, 5000 + j * 100 + key); };
        var x0 = -reach * 0.8 + reach * 1.6 * fr(1);
        var size = function (i) { return fr(40 + i) < 0.35 ? 0 : fmin + fr(41 + i * 7) * (fmax - fmin); };
        var wk = [{ t: 0, v: size(0) }];
        var wtimes = fillSpan(0, T, fMoveMin, fMoveMax, function (i) { return fr(10 + i); });
        for (var i = 0; i < wtimes.length; i++) wk.push({ t: wtimes[i], v: size(i + 1) });
        wk.push({ t: T, v: wk[0].v });
        var sk = [{ t: 0, v: 1 + Math.floor(fr(3) * 3) }], sv = sk[0].v;
        var stimes = fillSpan(0, T, fMoveMin, fMoveMax, function (i) { return fr(80 + i); });
        for (i = 0; i < stimes.length; i++) { sv = stepWithin(sv, 1, 3, fr(90 + i)); sk.push({ t: stimes[i], v: sv }); }
        sk.push({ t: T, v: sk[0].v });
        f.x0 = x0; f.phase = fr(4) * 2; f.widthKeys = wk; f.shiftKeys = driftChain(T, fMoveMin, fMoveMax, fTravelMin, fTravelMax, function (i) { return fr(60 + i); }); f.stripeKeys = sk; f.stripeShift = driftChain(T, fMoveMin, fMoveMax, fTravelMin * 0.5, fTravelMax * 0.5, function (i) { return fr(70 + i); });
      })(f.j);
    return f;
  };
  return { rows: rows, tl: tl, seam: seam, artist: artist, floaters: floaters, nTop: nTop, seamBlocks: seamBlocks, artistBlocks: artistBlocks, chainsOf: chainsOf, floaterChains: floaterChains };
}
function loopTime(scene) { var T = scene.tl.total; return T > 0 ? ((time % T) + T) % T : 0; }
function rowProgress(scene, r, t) { return segmentProgress(t, scene.tl.tOpen + r.delay, P.duration, scene.tl.tClose + r.closeDelay, P.duration, EASE); }
function rowHole(r, side, t) { var rem = (side === "L" ? r.remL : r.remR) + evalChain(side === "L" ? r.edgeL : r.edgeR, t); return Math.max(0, W / 2 - rem * UNIT); }
function blockProgress(c, g, n, t) { return segmentProgress(t, c.openAt + g * c.openStagger, c.openD, c.closeAt + (n - 1 - g) * c.closeStagger, c.closeD, LEASE); }

// Everything one row-half layer needs, from its name "Row T03 L".
function rowState(name) {
  var m = /Row ([TB])(\d+) ([LR])/.exec(name);
  var scene = buildScene(), half = m[1] === "T" ? "top" : "bottom", idx = parseInt(m[2], 10) - 1, side = m[3];
  var on = half === "top" ? idx < P.rowsTop : idx < P.rowsBottom;
  if (!on) return { on: false, y0: 0, y1: 1, h: 1, w: UNIT, edge: 0, from: 0, to: 0, colA: [0, 0, 0, 1], colB: [0, 0, 0, 1], t: 0 };
  var r = scene.chainsOf(scene.rows[half === "top" ? idx : P.rowsTop + idx]);
  var t = loopTime(scene), pr = rowProgress(scene, r, t), cx = W / 2;
  var mult = evalChain(r.widthKeys, t), w = Math.max(1, UNIT * mult);
  var holeL = rowHole(r, "L", t) * pr, holeR = rowHole(r, "R", t) * pr;
  var origin = r.anchor + evalChain(r.shiftKeys, t);
  var left = Math.round(cx - holeL), right = Math.round(cx + holeR);
  var colA = half === "top" ? colorOf("Top A") : colorOf("Bottom A"), colB = half === "top" ? colorOf("Top B") : colorOf("Bottom B");
  var y0 = Math.round(r.y0), y1 = Math.round(r.y1);
  if (side === "L") return { on: true, y0: y0, y1: y1, y0exact: r.y0, h: y1 - y0, w: w, phase: r.phase, edge: origin - holeL, from: 0, to: left, right: right, colA: colA, colB: colB, t: t };
  return { on: true, y0: y0, y1: y1, y0exact: r.y0, h: y1 - y0, w: w, phase: r.phase, edge: origin + holeR, from: right, to: W, right: right, colA: colA, colB: colB, t: t };
}
// Everything one floater layer needs, from its name "Floater 03".
function floaterState(name) {
  var j = parseInt(/Floater (\d+)/.exec(name)[1], 10) - 1;
  var scene = buildScene();
  var off = { on: false, y0: 0, y1: 1, h: 1, w: UNIT, from: 0, to: 0, edge: 0, phase: 0, colA: [0, 0, 0, 1], colB: [0, 0, 0, 1] };
  if (j >= scene.floaters.length) return off;
  var f = scene.floaters[j], r = scene.chainsOf(f.row), t = loopTime(scene), pr = rowProgress(scene, r, t), cx = W / 2;
  var trail = Math.sqrt(Math.max(0, 1 - pr));
  if (trail <= 0.02) return off;
  scene.floaterChains(f);
  var lag = rowProgress(scene, r, t - 0.15);
  var holeL = rowHole(r, "L", t) * pr, holeR = rowHole(r, "R", t) * pr;
  var left = Math.round(cx - holeL), right = Math.round(cx + holeR);
  if (right - left <= 1) return off;
  var fw = evalChain(f.widthKeys, t) * trail; if (fw < 1) return off;
  var fx = cx + f.x0 * lag + evalChain(f.shiftKeys, t);
  var sw = Math.max(1, UNIT * evalChain(f.stripeKeys, t));
  var so = fx + evalChain(f.stripeShift, t);
  var a = Math.max(left, fx - fw / 2), b = Math.min(right, fx + fw / 2);
  if (b - a < 1) return off;
  var colA = r.half === "top" ? colorOf("Top A") : colorOf("Bottom A"), colB = r.half === "top" ? colorOf("Top B") : colorOf("Bottom B");
  var y0 = Math.round(r.y0), y1 = Math.round(r.y1);
  return { on: true, y0: y0, y1: y1, y0exact: r.y0, h: y1 - y0, w: sw, from: a, to: b, edge: so, phase: f.phase, colA: colA, colB: colB };
}

// which half a floater sits in (its host row), cheap: no chains
function floaterHalf(name) {
  var j = parseInt(/Floater (\d+)/.exec(name)[1], 10) - 1;
  var scene = buildScene();
  return j < scene.floaters.length ? scene.floaters[j].row.half : "top";
}

// ---- labels ----
// Block layers are named "<Group> W<i>" with groups: Seam Stage, Seam Day, Time, Artist, Stage.
var GROUPS = {
  "Seam Stage": { style: STYLE_BIG, upper: false, src: "stage", clock: "seam", order: 0 },
  "Seam Day": { style: STYLE_SMALL, upper: true, src: "day", clock: "seam", order: 1 },
  "Time": { style: STYLE_TINY, upper: false, src: "time", clock: "artist", order: 0 },
  "Artist": { style: STYLE_BIG, upper: false, src: "artist", clock: "artist", order: 1 },
  "Stage": { style: STYLE_SMALL, upper: true, src: "stage", clock: "artist", order: 2 }
};
var MAXW = { "Seam Stage": 3, "Seam Day": 3, "Time": 2, "Artist": 4, "Stage": 3 };
function groupWords(g) {
  var d = GROUPS[g];
  if (d.src === "time") { var o = []; if (TXT.timeStart.replace(/\s/g, "")) o.push(TXT.timeStart.replace(/^\s+|\s+$/g, "")); if (TXT.timeEnd.replace(/\s/g, "")) o.push(TXT.timeEnd.replace(/^\s+|\s+$/g, "")); return o.slice(0, MAXW[g]); }
  return splitWords(TXT[d.src], d.upper).slice(0, MAXW[g]);
}
function wordText(name) { var m = /^(.*) W(\d+)$/.exec(name); var ws = groupWords(m[1]); var i = parseInt(m[2], 10) - 1; return i < ws.length ? ws[i] : ""; }
function textWidth(layerName) { try { var L = thisComp.layer(layerName); if (!String(L.text.sourceText)) return 0; return L.sourceRectAtTime(time, false).width; } catch (e) { return 0; } }
// rows of a clock group in order, with their block layers
function clockRows(clock) { var o = []; for (var g in GROUPS) if (GROUPS[g].clock === clock) o.push(g); o.sort(function (a, b) { return GROUPS[a].order - GROUPS[b].order; }); return o; }
// Everything one block (text or box layer) needs, from the group and index.
function blockState(g, i) {
  var scene = buildScene(), t = loopTime(scene), d = GROUPS[g], style = d.style, S = SS;
  var fs = style.fs * S, padX = style.padX * S, padTop = style.padTop * S, padBottom = style.padBottom * S, capH = CAP * fs, h = padTop + capH + padBottom, gap = LABEL_GAP * S;
  var clock = d.clock === "seam" ? scene.seam : scene.artist;
  var rows = clockRows(d.clock), first = 0, nBlocks = 0, rowIdx = 0, yTop = 0, gh = 0;
  var rowHeights = [], rowWords = [];
  for (var ri = 0; ri < rows.length; ri++) { var ws = groupWords(rows[ri]); rowWords.push(ws); var st = GROUPS[rows[ri]].style; var fsr = st.fs * S; rowHeights.push(ws.length ? st.padTop * S + CAP * fsr + st.padBottom * S : 0); nBlocks += ws.length; if (rows[ri] === g) rowIdx = ri; }
  for (ri = 0; ri < rowIdx; ri++) first += rowWords[ri].length;
  var visibleRows = 0; for (ri = 0; ri < rows.length; ri++) if (rowWords[ri].length) { gh += rowHeights[ri]; visibleRows++; }
  gh += gap * Math.max(0, visibleRows - 1);
  var top;
  if (d.clock === "seam") top = H / 2 - gh / 2; else top = Math.max(0, Math.min(H - gh, P.labelY * H));
  for (ri = 0; ri < rowIdx; ri++) if (rowWords[ri].length) top += rowHeights[ri] + gap;
  var words = rowWords[rowIdx], n = words.length;
  if (i >= n) return { on: false };
  // reveal per block of this row and the row layout
  var vis = [], ws = [], rev = [];
  for (var k = 0; k < n; k++) {
    var g_ = first + k;
    var pr = blockProgress(clock, g_, nBlocks, t);
    if (d.clock === "seam") pr = 1 - pr;
    var tw = textWidth(g + " W" + (k + 1)) + Math.abs(-0.02 * fs) + 2 * padX;
    ws.push(tw); rev.push(clamp01(pr)); vis.push(tw * clamp01(pr));
  }
  var rowW = 0; for (k = 0; k < n; k++) rowW += vis[k]; rowW += gap * (n - 1);
  var x = W / 2 - rowW / 2; for (k = 0; k < i; k++) x += vis[k] + gap;
  var vw = vis[i], bw = ws[i], r = rev[i];
  var dir = rand(P.blockSeed, 900 + (d.clock === "seam" ? GROUPS[g].order * 10 : 50 + first) + i) < 0.5 ? -1 : 1;
  var slide = 0.12 * S;
  var off = Math.min(slide * (1 - r), (bw - vw) / 2) * dir;
  var bx = x + vw / 2 - bw / 2 + off;
  return { on: vw >= 0.5, x: x, vw: vw, bw: bw, bx: bx, top: top, h: h, fs: fs, padX: padX, padTop: padTop, capH: capH, baseline: top + padTop + capH, maskTop: top - fs, maskBottom: top + h + fs, text: words[i] };
}
function blockOf(name) { var m = /^(.*) W(\d+)(?: Box)?$/.exec(name); return blockState(m[1], parseInt(m[2], 10) - 1); }
