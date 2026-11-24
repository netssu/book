/* =====================================================================
   Forja de Tomos — Paginador
   Distribui os blocos em páginas com DUAS COLUNAS CONTÍNUAS:
   o texto enche a coluna 1, continua na coluna 2 e segue para a
   próxima página. Parágrafos são cortados palavra a palavra, listas
   item a item, tabelas linha a linha (repetindo o cabeçalho) e
   quadros/notas filho a filho.
   ===================================================================== */
(function (global) {
  'use strict';

  let fragSeq = 0;
  const MIN_COLS = 60;          // altura mínima (px) para abrir colunas no resto da página
  const HEADING_RE = /^H[2-6]$/;

  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const bottomOf = k => k.offsetTop + k.offsetHeight;
  const isPin = k => k.classList.contains('pin-bottom');
  const flowKids = c => [...c.children].filter(k => !isPin(k));
  const colLimit = c => (c._limit != null ? c._limit : c.clientHeight);

  function colFits(c) {
    const lim = colLimit(c) + 0.5;
    for (const k of c.children) {
      if (isPin(k)) continue;
      if (bottomOf(k) > lim) return false;
    }
    return true;
  }

  function linkFrag(a, b) {
    const id = a.dataset.frag || ('f' + (++fragSeq));
    a.dataset.frag = id; b.dataset.frag = id;
  }

  function trimStartNode(node) {
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      t.data = t.data.replace(/^\s+/, '');
      if (t.data) break;
    }
  }

  /* ---------- divisão de texto (palavra a palavra) ---------- */
  function splitText(node, fits) {
    const orig = node.cloneNode(true);
    const pos = [];
    const w = document.createTreeWalker(orig, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      const re = /\s+/g; let m;
      while ((m = re.exec(t.data))) pos.push({ node: t, offset: m.index });
    }
    if (!pos.length) return null;

    const range = document.createRange();
    const setHead = k => {
      range.setStart(orig, 0);
      range.setEnd(pos[k].node, pos[k].offset);
      node.replaceChildren(range.cloneContents());
    };
    const restore = () => node.replaceChildren(...orig.cloneNode(true).childNodes);

    let lo = 0, hi = pos.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      setHead(mid);
      if (fits()) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) { restore(); return null; }
    setHead(best);
    if (!node.textContent.trim()) { restore(); return null; }

    range.setStart(pos[best].node, pos[best].offset);
    range.setEnd(orig, orig.childNodes.length);
    const tail = node.cloneNode(false);
    tail.append(range.cloneContents());
    trimStartNode(tail);
    if (!tail.textContent.trim()) { restore(); return null; }

    tail.classList.add('cont');
    tail.classList.remove('dropcap');
    tail.removeAttribute('id');
    node.classList.add('split-head');
    tail.dataset.split = 'text';
    linkFrag(node, tail);
    return tail;
  }

  /* ---------- divisão de tabela (linha a linha) ---------- */
  function splitTable(tbl, fits) {
    const tb = tbl.tBodies[0];
    if (!tb) return null;
    const rows = [...tb.rows];
    if (rows.length < 2) return null;
    const moved = [];
    let i = rows.length - 1;
    for (; i >= 1; i--) { rows[i].remove(); moved.unshift(rows[i]); if (fits()) break; }
    if (i < 1) { tb.append(...moved); return null; }
    const tail = tbl.cloneNode(false);
    if (tbl.tHead) tail.append(tbl.tHead.cloneNode(true));
    const tb2 = tb.cloneNode(false);
    tb2.append(...moved);
    tail.append(tb2);
    tail.classList.add('cont');
    tail.removeAttribute('id');
    tail.dataset.split = 'table';
    linkFrag(tbl, tail);
    return tail;
  }

  /* ---------- divisão de contêiner (listas, quadros, citações...) ---------- */
  function splitContainer(node, fits) {
    const kids = [...node.children];
    if (!kids.length) return null;
    const isTitle = k => k.classList.contains('box-title');
    const moved = [];
    let i = kids.length - 1;
    for (; i >= 0; i--) { kids[i].remove(); moved.unshift(kids[i]); if (fits()) break; }
    if (i < 0) { node.append(...moved); return null; }

    // tenta dividir o filho que transbordou
    const k = moved[0];
    node.append(k);
    const t = splitNode(k, fits);
    if (t) moved[0] = t; else k.remove();

    // títulos não ficam sozinhos no fim
    let last = node.lastElementChild;
    while (last && HEADING_RE.test(last.tagName) && !isTitle(last) && node.children.length > 1) {
      last.remove(); moved.unshift(last); last = node.lastElementChild;
    }
    const meaningful = [...node.children].some(c => !isTitle(c));
    if (!meaningful) {
      if (t) { mergeInto(k, t); moved.shift(); }
      node.append(...moved);
      return null;
    }

    const tail = node.cloneNode(false);
    tail.removeAttribute('id');
    tail.classList.add('cont');
    tail.classList.remove('dropcap');
    if (node.tagName === 'OL') {
      const start = parseInt(node.getAttribute('start') || '1', 10);
      tail.setAttribute('start', start + node.children.length - (t ? 1 : 0));
    }
    tail.append(...moved);
    tail.dataset.split = 'box';
    node.classList.add('split-head');
    linkFrag(node, tail);
    return tail;
  }

  function splitNode(node, fits) {
    if (node.matches('.nosplit, figure, img, hr, pre, h1, h2, h3, h4, h5, h6, .abilities, section, .x-pagebreak, .x-colbreak')) return null;
    const tag = node.tagName;
    if (tag === 'P' || tag === 'DD' || tag === 'DT' ||
      (tag === 'LI' && !node.querySelector('ul, ol, p, div, table, figure'))) return splitText(node, fits);
    if (tag === 'TABLE') return splitTable(node, fits);
    if (tag === 'LI') return null;
    if (['UL', 'OL', 'DIV', 'BLOCKQUOTE', 'NAV', 'DL'].includes(tag)) return splitContainer(node, fits);
    return null;
  }

  /* ---------- reunião de fragmentos (para rebalancear colunas) ---------- */
  function mergeInto(a, b) {
    if (b.dataset.split === 'text') a.append(' ', ...b.childNodes);
    else if (b.dataset.split === 'table') a.tBodies[0].append(...[...b.tBodies[0].rows]);
    else { a.append(...b.childNodes); mergeChildren(a); }
    a.classList.remove('split-head');
  }
  function mergeChildren(parent) {
    let ch = parent.firstElementChild;
    while (ch) {
      const nx = ch.nextElementSibling;
      if (nx && ch.dataset.frag && nx.dataset.frag === ch.dataset.frag) { mergeInto(ch, nx); nx.remove(); continue; }
      ch = nx;
    }
  }

  /* ---------- sumário ---------- */
  function buildTocs(blocks) {
    const navs = blocks.filter(b => b.matches('nav.toc'));
    if (!navs.length) return;
    const heads = [];
    const visit = b => {
      if (b.matches('h1[id], h2[id], h3[id], h4[id]') && !b.classList.contains('no-toc')) heads.push(b);
      else if (b.classList.contains('wide-wrap')) [...b.children].forEach(visit);
    };
    blocks.forEach(visit);
    for (const nav of navs) {
      const depth = parseInt(nav.dataset.depth || '2', 10);
      const ul = el('ul', 'toc-list');
      for (const h of heads) {
        const lvl = parseInt(h.tagName[1], 10);
        if (lvl > depth) continue;
        const li = el('li', 'toc-l' + lvl);
        const a = el('a');
        a.href = '#' + h.id;
        const t = el('span', 'toc-t');
        if (lvl === 1 && h.querySelector('.ch-label')) {
          t.innerHTML = `<span class="toc-label">${h.querySelector('.ch-label').innerHTML}</span> ${h.querySelector('.ch-title').innerHTML}`;
        } else t.textContent = h.dataset.title || h.textContent;
        a.append(t, el('span', 'toc-dots'));
        const n = el('span', 'toc-n'); n.textContent = '00';
        a.append(n);
        li.append(a);
        ul.append(li);
      }
      const title = el('h2', 'toc-heading box-title');
      title.textContent = nav.dataset.title || 'Sumário';
      nav.replaceChildren(title, ul);
    }
  }

  /* =====================================================================
     paginate(blocks, stage, opts) → número de páginas
     ===================================================================== */
  function paginate(blocks, stage, opts) {
    opts = opts || {};
    stage.replaceChildren();
    buildTocs(blocks);

    const pages = [];
    const queue = blocks.slice();
    const pendingPins = [];
    const deferred = [];          // figuras adiadas para o topo da próxima coluna
    let page = null, body = null, cols = null, col = null, colIdx = 0, sealed = false;
    let chapter = '';

    function newPage(kind) {
      page = el('div', 'page');
      if (kind) page.classList.add(kind);
      const inner = el('div', 'page-inner');
      body = el('div', 'page-body');
      inner.append(body);
      const footer = el('div', 'page-footer');
      footer.innerHTML = '<span class="running"></span><span class="pnum"><span class="pnum-n"></span></span>';
      page.append(el('div', 'page-deco'), inner, footer);
      stage.append(page);
      pages.push(page);
      page._chapter = chapter;
      cols = null; col = null; sealed = false;
    }
    const ensurePage = () => { if (!page || sealed) newPage(); };
    const colsEmpty = cs => [...cs.children].every(c => !c.children.length);
    const pageEmpty = () => !page || [...body.children].every(c => c.classList.contains('cols') && colsEmpty(c));

    function usedHeight() {
      const last = body.lastElementChild;
      if (!last) return 0;
      return bottomOf(last) + (parseFloat(getComputedStyle(last).marginBottom) || 0);
    }

    function openCols() {
      ensurePage();
      let h = body.clientHeight - usedHeight();
      if (h < MIN_COLS) { newPage(); h = body.clientHeight; }
      cols = el('div', 'cols');
      cols.style.height = h + 'px';
      cols.append(el('div', 'col'), el('div', 'col'));
      body.append(cols);
      colIdx = 0; col = cols.children[0];
      placePending();
    }

    function nextColumn() {
      if (!cols) { openCols(); return; }
      if (colIdx === 0) { colIdx = 1; col = cols.children[1]; placePending(); }
      else { newPage(); openCols(); }
    }

    const isFullHeight = () => cols && Math.abs(parseFloat(cols.style.height) - body.clientHeight) < 2;

    function finishColumn() {
      // não deixa título órfão no pé da coluna
      const fk = flowKids(col);
      let last = fk[fk.length - 1];
      while (last && fk.length > 1 && HEADING_RE.test(last.tagName)) {
        last.remove(); queue.unshift(last); fk.pop(); last = fk[fk.length - 1];
      }
      nextColumn();
    }

    /* quadros/figuras "no rodapé da coluna" */
    function tryPin(b, c) {
      const prev = c._limit;
      const lim = colLimit(c);
      b.style.bottom = (c.clientHeight - lim) + 'px';
      c.append(b);
      c._limit = lim - b.offsetHeight - 12;
      if (c._limit > 40 && colFits(c)) return true;
      b.remove(); b.style.bottom = ''; c._limit = prev;
      return false;
    }
    function placePending() {
      while (pendingPins.length) {
        const b = pendingPins.shift();
        if (!tryPin(b, col)) { b.classList.remove('pin-bottom'); queue.unshift(b); break; }
      }
      while (deferred.length) {
        const f = deferred[0];
        col.append(f);
        if (colFits(col)) { deferred.shift(); continue; }
        f.remove();
        if (!flowKids(col).length) { deferred.shift(); queue.unshift(f); }
        break;
      }
    }

    /* fecha a área de colunas antes de um bloco largo, equilibrando as duas colunas */
    function closeCols() {
      if (!cols) return;
      if (colsEmpty(cols)) cols.remove(); else balance(cols);
      cols = null; col = null;
    }

    function balance(cs) {
      if (cs.querySelector('.pin-bottom')) return;
      const [c1, c2] = cs.children;
      const backup1 = [...c1.children].map(n => n.cloneNode(true));
      const backup2 = [...c2.children].map(n => n.cloneNode(true));
      const full = parseFloat(cs.style.height);
      const holder = el('div');
      holder.append(...c1.children, ...c2.children);
      mergeChildren(holder);
      const items = [...holder.children];

      const layout = h => {
        cs.style.height = h + 'px';
        c1.replaceChildren(); c2.replaceChildren();
        c1._limit = null; c2._limit = null;
        const q = items.map(n => n.cloneNode(true));
        let c = c1;
        while (q.length) {
          const n = q.shift();
          c.append(n);
          if (colFits(c)) continue;
          const t = splitNode(n, () => colFits(c));
          if (t) q.unshift(t);
          else { n.remove(); if (!flowKids(c).length) return false; q.unshift(n); }
          if (c === c2) return false;
          let last = c1.lastElementChild;
          while (last && HEADING_RE.test(last.tagName) && c1.children.length > 1) { last.remove(); q.unshift(last); last = c1.lastElementChild; }
          c = c2;
        }
        return true;
      };

      if (!layout(full)) {
        cs.style.height = full + 'px';
        c1.replaceChildren(...backup1); c2.replaceChildren(...backup2);
        return;
      }
      let lo = 0, hi = full;
      while (hi - lo > 3) {
        const mid = (lo + hi) / 2;
        if (layout(mid)) hi = mid; else lo = mid;
      }
      layout(hi);
      let used = 0;
      for (const c of [c1, c2]) for (const k of c.children) used = Math.max(used, bottomOf(k));
      cs.style.height = Math.ceil(used + 1) + 'px';
    }

    function wideFits(b) { return bottomOf(b) <= body.clientHeight + 0.5; }

    function placeWide(b) {
      ensurePage();
      const isChapter = b.matches('h1.chapter');
      if (isChapter && deferred.length) { queue.unshift(b); nextColumn(); return; }  // figuras pendentes ficam no capítulo certo
      if (isChapter && !b.classList.contains('no-break') && !pageEmpty()) newPage();
      closeCols();
      if (isChapter) { chapter = b.dataset.running || ''; page._chapter = chapter; }
      body.append(b);
      if (wideFits(b)) return;
      if (body.children.length > 1) {
        b.remove();
        newPage();
        body.append(b);
        if (wideFits(b)) return;
      }
      const tail = splitNode(b, () => wideFits(b));
      if (tail) { queue.unshift(tail); return; }
      b.classList.add('overflowing');
    }

    function placeFlow(b) {
      if (!cols) openCols();
      if (isPin(b)) { if (!tryPin(b, col)) pendingPins.push(b); return; }
      col.append(b);
      if (colFits(col)) return;

      const tail = splitNode(b, () => colFits(col));
      if (tail) { queue.unshift(tail); finishColumn(); return; }

      b.remove();
      // figura que não cabe: vai para o topo da próxima coluna e o texto continua enchendo esta
      if (b.tagName === 'FIGURE' && flowKids(col).length && queue.length && !deferred.length) {
        deferred.push(b);
        return;
      }
      if (!flowKids(col).length) {
        if (isFullHeight()) {          // não cabe nem numa coluna vazia: força
          col.append(b); b.classList.add('overflowing'); finishColumn(); return;
        }
        queue.unshift(b); newPage(); return;
      }
      queue.unshift(b);
      finishColumn();
    }

    /* ---------- laço principal ---------- */
    let guard = 0;
    while (queue.length || pendingPins.length || deferred.length) {
      if (++guard > 50000) { console.warn('Paginador: limite de iterações'); break; }
      if (!queue.length) { nextColumn(); continue; }
      const b = queue.shift();
      const cl = b.classList;

      if (cl.contains('x-pagebreak')) {
        if (page && !sealed && !pageEmpty()) newPage();
        continue;
      }
      if (cl.contains('x-colbreak')) {
        ensurePage();
        if (!cols) openCols();
        nextColumn();
        continue;
      }
      if (cl.contains('cover') || cl.contains('art-page') || cl.contains('solo-page')) {
        const kind = cl.contains('cover') ? 'page-cover' : cl.contains('art-page') ? 'page-art' : 'page-solo';
        if (page && !sealed && pageEmpty()) { body.replaceChildren(); cols = null; col = null; page.classList.add(kind); }
        else newPage(kind);
        if (kind === 'page-solo') body.append(b);
        else page.insertBefore(b, page.querySelector('.page-inner'));
        sealed = true;
        continue;
      }
      if (cl.contains('wide')) { placeWide(b); continue; }
      placeFlow(b);
    }

    // remove página final vazia
    if (pages.length > 1) {
      const last = pages[pages.length - 1];
      if (!last.matches('.page-cover, .page-art, .page-solo') &&
        [...last.querySelector('.page-body').children].every(c => c.classList.contains('cols') && colsEmpty(c))) {
        last.remove(); pages.pop();
      }
    }
    if (!pages.length) newPage();

    // números de página e rodapé corrido
    pages.forEach((p, i) => {
      const n = i + 1;
      p.dataset.num = n;
      p.classList.add(n % 2 ? 'odd' : 'even');
      p.querySelector('.pnum-n').textContent = n;
      const run = p.querySelector('.running');
      const txt = (n % 2 === 0 && opts.bookTitle) ? opts.bookTitle : (p._chapter || opts.bookTitle || '');
      run.textContent = txt;
      if (!txt) run.classList.add('empty');
    });

    // preenche números do sumário
    stage.querySelectorAll('nav.toc a[href^="#"]').forEach(a => {
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const h = stage.querySelector('[id="' + CSS.escape(id) + '"]');
      const p = h && h.closest('.page');
      const n = a.querySelector('.toc-n');
      if (n) n.textContent = p ? p.dataset.num : '?';
    });

    return pages.length;
  }

  global.Paginator = { paginate };
})(window);
