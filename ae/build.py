#!/usr/bin/env python3
"""Generate build.jsx: an After Effects script that creates the Touquet 2027
artist-card comp driven by the expression library in lib.js.

Performance model: evaluating the library costs the most, so only a few
expressions per frame do it. Each row's L layer computes WE = [stripe width,
left edge origin, phase] and WIN = [left, right, y0]; the R layer and every
other property read those controls. Floaters do the same. Each word block's
text layer computes BLK = [x, visible width, box x] and BLK2 = [box width,
top, on]; its box layer reads them."""
import json, pathlib, re
HERE = pathlib.Path(__file__).parent
LIB_RAW = (HERE / "lib.js").read_text()
# minify lightly: drop full-line comments and indentation (never touches strings)
LIB = "\n".join(l.strip() for l in LIB_RAW.splitlines() if l.strip() and not l.strip().startswith("//"))
HEAD = 'eval(thisComp.layer("LIB").text.sourceText.value);\n'
W, H = 1080, 1350
S = min(W, H)
D = 540.0
CAP = 0.694
STYLES = {
  "big":   dict(fs=72/D*S,  padTop=12/D*S, padBottom=24/D*S, padX=3/D*S),
  "small": dict(fs=36/D*S,  padTop=18/D*S, padBottom=18/D*S, padX=3/D*S),
  "tiny":  dict(fs=18/D*S,  padTop=18/D*S, padBottom=18/D*S, padX=3/D*S),
}
for st in STYLES.values():
    st["capH"] = CAP * st["fs"]; st["h"] = st["padTop"] + st["capH"] + st["padBottom"]
GROUPS = [  # name, max words, style, upper, source
  ("Seam Stage", 3, "big", False, "stage"), ("Seam Day", 3, "small", True, "day"),
  ("Time", 1, "tiny", False, "time"), ("Artist", 4, "big", False, "artist"), ("Stage", 3, "small", True, "stage"),
]
def js(s): return json.dumps(s)
# the 67 locked colourways, read from src/engine.ts so the two tools never drift
_eng = (HERE.parent / "src" / "engine.ts").read_text()
_tbl = _eng[_eng.index("export const COLORWAYS"):]; _tbl = _tbl[:_tbl.index("];")]
def _rgb(h): n = int(h[1:], 16); return [round(((n >> 16) & 255) / 255, 4), round(((n >> 8) & 255) / 255, 4), round((n & 255) / 255, 4)]
COLORWAYS = [[_rgb(h) for h in w] for w in re.findall(r'\["(#[0-9A-F]{6})", "(#[0-9A-F]{6})", "(#[0-9A-F]{6})", "(#[0-9A-F]{6})"\]', _tbl)]
assert len(COLORWAYS) == 67, len(COLORWAYS)

ROW_GUARD = ('var m = /Row ([TB])(\\d+)/.exec(thisLayer.name);\n'
             'var cnt = thisComp.layer("CTRL").effect(m[1] == "T" ? "Rows top" : "Rows bottom")("Slider");\n'
             'if (parseInt(m[2], 10) > Math.round(cnt)) { [0, 0, 0]; } else {\n' + HEAD)
FL_GUARD = ('var fj = parseInt(/Floater (\\d+)/.exec(thisLayer.name)[1], 10);\n'
            'if (fj > Math.round(thisComp.layer("CTRL").effect("Floaters")("Slider"))) { [0, 0, 0]; } else {\n' + HEAD)
# shared readers (no library)
ROW_READ = ('var Lr = thisComp.layer(thisLayer.name.replace(/ [LR]$/, " L"));\n'
            'var we = Lr.effect("WE")("3D Point"), win = Lr.effect("WIN")("3D Point");\n'
            'var side = /R$/.test(thisLayer.name) ? "R" : "L";\n'
            'var Hh = thisComp.height, top = win[2] < Hh / 2;\n'
            'var nr = Math.max(1, Math.round(thisComp.layer("CTRL").effect(top ? "Rows top" : "Rows bottom")("Slider")));\n'
            'var y0 = Math.round(win[2]), y1 = Math.round(win[2] + (Hh / 2) / nr);\n'
            'var w = we[0], edge = side == "L" ? we[1] : we[1] - win[0] + win[1];\n'
            'var from = side == "L" ? 0 : win[1], to = side == "L" ? win[0] : thisComp.width;\n')
