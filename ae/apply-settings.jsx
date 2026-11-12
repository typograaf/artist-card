// Touquet 2027 artist card: paste a link or the Copy Settings JSON from the web
// tool and the CTRL sliders, colours and INPUT texts in the open comp follow.
// File > Scripts > Run Script File > apply-settings.jsx (with "Artist card — tool v2" open or selected)
(function () {
  var comp = app.project.activeItem;
  if (!(comp instanceof CompItem) || !comp.layer("CTRL")) {
    for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === "Artist card — tool v2") comp = it; }
  }
  if (!(comp instanceof CompItem) || !comp.layer("CTRL")) { alert("Open the comp built by build.jsx first (it needs the CTRL layer)."); return; }
  var input = prompt("Paste the tool link (typograaf.github.io/artist-card/#...) or the Copy Settings text:", "");
  if (!input) return;
  input = input.replace(/^\s+|\s+$/g, "");
  var obj = {};
  if (input.charAt(0) === "{") {
    try { obj = eval("(" + input + ")"); } catch (e) { alert("That is not valid settings text."); return; }
    if (obj.colors) for (var ck in obj.colors) obj["colors." + ck] = obj.colors[ck];
  } else {
    var hash = input.indexOf("#") >= 0 ? input.slice(input.indexOf("#") + 1) : input;
    var pairs = hash.split("&");
    for (var p = 0; p < pairs.length; p++) {
      if (!pairs[p]) continue;
      var kv = pairs[p].split("=");
      var key = decodeURIComponent(kv[0]);
      var val = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
      obj[key] = val;
    }
  }
  var ctrl = comp.layer("CTRL");
  var sliders = { holdClosed: "Hold closed", duration: "Opening time", opening: "Opening %", holdOpen: "Hold open", rowsTop: "Rows top", rowsBottom: "Rows bottom",
    stagger: "Rows stagger", irregularity: "Irregularity %", shapeSeed: "Shape seed", blockWidth: "Block width", blockTravel: "Block travel", blockSeed: "Block seed",
    floatCount: "Floaters", floatSize: "Floaters size", floatTravel: "Floaters travel" };
  var colours = { "colors.topA": "Top A", "colors.topB": "Top B", "colors.bottomA": "Bottom A", "colors.bottomB": "Bottom B", "colors.labelBg": "Label bg", "colors.labelText": "Label text" };
  var texts = { day: "INPUT Day", timeStart: "INPUT Time start", timeEnd: "INPUT Time end", artist: "INPUT Artist", stage: "INPUT Stage" };
  var applied = [], skipped = [];
  app.beginUndoGroup("Apply artist card settings");
  try {
    for (var k in obj) {
      var v = obj[k];
      try {
        if (sliders[k]) { var n = parseFloat(v); if (isFinite(n)) { ctrl.effect(sliders[k]).property(1).setValue(n); applied.push(sliders[k]); } }
        else if (k === "labelY") { ctrl.effect("Label Y %").property(1).setValue(parseFloat(v) * 100); applied.push("Label Y %"); }
        else if (k === "staggerOrder") { ctrl.effect("Stagger order").property(1).setValue(v === "top" ? 1 : v === "bottom" ? 2 : 3); applied.push("Stagger order"); }
        else if (colours[k]) { var hex = String(v).replace(/^#/, ""); if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1"); var num = parseInt(hex, 16); if (hex.length === 6 && isFinite(num)) { ctrl.effect(colours[k]).property(1).setValue([((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255]); applied.push(colours[k]); } }
        else if (texts[k]) { var tl = comp.layer(texts[k]); var td = tl.property("Source Text").value; td.text = String(v); tl.property("Source Text").setValue(td); applied.push(texts[k]); }
        else if (k === "imageZoom" || k === "imageX" || k === "imageY" || k === "format" || k === "focus" || k === "easing" || k === "fontFamily" || /^moveM|^floatMove/.test(k)) skipped.push(k);
      } catch (e) { skipped.push(k); }
    }
    // image: cover-fit zoom / pan from the link onto the IMAGE layer
    try {
      var img = comp.layer("IMAGE");
      if (img && (obj.imageZoom !== undefined || obj.imageX !== undefined || obj.imageY !== undefined)) {
        var W = comp.width, H = comp.height, iw = img.source.width, ih = img.source.height;
        var zoom = obj.imageZoom !== undefined ? parseFloat(obj.imageZoom) : 1, ox = obj.imageX !== undefined ? parseFloat(obj.imageX) : 0, oy = obj.imageY !== undefined ? parseFloat(obj.imageY) : 0;
        var s = Math.max(W / iw, H / ih) * zoom, dw = iw * s, dh = ih * s;
        var x = (W - dw) / 2 - ox * ((dw - W) / 2), y = (H - dh) / 2 - oy * ((dh - H) / 2);
        img.property("Transform").property("Scale").setValue([s * 100, s * 100]);
        img.property("Transform").property("Position").setValue([x + dw / 2, y + dh / 2]);
        applied.push("IMAGE zoom / position");
      }
    } catch (e) {}
  } finally { app.endUndoGroup(); }
  alert("Applied " + applied.length + " setting" + (applied.length === 1 ? "" : "s") + (applied.length ? ": " + applied.join(", ") : "") + (skipped.length ? "\nNot in AE: " + skipped.join(", ") : ""));
})();
