/* bw.js - drive an embedded brainWhiz from a demo page.
 *
 * One iframe in 'slice' mode gives four tiles brainWhiz lays out itself:
 * sagittal, coronal, axial and a 3D render. Per-region values go in as
 * {jhuRegionId: value} and paint all four.
 *
 * Getting the slice planes to paint took some finding. brainWhiz draws them
 * two ways: 'voxel' (needs a volumetric stat map, which we do not have -- we
 * have per-region numbers) and 'mesh' (region cross-sections, each filled
 * with its overlay value, which is exactly what we want). The default is
 * voxel, so out of the box the planes stay grey while only the 3D colours.
 *
 * Neither the ?slicekind= URL parameter nor applyConfig({_sliceKind}) sticks
 * -- verified against the live build, both leave #slKindVox selected. The one
 * thing that does work is clicking the #slKindMesh button. So this reaches
 * into the iframe and clicks it, which is allowed because the demos and
 * brainWhiz are served from the same origin (both live under
 * rnorlund.github.io in production; serve_demos.py proxies brainWhiz to the
 * same localhost origin so the preview behaves identically).
 *
 * Same route gets us the two other things postMessage does not expose:
 * mesh smoothing (#smooth, default 4 -- too faceted) and the sagittal slice
 * position (#slPosX, default 0 -- the midline, where no lateral region has
 * anything to show).
 *
 *   const bw = BW.mount(el, {cmap:'hot', cmin:0, cmax:1});
 *   bw.ready.then(() => bw.setValues({155: 0.47}));
 */