FL_READ = ('var we = effect("WE")("3D Point"), win = effect("WIN")("3D Point");\n'
           'var Hh = thisComp.height, top = win[2] < Hh / 2;\n'
           'var nr = Math.max(1, Math.round(thisComp.layer("CTRL").effect(top ? "Rows top" : "Rows bottom")("Slider")));\n'
           'var y0 = Math.round(win[2]), y1 = Math.round(win[2] + (Hh / 2) / nr);\n'
           'var w = we[0], edge = we[1], from = win[0], to = win[1];\n')
E = {
 "rowWE":  ROW_GUARD + 'var s = rowState(thisLayer.name); s.on ? [s.w, s.edge, s.phase] : [0, 0, 0]; }',
 "rowWIN": ROW_GUARD + 'var s = rowState(thisLayer.name); s.on ? [s.to, s.right, s.y0exact] : [0, 0, 0]; }',
 "rowMask": ROW_READ + 'if (w <= 0) createPath([[0,0],[0,0],[0,0],[0,0]],[],[],true); else createPath([[from,y0],[to,y0],[to,y1],[from,y1]],[],[],true);',
 "rowOpacity": ROW_READ + 'w > 0 ? 100 : 0;',
 "rowStripeSize": ROW_READ + '[Math.max(1, w), thisComp.height];',
 "rowStripePos": ROW_READ + '[Math.max(1, w) / 2, thisComp.height / 2];',
 "rowRepOffset": ROW_READ + '[2 * Math.max(1, w), 0];',
 "rowGroupPos": ROW_READ + 'var ww = Math.max(1, w); [edge + (1 - we[2]) * ww - 2 * ww * 20, 0];',
 "fWE":  FL_GUARD + 'var s = floaterState(thisLayer.name); s.on ? [s.w, s.edge, s.phase] : [0, 0, 0]; }',
 "fWIN": FL_GUARD + 'var s = floaterState(thisLayer.name); s.on ? [s.from, s.to, s.y0exact] : [0, 0, 0]; }',
 "fMask": FL_READ + 'if (w <= 0) createPath([[0,0],[0,0],[0,0],[0,0]],[],[],true); else createPath([[from,y0],[to,y0],[to,y1],[from,y1]],[],[],true);',
 "fOpacity": FL_READ + 'w > 0 ? 100 : 0;',
 "fStripeSize": FL_READ + '[Math.max(1, w), thisComp.height];',
 "fStripePos": FL_READ + '[Math.max(1, w) / 2, thisComp.height / 2];',
 "fRepOffset": FL_READ + '[2 * Math.max(1, w), 0];',
 "fGroupPos": FL_READ + 'var ww = Math.max(1, w); [edge + (1 - we[2]) * ww - 2 * ww * 20, 0];',
 "fColA": FL_READ + 'thisComp.layer("CTRL").effect(top ? "Top A" : "Bottom A")("Color");',
 "fColB": FL_READ + 'thisComp.layer("CTRL").effect(top ? "Top B" : "Bottom B")("Color");',
 "boxColor": 'thisComp.layer("CTRL").effect("Label bg")("Color");',
 "loop": HEAD + 'buildScene().tl.total;',
}
def word_code(src, upper):
    """Inline word lookup (no library): the word for this layer's index, or ''."""
    if src == "time":
        get = ('var ws = [], tp = [];\n'
               'var a = String(thisComp.layer("INPUT Time start").text.sourceText).replace(/^\\s+|\\s+$/g, ""); if (a) tp.push(a);\n'
               'var b = String(thisComp.layer("INPUT Time end").text.sourceText).replace(/^\\s+|\\s+$/g, ""); if (b) tp.push(b);\n'
               'if (tp.length) ws.push(tp.join(" \\u2014 "));\n')
    else:
        inp = {"stage": "INPUT Stage", "day": "INPUT Day", "artist": "INPUT Artist"}[src]
        get = ('var ws = [], raw = String(thisComp.layer(%s).text.sourceText).replace(/^\\s+|\\s+$/g, "").split(/\\s+/);\n'
               'for (var q = 0; q < raw.length; q++) if (raw[q]) ws.push(raw[q]);\n') % js(inp)
    idx = 'var wi = parseInt(/W(\\d+)/.exec(thisLayer.name)[1], 10) - 1;\n'
    up = 'var word = wi < ws.length ? ws[wi]%s : "";\n' % (".toUpperCase()" if upper else "")
    return get + idx + up
