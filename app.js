(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const pad = n => String(n).padStart(3, '0');

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', { alpha: false });
  const stage = document.querySelector('.stage');
  const loader = document.getElementById('loader');
  const loadPct = document.getElementById('loadPct');

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- два сегмента ----------
     space: орбита, падение  0    → 0.42
     build: таймлапс стройки 0.42 → 1     */
  const SEGS = [
    { key: 'space', n: 142, from: 0.00, to: 0.42 },
    { key: 'build', n: 147, from: 0.42, to: 1.00 }
  ];
  const BLEND = 0.022;                 // полуширина зоны наплыва на стыке
  const TOTAL = SEGS.reduce((s, x) => s + x.n, 0);

  /* ---------- плавный скролл ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.78, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------- загрузка кадров ---------- */
  const isMobile = () => window.matchMedia('(max-width:820px)').matches;
  const buf = {};
  let loaded = 0;
  const DIRS = {
    space: { d: 'frames-space', m: 'frames-space-m' },
    build: { d: 'frames',       m: 'frames-m' }
  };
  const dirOf = key => isMobile() ? DIRS[key].m : DIRS[key].d;

  function loadOne(key, i) {
    buf[key] = buf[key] || new Array(SEGS.find(s => s.key === key).n);
    const arr = buf[key];
    if (arr[i]) return Promise.resolve(arr[i]);
    return new Promise(res => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { arr[i] = im; loaded++; updLoad(); res(im); };
      im.onerror = () => res(null);
      im.src = `${dirOf(key)}/${pad(i + 1)}.webp`;
    });
  }
  function updLoad() {
    const p = Math.round(loaded / TOTAL * 100);
    loadPct.textContent = p;
    if (loaded >= TOTAL) loader.classList.add('done');
  }
  function nearest(key, i) {
    const arr = buf[key];
    if (!arr) return null;
    if (arr[i]) return arr[i];
    const n = arr.length;
    for (let d = 1; d < n; d++) {
      if (i - d >= 0 && arr[i - d]) return arr[i - d];
      if (i + d < n && arr[i + d]) return arr[i + d];
    }
    return null;
  }

  /* ---------- canvas ---------- */
  let cw = 0, ch = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = stage.clientWidth; ch = stage.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    render(curP, true);
  }
  function drawImg(im, alpha) {
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const s = Math.max(cv.width / iw, cv.height / ih);
    const w = iw * s, h = ih * s;
    const fx = cv.width / cv.height < 1 ? 0.62 : 0.5;
    const x = (cv.width - w) * fx, y = (cv.height - h) * 0.62;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, x, y, w, h);
    ctx.globalAlpha = 1;
  }

  let curP = 0, lastKey = '';
  function frameOf(seg, p) {
    const t = (p - seg.from) / (seg.to - seg.from);
    return Math.max(0, Math.min(seg.n - 1, Math.round(t * (seg.n - 1))));
  }
  function render(p, force) {
    const space = SEGS[0], build = SEGS[1];
    const mark = space.to;                       // 0.42
    const stamp = p.toFixed(4);
    if (!force && stamp === lastKey) return;

    // зона наплыва: последние кадры орбиты растворяются в первом кадре стройки
    if (Math.abs(p - mark) < BLEND) {
      const k = (p - (mark - BLEND)) / (2 * BLEND);          // 0..1
      const a = nearest('space', space.n - 1);
      const b = nearest('build', 0);
      if (a && b) {
        drawImg(a, 1);
        drawImg(b, Math.min(1, Math.max(0, k)));
      } else if (a || b) {
        drawImg(a || b, 1);
      }
      lastKey = stamp; return;
    }

    const seg = p < mark ? space : build;
    const im = nearest(seg.key, frameOf(seg, p));
    if (im) drawImg(im, 1);
    lastKey = stamp;
  }

  /* ---------- прогрессивная загрузка ---------- */
  async function boot() {
    await loadOne('space', 0);
    resize();
    const coarse = [];
    for (let i = 0; i < 142; i += 12) coarse.push(['space', i]);
    for (let i = 0; i < 147; i += 12) coarse.push(['build', i]);
    coarse.push(['space', 141], ['build', 146]);
    await Promise.all(coarse.map(([k, i]) => loadOne(k, i)));

    const rest = [];
    for (let i = 0; i < 142; i++) if (!buf.space[i]) rest.push(['space', i]);
    for (let i = 0; i < 147; i++) if (!buf.build[i]) rest.push(['build', i]);
    const order = i => Math.abs((SEGS.find(s => s.key === i[0]).from + SEGS.find(s => s.key === i[0]).to) / 2 - curP);
    const worker = async () => {
      while (rest.length) {
        rest.sort((a, b) => order(a) - order(b));
        const [k, i] = rest.shift();
        if (!buf[k][i]) await loadOne(k, i);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  /* ---------- тексты ---------- */
  const scenes = [...document.querySelectorAll('.scene')];
  const info = scenes.map(el => ({
    el,
    from: +el.dataset.from, to: +el.dataset.to, side: el.dataset.side,
    kids: [...el.children].filter(c => !c.classList.contains('callout')),
    callout: el.querySelector('.callout path'),
    words: [...el.querySelectorAll('h1 i')]
  }));

  const stageNames = ['Орбита', 'Снижение', 'Участок', 'Фундамент', 'Кровля', 'Ключи'];
  const stageEdges = [0, 0.12, 0.40, 0.56, 0.71, 0.85, 1.01];
  const hudNum = document.getElementById('hudNum');
  const hudBar = document.getElementById('hudBar');
  const hudName = document.getElementById('hudName');
  let hudIdx = -1;

  const e3 = x => 1 - Math.pow(1 - x, 3);
  function setScene(s, p) {
    const t = (p - s.from) / (s.to - s.from);
    const inT = Math.min(1, Math.max(0, t / 0.22));
    const outT = Math.min(1, Math.max(0, (t - 0.80) / 0.20));
    const visible = t > 0 && t < 1;
    s.el.classList.toggle('on', visible);
    if (!visible) { s.el.style.opacity = 0; return; }

    const ein = e3(inT), eout = outT * outT;
    const dirX = s.side === 'l' ? -1 : s.side === 'r' ? 1 : 0;
    const xIn = dirX * (1 - ein) * 90;
    const xOut = -dirX * eout * 90;
    const yIn = s.side === 'c' ? (1 - ein) * 60 : 0;
    s.el.style.opacity = (ein * (1 - eout)).toFixed(3);

    s.kids.forEach((k, i) => {
      const local = Math.min(1, Math.max(0, inT * 1.5 - i * 0.16));
      const le = e3(local);
      const x = dirX * (1 - le) * (50 + i * 22) + xOut * (0.6 + i * 0.12);
      const y = (1 - le) * 22 + yIn * 0.3;
      k.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      k.style.opacity = (le * (1 - Math.min(1, eout * 1.25))).toFixed(3);
    });

    s.words.forEach((w, i) => {
      const local = Math.min(1, Math.max(0, inT * 1.4 - i * 0.12));
      const lo = Math.min(1, outT * 1.2);
      const y = (1 - e3(local)) * 110 - e3(lo) * 110;
      w.style.transform = `translate3d(0,${y.toFixed(1)}%,0)`;
    });

    if (s.callout) {
      const dr = Math.min(1, Math.max(0, (t - 0.08) / 0.4));
      s.callout.style.strokeDashoffset = (420 * (1 - e3(dr))).toFixed(1);
    }
  }

  function updateHud(p) {
    let idx = 0;
    for (let i = 0; i < stageNames.length; i++) if (p >= stageEdges[i]) idx = i;
    const a = stageEdges[idx], b = stageEdges[idx + 1];
    hudBar.style.transform = `scaleX(${Math.max(0, Math.min(1, (p - a) / (b - a))).toFixed(3)})`;
    if (idx !== hudIdx) {
      hudIdx = idx;
      hudNum.textContent = String(idx + 1).padStart(2, '0');
      hudName.textContent = stageNames[idx];
      gsap.fromTo([hudNum, hudName], { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: .5, ease: 'power3.out', stagger: .05, overwrite: true });
    }
    const sc = info.find(s => p >= s.from + 0.02 && p <= s.to - 0.02);
    stage.dataset.side = sc ? sc.side : 'c';
  }

  /* ---------- связка со скроллом ---------- */
  ScrollTrigger.create({
    trigger: '#scroller',
    start: 'top top',
    end: 'bottom bottom',
    scrub: false,
    onUpdate: self => {
      const p = self.progress;
      curP = p;
      render(p);
      info.forEach(s => setScene(s, p));
      updateHud(p);
    }
  });

  /* ---------- шапка ---------- */
  const top = document.getElementById('top');
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    top.classList.toggle('solid', y > 40);
    lastY = y;
  }, { passive: true });

  window.addEventListener('resize', () => { resize(); ScrollTrigger.refresh(); });
  boot().then(() => { render(curP, true); window.__ready = true; });

  setScene(info[0], 0.001);
  info[0].el.style.opacity = 1;
  info[0].el.classList.add('on');
  info[0].words.forEach(w => w.style.transform = 'translate3d(0,0,0)');
  info[0].kids.forEach(k => { k.style.opacity = 1; });

  window.__scrollState = () => ({ p: curP, loaded, last: lastKey });
})();
