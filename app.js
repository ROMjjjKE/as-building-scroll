(() => {
  'use strict';
  const TOTAL = 147;
  const isMobile = () => window.matchMedia('(max-width:820px)').matches;
  const dir = isMobile() ? 'frames-m' : 'frames';
  const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const pad = n => String(n).padStart(3, '0');

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', { alpha: false });
  const stage = document.querySelector('.stage');
  const loader = document.getElementById('loader');
  const loadPct = document.getElementById('loadPct');

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- плавный скролл ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------- кадры ---------- */
  const frames = new Array(TOTAL);
  let loaded = 0;
  const loadFrame = i => new Promise(res => {
    if (frames[i]) return res(frames[i]);
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { frames[i] = im; loaded++; updLoad(); res(im); };
    im.onerror = () => res(null);
    im.src = `${dir}/${pad(i + 1)}.webp`;
  });
  function updLoad() {
    const p = Math.round(loaded / TOTAL * 100);
    loadPct.textContent = p;
    if (loaded >= TOTAL) loader.classList.add('done');
  }

  /* ---------- canvas ---------- */
  let cw = 0, ch = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = stage.clientWidth; ch = stage.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    draw(curFrame, true);
  }
  // cover с якорем: на узких экранах держим дом в кадре (смещаем фокус вправо-вниз)
  function drawImg(im) {
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const s = Math.max(cv.width / iw, cv.height / ih);
    const w = iw * s, h = ih * s;
    const fx = cv.width / cv.height < 1 ? 0.62 : 0.5;
    const x = (cv.width - w) * fx, y = (cv.height - h) * 0.62;
    ctx.drawImage(im, x, y, w, h);
  }
  let curFrame = 0, lastDrawn = -1;
  function nearest(i) {            // если нужный кадр ещё не догрузился, берём ближайший готовый
    if (frames[i]) return frames[i];
    for (let d = 1; d < TOTAL; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }
  function draw(f, force) {
    const i = Math.max(0, Math.min(TOTAL - 1, Math.round(f)));
    if (i === lastDrawn && !force) return;
    const im = nearest(i);
    if (!im) return;
    drawImg(im);
    lastDrawn = i;
  }

  /* ---------- прогрессивная загрузка ----------
     1) кадры «через 10» сразу, чтобы скролл работал в любой точке
     2) затем остальные, начиная с ближайших к текущей позиции */
  async function boot() {
    await loadFrame(0);
    resize();
    const coarse = [];
    for (let i = 0; i < TOTAL; i += 10) coarse.push(i);
    coarse.push(TOTAL - 1);
    await Promise.all(coarse.map(loadFrame));
    const rest = [];
    for (let i = 0; i < TOTAL; i++) if (!frames[i]) rest.push(i);
    let k = 0;
    const worker = async () => {
      while (k < rest.length) {
        // приоритет: ближайшие к текущему кадру
        rest.sort((a, b) => Math.abs(a - curFrame) - Math.abs(b - curFrame));
        const i = rest.shift();
        if (frames[i]) continue;
        await loadFrame(i);
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
    words: [...el.querySelectorAll('h1 i')],
    state: 0
  }));

  const stageNames = ['Участок', 'Земля', 'Фундамент', 'Кровля', 'Ключи'];
  const hudNum = document.getElementById('hudNum');
  const hudBar = document.getElementById('hudBar');
  const hudName = document.getElementById('hudName');
  let hudIdx = -1;

  // тексты привязаны к прогрессу напрямую: scrub, а не «проигрывание по таймеру»
  function setScene(s, p) {
    const span = s.to - s.from;
    const t = (p - s.from) / span;                 // 0..1 внутри сцены
    const inT = Math.min(1, Math.max(0, t / 0.22)); // вход: первые 22 %
    const outT = Math.min(1, Math.max(0, (t - 0.80) / 0.20)); // выход: последние 20 %
    const visible = t > 0 && t < 1;
    s.el.classList.toggle('on', visible);
    if (!visible) { s.el.style.opacity = 0; return; }

    const e = x => 1 - Math.pow(1 - x, 3);
    const ein = e(inT), eout = outT * outT;
    const dirX = s.side === 'l' ? -1 : s.side === 'r' ? 1 : 0;
    // каждая сцена приходит со своей стороны и уходит в противоположную: взгляд идёт «сквозь» дом
    const xIn = dirX * (1 - ein) * 90;
    const xOut = -dirX * eout * 90;
    const yIn = s.side === 'c' ? (1 - ein) * 60 : 0;
    s.el.style.opacity = (ein * (1 - eout)).toFixed(3);

    // дети появляются каскадом, но от того же прогресса
    s.kids.forEach((k, i) => {
      const local = Math.min(1, Math.max(0, inT * 1.5 - i * 0.16));
      const le = e(local);
      const x = dirX * (1 - le) * (50 + i * 22) + xOut * (0.6 + i * 0.12);
      const y = (1 - le) * 22 + yIn * 0.3;
      k.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      k.style.opacity = (le * (1 - Math.min(1, eout * 1.25))).toFixed(3);
    });

    // заголовок первой сцены: слова выезжают из-под маски
    if (s.words.length) {
      s.words.forEach((w, i) => {
        const local = Math.min(1, Math.max(0, inT * 1.4 - i * 0.12));
        const lo = Math.min(1, outT * 1.2);
        const y = (1 - e(local)) * 110 - e(lo) * 110;
        w.style.transform = `translate3d(0,${y.toFixed(1)}%,0)`;
      });
    }
    // линия-выноска «чертится» вместе со скроллом
    if (s.callout) {
      const draw = Math.min(1, Math.max(0, (t - 0.08) / 0.4));
      s.callout.style.strokeDashoffset = (420 * (1 - e(draw))).toFixed(1);
    }
  }

  function updateHud(p) {
    const idx = p < 0.18 ? 0 : p < 0.39 ? 1 : p < 0.61 ? 2 : p < 0.81 ? 3 : 4;
    const seg = [[0, .18], [.18, .39], [.39, .61], [.61, .81], [.81, 1]][idx];
    hudBar.style.transform = `scaleX(${Math.min(1, Math.max(0, (p - seg[0]) / (seg[1] - seg[0]))).toFixed(3)})`;
    if (idx !== hudIdx) {
      hudIdx = idx;
      hudNum.textContent = String(idx + 1).padStart(2, '0');
      hudName.textContent = stageNames[idx];
      gsap.fromTo([hudNum, hudName], { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: 'power3.out', stagger: .05, overwrite: true });
    }
    // сторона затемнения под текст
    const sc = info.find(s => p >= s.from + 0.02 && p <= s.to - 0.02);
    stage.dataset.side = sc ? sc.side : 'l';
  }

  /* ---------- связка со скроллом ---------- */
  ScrollTrigger.create({
    trigger: '#scroller',
    start: 'top top',
    end: 'bottom bottom',
    scrub: false,                         // прогресс = положение скролла, без своей анимации времени
    onUpdate: self => {
      const p = self.progress;
      curFrame = p * (TOTAL - 1);
      draw(curFrame);
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
    top.classList.toggle('hide', y > lastY && y > innerHeight * 0.6 && y < document.getElementById('scroller').offsetHeight - innerHeight);
    lastY = y;
  }, { passive: true });

  /* ---------- старт ---------- */
  window.addEventListener('resize', () => { resize(); ScrollTrigger.refresh(); });
  boot().then(() => { draw(curFrame, true); window.__ready = true; });
  // первый вход: показать первую сцену сразу
  setScene(info[0], 0.001);
  info[0].el.style.opacity = 1;
  info[0].el.classList.add('on');
  info[0].words.forEach(w => w.style.transform = 'translate3d(0,0,0)');
  info[0].kids.forEach(k => { k.style.opacity = 1; });

  // для отладки/проверки
  window.__scrollState = () => ({ frame: lastDrawn, loaded, p: ScrollTrigger.getAll()[0]?.progress });
})();