def block_exprs(g):
    name, maxw, style, upper, src = g
    st = STYLES[style]
    wc = word_code(src, upper)
    guard = wc + 'if (!word) { [0, 0, 0]; } else {\n' + HEAD
    text_read = 'var b = effect("BLK")("3D Point"), c = effect("BLK2")("3D Point");\n'
    box_read = 'var T = thisComp.layer(thisLayer.name.replace(/ Box$/, ""));\nvar b = T.effect("BLK")("3D Point"), c = T.effect("BLK2")("3D Point");\n'
    fs, h, padX, padTop, capH = st["fs"], st["h"], st["padX"], st["padTop"], st["capH"]
    return {
      "text": wc + 'var lc = thisComp.layer("CTRL").effect("Label text")("Color");\ntext.sourceText.style.setFillColor([lc[0], lc[1], lc[2]]).setText(word);',
      "BLK":  guard + 'var k = blockOf(thisLayer.name); k.on ? [k.x, k.vw, k.bx] : [0, 0, 0]; }',
      "BLK2": guard + 'var k = blockOf(thisLayer.name); k.on ? [k.bw, k.top, 1] : [0, 0, 0]; }',
      "textPos": text_read + 'c[2] > 0 ? [b[2] + %r, c[1] + %r] : [-9999, -9999];' % (padX, padTop + capH),
      "textMask": text_read + 'if (c[2] <= 0 || b[1] < 0.5) createPath([[0,0],[0,0],[0,0],[0,0]],[],[],true); else createPath([fromComp([b[0], c[1] - %r]), fromComp([b[0] + b[1], c[1] - %r]), fromComp([b[0] + b[1], c[1] + %r]), fromComp([b[0], c[1] + %r])],[],[],true);' % (fs, fs, h + fs, h + fs),
      "textOpacity": text_read + '(c[2] > 0 && b[1] >= 0.5) ? 100 : 0;',
      "boxSize": box_read + 'c[2] > 0 ? [c[0], %r] : [1, 1];' % h,
      "boxPos": box_read + 'c[2] > 0 ? [b[2] + c[0] / 2, c[1] + %r] : [-9999, -9999];' % (h / 2),
      "boxMask": box_read + 'if (c[2] <= 0 || b[1] < 0.5) createPath([[0,0],[0,0],[0,0],[0,0]],[],[],true); else createPath([[b[0], c[1] - %r], [b[0] + b[1], c[1] - %r], [b[0] + b[1], c[1] + %r], [b[0], c[1] + %r]],[],[],true);' % (fs, fs, h + fs, h + fs),
      "boxOpacity": box_read + '(c[2] > 0 && b[1] >= 0.5) ? 100 : 0;',
      "fs": fs,
    }
BLOCKS = {g[0]: block_exprs(g) for g in GROUPS}