const BW = (() => {
  // relative, so the iframe is same-origin wherever this is served from
  const BASE = "/brainWhiz/index.html";
  // names brainWhiz actually has -- read from its #cmap select, not guessed
  const CMAPS = ["plasma", "viridis", "inferno", "magma", "cividis", "hot",
                 "fire", "turbo", "YlOrRd", "cool", "coolwarm", "RdBu_rev"];
  // left hemisphere, through the peri-sylvian regions these models care about
  const SLICES = { x: -48, y: -18, z: 14 };
  const SMOOTH = 14;                       // #smooth default is 4, too faceted
  /* Shading. Out of the box the render sits under a white haze: the rim light
     draws a bright edge right round the surface and the ambient term floods it,
     so every overlay colour is lifted toward white. Killing the rim, cutting
     ambient and giving the exposure back gets saturated colour with the depth
     intact; ovVivid/vivid/satCut then stop the colormap being desaturated. */
  const SHADE = { ovVivid: 2.2, vivid: 2.0, rim: 0, ambInt: 0.35,
                  exposure: 1.25, satCut: 0 };

  function mount(host, opts = {}) {
    host.innerHTML = "";
    const f = document.createElement("iframe");
    const p = new URLSearchParams({
      embed: "1",
      atlas: opts.atlas || "jhu",
      mode: opts.mode || "slice",          // slice = 3 planes + 3D render
      bg: (opts.bg || "0e0e10").replace("#", ""),
    });
    if (opts.view) p.set("view", opts.view);
    f.src = `${BASE}?${p}`;
    f.style.cssText = "border:0;width:100%;height:100%;display:block;background:#0e0e10";
    f.setAttribute("title", "brainWhiz viewer");
    host.appendChild(f);

    const slices = { ...SLICES, ...(opts.slices || {}) };
    const smooth = opts.smooth != null ? opts.smooth : SMOOTH;
    const shade = { ...SHADE, ...(opts.shade || {}) };

    let resolveReady;
    const ready = new Promise(r => (resolveReady = r));
    const post = m => { try { f.contentWindow.postMessage({ brainWhiz: true, ...m }, "*"); } catch (_) {} };

    // --- the same-origin half -------------------------------------------
    const doc = () => { try { return f.contentDocument; } catch (_) { return null; } };
    const set = (id, v) => {
      const d = doc(); if (!d) return false;
      const el = d.getElementById(id); if (!el) return false;
      // Dispatching input/change makes brainWhiz re-render all four tiles, and
      // the iframe is same-origin so that blocks the host's slider handling.
      // Writing a value the control already holds is pure cost: skip it.
      if (String(el.value) === String(v)) return true;
      el.value = v;
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      return true;
    };
    /* Switch the planes to region cross-sections and fix up smoothing and
       slice positions. Returns false if we are cross-origin, in which case
       the 3D render still works and the planes stay on the template. */
    function tune() {
      const d = doc(); if (!d) return false;
      const btn = d.getElementById("slKindMesh");
      if (btn && !/\bon\b/.test(btn.className)) btn.click();
      set("smooth", smooth);
      set("slPosX", slices.x); set("slPosY", slices.y); set("slPosZ", slices.z);
      for (const k in shade) set(k, shade[k]);
      return true;
    }
    let tuned = false, rafId = 0, pending = null, styled = false, lastTune = 0, lastPush = 0;
    /* Once tuned, the only setting that drifts is the slice-kind button (a new
       overlay can knock it back to voxel). Everything else in tune() is already
       at its target, so reading one className beats re-running the whole thing. */
    const retune = () => {
      if (!tuned) { tuned = tune(); return; }
      const d = doc(); if (!d) return;
      const btn = d.getElementById("slKindMesh");
      if (btn && /\bon\b/.test(btn.className)) return;   // still meshed: nothing to do
      tune();
    };

    /* Overlay style. brainWhiz creates the overlay on the first
       setRegionValues; a colormap posted before that styles nothing and the
       new overlay comes up with the viewer default. So the style is kept here
       and re-applied a beat after every value push, not just on ready. */
    const style = { cmap: opts.cmap || "hot", cmin: opts.cmin, cmax: opts.cmax, thr: opts.thr };
    const restyle = () => {
      post({ cmd: "setColormap", cmap: style.cmap });
      if (style.cmin != null || style.cmax != null)
        post({ cmd: "setRange", cmin: style.cmin, cmax: style.cmax });
      // Never post the bridge's setThreshold: it drives brainWhiz's threshold
      // slider to 0.5 of the range and the slider then ignores every later
      // write. Same-origin lets us set the slider itself instead.
      if (style.thr != null && style.cmax != null) {
        const lo = style.cmin || 0, frac = Math.max(0, Math.min(1, (style.thr - lo) / Math.max(style.cmax - lo, 1e-9)));
        setTimeout(() => set("cthresh", frac), 120);   // never touch #cthreshMode: its change handler resets the slider
      }
    };

    window.addEventListener("message", e => {
      if (e.data?.brainWhiz !== true || e.source !== f.contentWindow) return;
      if (e.data.type !== "ready") return;
      restyle();
      // brainWhiz builds its slice DOM a beat after it announces ready
      setTimeout(retune, 400);
      setTimeout(retune, 1500);
      resolveReady(api);
    });

    const api = {
      ready, cmaps: CMAPS, frame: f,
      /* Dragging a slider fires input ~100x/s. Each push makes brainWhiz
         repaint all four tiles, and the iframe is same-origin so that runs on
         the host's own main thread -- pushing every event starved the slider
         handler itself. Coalesce to the trailing value and leave >=70ms
         between pushes (~14/s, visually identical during a drag), and
         re-assert the viewer settings at most every couple of seconds. */
      setValues(values, name) {
        pending = { values, name: name || "prediction" };
        if (rafId) return;
        const wait = Math.max(0, 70 - (Date.now() - lastPush));
        const schedule = cb => wait ? setTimeout(cb, wait) : requestAnimationFrame(cb);
        rafId = 1;
        schedule(() => {
          rafId = 0; lastPush = Date.now();
          const p = pending; pending = null;
          if (!p) return;
          post({ cmd: "setRegionValues", values: p.values, name: p.name });
          if (!styled) { styled = true; setTimeout(restyle, 150); }
          const now = Date.now();
          if (now - lastTune > 2000) { lastTune = now; setTimeout(retune, 250); }
        });
      },
      setColormap(cmap) { if (cmap === style.cmap) return; style.cmap = cmap; restyle(); },
      setRange(cmin, cmax) {
        if (cmin === style.cmin && cmax === style.cmax) return;
        style.cmin = cmin; style.cmax = cmax; restyle();
      },
      setThreshold(thr) { style.thr = thr; restyle(); },
      setView(view) { post({ cmd: "setView", view }); },
      setMode(mode) { post({ cmd: "setMode", mode }); setTimeout(retune, 600); },
      setSmooth(v) { set("smooth", v); },
      setShading(o) { for (const k in o) set(k, o[k]); },
      setSlice(axis, v) { set("slPos" + axis.toUpperCase(), v); },
      clear() { post({ cmd: "clearOverlay" }); },
    };
    return api;
  }

  /* A <select> of colour schemes wired to one or more viewers. */
  function cmapPicker(sel, viewers, initial) {
    sel.innerHTML = CMAPS.map(c =>
      `<option value="${c}"${c === initial ? " selected" : ""}>${c}</option>`).join("");
    sel.addEventListener("change", () =>
      [].concat(viewers).forEach(v => v && v.setColormap(sel.value)));
  }

  return { mount, cmapPicker, CMAPS };
})();
