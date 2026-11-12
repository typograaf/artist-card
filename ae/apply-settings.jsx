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
  var sliders = { holdClosed: "Hold closed", duration: "Opening time", opening: "Opening %", vignette: "Vignette %", holdOpen: "Hold open", rowsTop: "Rows top", rowsBottom: "Rows bottom",
    stagger: "Rows stagger", irregularity: "Irregularity %", shapeSeed: "Shape seed", blockWidth: "Block width", blockTravel: "Block travel", blockSeed: "Block seed",
    floatCount: "Floaters", floatSize: "Floaters size", floatTravel: "Floaters travel" };
  var colours = { "colors.topA": "Top A", "colors.topB": "Top B", "colors.bottomA": "Bottom A", "colors.bottomB": "Bottom B", "colors.labelBg": "Label bg", "colors.labelText": "Label text" };
  var texts = { day: "INPUT Day", timeStart: "INPUT Time start", timeEnd: "INPUT Time end", artist: "INPUT Artist", stage: "INPUT Stage" };
  // the 67 locked colourways (top A, top B, bottom A, bottom B), same order as the web tool
  var COLORWAYS = [["#829FFF","#1625F8","#00504E","#00201F"], ["#FDAA5B","#A04B08","#92C2F7","#1625F8"], ["#70FFDF","#00E3ED","#8D5DF3","#3D06B7"], ["#70FF97","#00FA7D","#8D5DF3","#0906B7"], ["#00E3ED","#02A9E8","#A60821","#400902"], ["#8D5DF3","#5002DC","#C67406","#3C4002"], ["#FF63A0","#ED0025","#0906B7","#020B40"], ["#5D52FA","#0727D5","#C602DC","#6E047C"], ["#90FF70","#00FA02","#F3705D","#A60821"], ["#BFF381","#4AF502","#879A0E","#3C4002"], ["#E88602","#A04B08","#7F83F6","#0727D5"], ["#F9FD5B","#B8DC02","#879A0E","#3C4002"], ["#F8DA7C","#C67406","#F3705D","#7C3904"], ["#5D52FA","#3D06B7","#70FFDF","#07D562"], ["#4AF502","#3BBA06","#02A9E8","#04417C"], ["#ED4084","#A60821","#92C2F7","#0796D5"], ["#FF63A0","#ED0025","#EC41F6","#8102A3"], ["#FDAA5B","#E88602","#A04B08","#402202"], ["#FF63F4","#ED00A5","#8D5DF3","#0906B7"], ["#F53A35","#A60821","#F792D5","#E90062"], ["#FDAA5B","#A04B08","#F99390","#F53A35"], ["#FF63A0","#E90062","#ED4084","#7C0423"], ["#EC41F6","#8102A3","#E292F7","#EC41F6"], ["#ED4084","#A6086E","#F792D5","#ED4084"], ["#F792D5","#ED4084","#0906B7","#020B40"], ["#E90062","#A6086E","#70FFDF","#00E3ED"], ["#ED4084","#A6086E","#387CF5","#041F7C"], ["#ED4084","#A60821","#BFF381","#8FD507"], ["#FDAA5B","#E88602","#3D06B7","#250240"], ["#FF63A0","#ED0025","#70FF97","#06B72B"], ["#90FF70","#00FA02","#A6086E","#400227"], ["#C602DC","#8102A3","#F8DA7C","#E88602"], ["#FDAA5B","#E88602","#00504E","#70FFDF"], ["#EC41F6","#C602DC","#879A0E","#3C4002"], ["#F53A35","#A60821","#92C2F7","#1649F8"], ["#1625F8","#00FA7D","#FF63A0","#E90062"], ["#E90062","#FF63A0","#C602DC","#70FFDF"], ["#00E3ED","#02A9E8","#FDAA5B","#5002DC"], ["#FF63F4","#ED00A5","#FDAA5B","#E90062"], ["#FF63F4","#ED00A5","#F9FD5B","#ED0025"], ["#FF63A0","#E90062","#FF63F4","#5002DC"], ["#ED0025","#70FFDF","#00E3ED","#02A9E8"], ["#5002DC","#8D5DF3","#5002DC","#00E3ED"], ["#E90062","#FF63A0","#C602DC","#00FA02"], ["#5002DC","#8D5DF3","#1649F8","#4AF502"], ["#ED00A5","#FF63F4","#E90062","#70FFDF"], ["#ED00A5","#FF63F4","#5002DC","#00FA02"], ["#FF63A0","#E90062","#70FFDF","#ED0025"], ["#1625F8","#70FFDF","#FF63F4","#ED00A5"], ["#00E3ED","#02A9E8","#70FFDF","#E90062"], ["#E90062","#00FA7D","#00E3ED","#02A9E8"], ["#FF63F4","#ED00A5","#70FFDF","#1625F8"], ["#F3705D","#F99390","#00FA7D","#5002DC"], ["#ED00A5","#FF63F4","#E90062","#F9FD5B"], ["#E90062","#70FFDF","#F3705D","#F99390"], ["#FF63A0","#E90062","#00E3ED","#ED0025"], ["#E90062","#F9FD5B","#00FA7D","#70FFDF"], ["#5002DC","#8D5DF3","#ED00A5","#70FFDF"], ["#FF63F4","#ED00A5","#F3705D","#5002DC"], ["#E90062","#FDAA5B","#8FD507","#BFF381"], ["#F3705D","#F99390","#FF63A0","#5002DC"], ["#5002DC","#8D5DF3","#ED0025","#70FFDF"], ["#C602DC","#E292F7","#E90062","#70FFDF"], ["#E90062","#8FD507","#ED0025","#A60821"], ["#ED00A5","#FF63F4","#5002DC","#00FA7D"], ["#FF63A0","#E90062","#F9FD5B","#E90062"], ["#1625F8","#70FFDF","#5002DC","#8D5DF3"]];
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
    // colourway: lock to the matching set, or free the colour controls for custom colours
    try {
      var hx = function (k) { var h = String(obj[k] === undefined ? "" : obj[k]).replace(/^#/, "").toUpperCase(); return h.length === 6 ? "#" + h : ""; };
      var cur = [hx("colors.topA"), hx("colors.topB"), hx("colors.bottomA"), hx("colors.bottomB")];
      if (cur[0] && cur[1] && cur[2] && cur[3]) {
        var cw = 0;
        for (var ci = 0; ci < COLORWAYS.length && !cw; ci++) if (COLORWAYS[ci].join() === cur.join()) cw = ci + 1;
        ctrl.effect("Colourway").property(1).setValue(cw); applied.push("Colourway " + (cw || "0 (custom)"));
      } else if (cur[0] || cur[1] || cur[2] || cur[3]) { ctrl.effect("Colourway").property(1).setValue(0); applied.push("Colourway 0 (custom)"); }
    } catch (e) {}
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