jsx = r'''
// Touquet 2027 artist card: builds the comp. Generated by ae/build.py, do not edit by hand.
(function () {
  var LIB_SOURCE = %(lib)s;
  var E = %(exprs)s;
  var BLOCKS = %(blocks)s;
  var GROUPS = %(groups)s;
  var DEFAULTS = %(defaults)s;
  var COLORWAYS = %(colorways)s; // [r, g, b] x 4 per colourway: top A, top B, bottom A, bottom B
  var IMAGE_PATH = %(image)s;
  var DIAG_DIR = %(diagdir)s || Folder.temp.fsName; // rendered diagnostics and check frames land here
  var COMP_NAME = "Artist card — tool v2";
  var log = [];
  app.beginUndoGroup("Build Touquet 2027 artist card");
  var comp = null;
  try {
    app.project.expressionEngine = "javascript-1.0";
    var W = %(W)d, H = %(H)d, FPS = 30, DUR = 20;
    var photoItem = null;
    for (var pi = app.project.numItems; pi >= 1; pi--) {
      var it0 = app.project.item(pi);
      if (it0 instanceof CompItem && (it0.name.indexOf(COMP_NAME) === 0 || it0.name === "DIAGCOMP")) it0.remove();
      else if (it0 instanceof FootageItem && /^probe\d*\.jsx$/.test(it0.name)) it0.remove();
      else if (it0 instanceof FootageItem && it0.name === "default photo") photoItem = it0;
    }
    comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
    comp.bgColor = [1, 1, 1];
    function setExpr(prop, code) { try { prop.expression = code; } catch (e) { log.push(prop.name + ": " + e.toString()); } }
    function atOrigin(L) { L.property("Transform").property("Anchor Point").setValue([0, 0]); L.property("Transform").property("Position").setValue([0, 0]); }
    function colorLink(name) { return 'thisComp.layer("CTRL").effect("' + name + '")("Color");'; }
    function point3(L, name, expr) { var e = L.property("Effects").addProperty("ADBE Point3D Control"); e.name = name; setExpr(e.property(1), expr); return e; }

    // library, inputs and controls first: expressions are evaluated when assigned and get disabled if these do not exist yet
    var inputs = [["INPUT Day", DEFAULTS.day], ["INPUT Time start", DEFAULTS.timeStart], ["INPUT Time end", DEFAULTS.timeEnd], ["INPUT Artist", DEFAULTS.artist], ["INPUT Stage", DEFAULTS.stage]];
    var headLayers = [];
    for (var ii = inputs.length - 1; ii >= 0; ii--) { var il = comp.layers.addText(inputs[ii][1]); il.name = inputs[ii][0]; il.enabled = false; il.guideLayer = true; headLayers.push(il); }
    var lib = comp.layers.addText(LIB_SOURCE); lib.name = "LIB"; lib.enabled = false; lib.guideLayer = true; headLayers.push(lib);
    var ctrl = comp.layers.addNull(); ctrl.name = "CTRL"; ctrl.enabled = false; headLayers.push(ctrl);
    function slider(name, v) { var e = ctrl.property("Effects").addProperty("ADBE Slider Control"); e.name = name; e.property(1).setValue(v); }
    function colour(name, hex) { var e = ctrl.property("Effects").addProperty("ADBE Color Control"); e.name = name; var n = parseInt(hex.slice(1), 16); e.property(1).setValue([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]); }
    slider("Hold closed", DEFAULTS.holdClosed); slider("Opening time", DEFAULTS.duration); slider("Opening %%", DEFAULTS.opening); slider("Vignette %%", DEFAULTS.vignette); slider("Faith %%", DEFAULTS.faith);
    (function () { var e = ctrl.property("Effects").addProperty("ADBE Point Control"); e.name = "Falloff centre"; e.property(1).setValue([DEFAULTS.falloffX * W, DEFAULTS.falloffY * H]); })();
    slider("Falloff radius", DEFAULTS.falloffR * Math.min(W, H)); slider("Hold open", DEFAULTS.holdOpen);
    slider("Rows top", DEFAULTS.rowsTop); slider("Rows bottom", DEFAULTS.rowsBottom);
    slider("Rows stagger", DEFAULTS.stagger); slider("Irregularity %%", DEFAULTS.irregularity); slider("Shape seed", DEFAULTS.shapeSeed);
    try {
      var fx = ctrl.property("Effects");
      fx.addProperty("ADBE Dropdown Control");
      var ddIndex = fx.numProperties;
      fx.property(ddIndex).property(1).setPropertyParameters(["Top", "Bottom", "Centre"]);
      fx.property(ddIndex).name = "Stagger order";
      fx.property(ddIndex).property(1).setValue(3);
    } catch (e) { log.push("dropdown: " + e.toString()); }
    slider("Block width", DEFAULTS.blockWidth); slider("Block travel", DEFAULTS.blockTravel); slider("Block seed", DEFAULTS.blockSeed);
    slider("Floaters", DEFAULTS.floatCount); slider("Floaters size", DEFAULTS.floatSize); slider("Floaters travel", DEFAULTS.floatTravel);
    // Colourway 1..67 locks the four stripe colours to a Touquet set; 0 frees the colour controls below
    slider("Colourway", DEFAULTS.colorway);
    colour("Top A", DEFAULTS.colors.topA); colour("Top B", DEFAULTS.colors.topB); colour("Bottom A", DEFAULTS.colors.bottomA); colour("Bottom B", DEFAULTS.colors.bottomB);
    var cwNames = ["Top A", "Top B", "Bottom A", "Bottom B"];
    for (var cwi = 0; cwi < 4; cwi++) {
      var col = "["; for (var cwj = 0; cwj < COLORWAYS.length; cwj++) col += (cwj ? "," : "") + "[" + COLORWAYS[cwj][cwi].join(",") + "]"; col += "]";
      setExpr(ctrl.effect(cwNames[cwi]).property(1), 'var T = ' + col + ';\nvar n = Math.round(effect("Colourway")("Slider"));\n(n >= 1 && n <= T.length) ? [T[n - 1][0], T[n - 1][1], T[n - 1][2], 1] : value;');
    }
    colour("Label bg", DEFAULTS.colors.labelBg); colour("Label text", DEFAULTS.colors.labelText);
    slider("Label Y %%", DEFAULTS.labelY * 100);

    var bg = comp.layers.addSolid([1, 1, 1], "BG", W, H, 1); bg.locked = true;
    try {
      var f = new File(IMAGE_PATH);
      if (photoItem || f.exists) {
        var item = photoItem || app.project.importFile(new ImportOptions(f));
        item.name = "default photo";
        var img = comp.layers.add(item); img.name = "IMAGE";
        var zoom = DEFAULTS.imageZoom, ox = DEFAULTS.imageX, oy = DEFAULTS.imageY;
        var s = Math.max(W / item.width, H / item.height) * zoom;
        var dw = item.width * s, dh = item.height * s;
        var x = (W - dw) / 2 - ox * ((dw - W) / 2), y = (H - dh) / 2 - oy * ((dh - H) / 2);
        img.property("Transform").property("Scale").setValue([s * 100, s * 100]);
        img.property("Transform").property("Position").setValue([x + dw / 2, y + dh / 2]);
      } else log.push("photo not found: " + IMAGE_PATH);
    } catch (e) { log.push("photo: " + e.toString()); }

    // a stripe layer: repeated colour-B stripes over a full-comp base in colour A, masked to its window
    function stripeLayer(name, ex, colAExpr, colBExpr, withControls) {
      var L = comp.layers.addShape(); L.name = name; atOrigin(L);
      if (withControls) { point3(L, "WE", ex.we); point3(L, "WIN", ex.win); }
      var contents = L.property("Contents");
      var st = contents.addProperty("ADBE Vector Group"); st.name = "Stripes";
      var rect2 = st.property("Contents").addProperty("ADBE Vector Shape - Rect");
      setExpr(rect2.property("ADBE Vector Rect Size"), ex.stripeSize); setExpr(rect2.property("ADBE Vector Rect Position"), ex.stripePos);
      var fillB = st.property("Contents").addProperty("ADBE Vector Graphic - Fill"); setExpr(fillB.property("ADBE Vector Fill Color"), colBExpr);
      var rep = st.property("Contents").addProperty("ADBE Vector Filter - Repeater");
      rep.property("ADBE Vector Repeater Copies").setValue(41);
      setExpr(rep.property("ADBE Vector Repeater Transform").property("ADBE Vector Repeater Position"), ex.repOffset);
      setExpr(st.property("ADBE Vector Transform Group").property("ADBE Vector Position"), ex.groupPos);
      var base = contents.addProperty("ADBE Vector Group"); base.name = "Base";
      var rect = base.property("Contents").addProperty("ADBE Vector Shape - Rect");
      rect.property("ADBE Vector Rect Size").setValue([W, H]); rect.property("ADBE Vector Rect Position").setValue([W / 2, H / 2]);
      var fillA = base.property("Contents").addProperty("ADBE Vector Graphic - Fill"); setExpr(fillA.property("ADBE Vector Fill Color"), colAExpr);
      var mask = L.property("Masks").addProperty("ADBE Mask Atom"); mask.name = "Window";
      setExpr(mask.property("ADBE Mask Shape"), ex.mask);
      setExpr(L.property("Transform").property("Opacity"), ex.opacity);
      return L;
    }
    var rowEx = { we: E.rowWE, win: E.rowWIN, mask: E.rowMask, opacity: E.rowOpacity, stripeSize: E.rowStripeSize, stripePos: E.rowStripePos, repOffset: E.rowRepOffset, groupPos: E.rowGroupPos };
    var flEx = { we: E.fWE, win: E.fWIN, mask: E.fMask, opacity: E.fOpacity, stripeSize: E.fStripeSize, stripePos: E.fStripePos, repOffset: E.fRepOffset, groupPos: E.fGroupPos };
    var halves = ["B", "T"];
    for (var hi = 0; hi < halves.length; hi++) for (var i = 12; i >= 1; i--) for (var si = 0; si <= 1; si++) {
      var nm = "Row " + halves[hi] + (i < 10 ? "0" + i : "" + i) + " " + ["L", "R"][si];
      var top = halves[hi] === "T";
      stripeLayer(nm, rowEx, colorLink(top ? "Top A" : "Bottom A"), colorLink(top ? "Top B" : "Bottom B"), si === 0);
    }
    for (var fi = 12; fi >= 1; fi--) stripeLayer("Floater " + (fi < 10 ? "0" + fi : "" + fi), flEx, E.fColA, E.fColB, true);

    // labels: a box shape layer under a text layer per word
    var fontOK = false;
    try { var found = app.fonts.getFontsByPostScriptName("Avantt-Bold"); fontOK = !!(found && found.length); } catch (e) {}
    if (!fontOK) log.push("Avantt-Bold not seen by AE; labels use a substitute until AE restarts");
    for (var gi = 0; gi < GROUPS.length; gi++) {
      var g = GROUPS[gi][0], maxW = GROUPS[gi][1], bx = BLOCKS[g];
      for (var wi = 1; wi <= maxW; wi++) {
        var bn = g + " W" + wi;
        var tl = comp.layers.addText("Word"); tl.name = bn;
        var td = tl.property("Source Text").value;
        td.resetCharStyle();
        try { td.font = "Avantt-Bold"; } catch (e) {}
        td.fontSize = bx.fs; td.tracking = -20; td.justification = ParagraphJustification.LEFT_JUSTIFY;
        td.fillColor = [0, 0, 0]; td.applyFill = true; td.applyStroke = false;
        tl.property("Source Text").setValue(td);
        setExpr(tl.property("Source Text"), bx.text);
        point3(tl, "BLK", bx.BLK); point3(tl, "BLK2", bx.BLK2);
        setExpr(tl.property("Transform").property("Position"), bx.textPos);
        var tm = tl.property("Masks").addProperty("ADBE Mask Atom"); tm.name = "Reveal"; setExpr(tm.property("ADBE Mask Shape"), bx.textMask);
        setExpr(tl.property("Transform").property("Opacity"), bx.textOpacity);
        var box = comp.layers.addShape(); box.name = bn + " Box"; atOrigin(box);
        var grp = box.property("Contents").addProperty("ADBE Vector Group"); grp.name = "Box";
        var brect = grp.property("Contents").addProperty("ADBE Vector Shape - Rect");
        setExpr(brect.property("ADBE Vector Rect Size"), bx.boxSize); setExpr(brect.property("ADBE Vector Rect Position"), bx.boxPos);
        var bfill = grp.property("Contents").addProperty("ADBE Vector Graphic - Fill"); setExpr(bfill.property("ADBE Vector Fill Color"), E.boxColor);
        var bm = box.property("Masks").addProperty("ADBE Mask Atom"); bm.name = "Reveal"; setExpr(bm.property("ADBE Mask Shape"), bx.boxMask);
        setExpr(box.property("Transform").property("Opacity"), bx.boxOpacity);
        box.moveAfter(tl);
      }
    }

    for (var hl = 0; hl < headLayers.length; hl++) headLayers[hl].moveToBeginning();
    lib.locked = true;
    // loop length as a read-only slider on CTRL (expression-driven), nothing drawn on the canvas
    var loopS = ctrl.property("Effects").addProperty("ADBE Slider Control"); loopS.name = "Loop length (s)";
    setExpr(loopS.property(1), E.loop);
    comp.workAreaStart = 0; comp.workAreaDuration = 8.35;
    comp.openInViewer();
  } catch (e) { log.push("BUILD EXCEPTION: " + e.toString() + " line " + e.line); }
  // diagnostics rendered to a png (file access may be off, rendering always works)
  var errs = {}, n = 0;
  try {
    function walk(prop, layerName) {
      for (var i = 1; i <= prop.numProperties; i++) {
        var p = prop.property(i);
        try {
          if (p.propertyType === PropertyType.PROPERTY) { if (p.expressionEnabled && p.expressionError) { n++; var k = String(p.expressionError).replace(/\s+/g, " ").slice(0, 230); if (!errs[k]) errs[k] = layerName + " / " + p.name; } }
          else walk(p, layerName);
        } catch (e) {}
      }
    }
    if (comp) for (var j = 1; j <= comp.numLayers; j++) walk(comp.layer(j), comp.layer(j).name);
  } catch (e) { log.push("diag: " + e.toString()); }
  var out = "";
  for (var li = 0; li < log.length; li++) out += "! " + log[li] + "\n";
  out += "errors " + n + "\n";
  var ec = 0;
  for (var k in errs) { if (ec++ >= 6) break; out += "- " + k + "  @ " + errs[k] + "\n"; }
  var t0 = new Date().getTime();
  try { if (comp) comp.saveFrameToPng(2.5, new File(DIAG_DIR + "/frameA.png")); out += "frame 2.5 s render ms " + (new Date().getTime() - t0) + "\n"; } catch (e) { out += "frame exc " + e + "\n"; }
  try { out += "version " + app.version + " Avantt " + app.fonts.getFontsByPostScriptName("Avantt-Bold").length + " layers " + (comp ? comp.numLayers : 0) + "\n"; } catch (e) {}
  try {
    var dcomp = app.project.items.addComp("DIAGCOMP", 2200, 1200, 1, 1, 1); dcomp.bgColor = [0, 0, 0];
    var dtl = dcomp.layers.addBoxText([2100, 1100], out.replace(/\n/g, "\r"));
    var dtd = dtl.property("Source Text").value; dtd.fontSize = 28; dtd.fillColor = [1, 1, 1]; dtd.applyStroke = false; dtd.justification = ParagraphJustification.LEFT_JUSTIFY; dtd.leading = 34; dtl.property("Source Text").setValue(dtd);
    dtl.property("Transform").property("Position").setValue([1100, 600]);
    dcomp.saveFrameToPng(0, new File(DIAG_DIR + "/diag.png"));
    dcomp.remove();
    if (comp) { comp.saveFrameToPng(0.2, new File(DIAG_DIR + "/frameB.png")); comp.saveFrameToPng(4.6, new File(DIAG_DIR + "/frameC.png")); comp.saveFrameToPng(7.4, new File(DIAG_DIR + "/frameD.png")); }
  } catch (e) {}
  try { if (comp) comp.comment = out; } catch (e) {}
  app.endUndoGroup();
})();
'''
defaults = {"holdClosed":1.5,"duration":1.5,"opening":100,"vignette":0,"faith":100,"falloffX":0.5,"falloffY":0.5,"falloffR":0.625,"holdOpen":1.5,"rowsTop":4,"rowsBottom":4,"stagger":0.15,"irregularity":30,"shapeSeed":1,
 "blockWidth":2,"blockTravel":4,"blockSeed":4,"floatCount":9,"floatSize":4.5,"floatTravel":100,
 "colorway":0, "colors":{"topA":"#E90062","topB":"#AA0026","bottomA":"#80FFE3","bottomB":"#027370","labelBg":"#FFEFA4","labelText":"#000000"},
 "labelY":401/679,"day":"Thursday 28.08","timeStart":"20:00","timeEnd":"21:00","artist":"Chris Stussy","stage":"Main Stage",
 "imageZoom":1.5526,"imageX":-0.3658,"imageY":-0.1703}
import sys
diagdir = sys.argv[1] if len(sys.argv) > 1 else ""
out = jsx % {"lib": js(LIB), "exprs": json.dumps(E, indent=1), "blocks": json.dumps(BLOCKS, indent=1), "groups": json.dumps(GROUPS), "defaults": json.dumps(defaults), "colorways": json.dumps(COLORWAYS),
             "image": js(str(HERE.parent / "public" / "default.jpg")), "W": W, "H": H,
             "diagdir": js(diagdir)}
(HERE / "build.jsx").write_text(out)
print("build.jsx", len(out), "bytes; lib", len(LIB), "chars (from", len(LIB_RAW), ")")
