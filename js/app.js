/* =====================================================================
   Forja de Tomos — Aplicação
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const STORE_KEY = 'forjaDeTomos.state.v1';

  /* ---------- temas ---------- */
  const THEMES = [
    {
      id: 'classico', name: 'Tomo Clássico',
      desc: 'Pergaminho, tinta vermelha e versaletes — o visual tradicional dos manuais de RPG.',
      fonts: ['700 20px "Cormorant SC"', '600 20px "Cormorant SC"', '400 16px "Crimson Pro"', 'italic 400 16px "Crimson Pro"', '700 16px "Crimson Pro"',
        '400 16px "Alegreya Sans"', 'italic 400 16px "Alegreya Sans"', '700 16px "Alegreya Sans"', '700 16px "Alegreya Sans SC"', '700 40px "Cinzel Decorative"']
    },
    {
      id: 'sombrio', name: 'Grimório Sombrio',
      desc: 'Página negra, letras góticas e brilho arcano violeta. Para horror e necromancia.',
      fonts: ['400 20px "Grenze Gotisch"', '700 20px "Grenze Gotisch"', '300 16px "Spectral"', 'italic 300 16px "Spectral"', '600 16px "Spectral"',
        '400 16px "Spectral SC"', '600 16px "Spectral SC"', '700 40px "UnifrakturCook"']
    },
    {
      id: 'elfico', name: 'Crônica Élfica',
      desc: 'Marfim, esmeralda e ouro, vinhas nos cantos e tipografia caligráfica elegante.',
      fonts: ['600 20px "Cormorant Unicase"', '500 20px "Cormorant Unicase"', 'italic 600 20px "Cormorant Garamond"', '600 16px "Cormorant Garamond"',
        '400 16px "EB Garamond"', 'italic 400 16px "EB Garamond"', '600 16px "EB Garamond"']
    },
    {
      id: 'anao', name: 'Forja Anã',
      desc: 'Manual de ofício: papel cor de pedra, tinta preta e cobre, títulos em serifa grossa e réguas tipográficas.',
      fonts: ['700 20px "Zilla Slab"', '600 16px "Zilla Slab"', '400 16px "Vollkorn"', 'italic 400 16px "Vollkorn"', '700 16px "Vollkorn"']
    },
    {
      id: 'explorador', name: 'Diário do Explorador',
      desc: 'Papel envelhecido, manchas de café, notas manuscritas e mapas de tesouro.',
      fonts: ['400 20px "IM Fell English SC"', '400 16px "IM Fell English"', 'italic 400 16px "IM Fell English"', '400 16px "Caveat"', '700 16px "Caveat"']
    },
    {
      id: 'ki', name: 'Aura de Ki',
      desc: 'Livro de regras moderno: serifa de leitura, títulos condensados e tabelas leves, com laranja e azul como acento.',
      fonts: ['800 20px "Barlow Condensed"', '700 20px "Barlow Condensed"', '600 16px "Barlow Condensed"',
        '400 16px "Barlow Semi Condensed"', '700 16px "Barlow Semi Condensed"', 'italic 400 16px "Barlow Semi Condensed"',
        '400 16px "Source Serif 4"', 'italic 400 16px "Source Serif 4"', '700 16px "Source Serif 4"']
    }
  ];

  /* ---------- estado ---------- */
  const DEFAULTS = { title: 'O Tomo das Terras Partidas', theme: 'classico', size: 'letter', zoom: 0.75, spread: false, edWidth: 42, text: null };
  function loadState() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { s = {}; }
    const st = Object.assign({}, DEFAULTS, s);
    if (typeof st.text !== 'string') st.text = window.SAMPLE_BOOK || '';
    if (!THEMES.some(t => t.id === st.theme)) st.theme = 'classico';
    return st;
  }
  const state = loadState();
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); $('#stSave').textContent = 'Salvo no navegador'; }
      catch (e) { $('#stSave').textContent = '⚠ Não foi possível salvar (armazenamento cheio?)'; }
    }, 400);
  }

  /* ---------- elementos ---------- */
  const ed = $('#editor');
  const pagesEl = $('#pages');
  const stage = $('#stage');
  const pane = $('#previewPane');

  /* ---------- renderização ---------- */
  const resolve = src => {
    if (/^img:/i.test(src)) return ImageStore.url(src.slice(4)) || ('data:image/svg+xml,' + encodeURIComponent(MISSING_SVG));
    return src;
  };
  const MISSING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#ddd"/><text x="200" y="125" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#777">Imagem não encontrada na biblioteca</text></svg>`;

  function bookClasses(target) {
    const cls = ['book-pages', 'theme-' + state.theme, 'size-' + state.size];
    if (target === stage) cls.push('stage');
    if (target === pagesEl && state.spread) cls.push('spread');
    target.className = cls.join(' ');
  }

  /* Detecta imagens "recortadas" (PNG/SVG com fundo transparente, ex.: personagens).
     Olha a borda da imagem: se boa parte for transparente, é recorte. O resultado
     fica em cache por endereço, porque a diagramação roda a cada tecla. */
  const cutoutCache = new Map();
  /* Resultado: { cutout: bool, url: endereço novo (fundo branco removido) ou null } */
  function isCutout(src) {
    if (cutoutCache.has(src)) return cutoutCache.get(src);
    const p = new Promise(resolve => {
      const done = v => resolve(v);
      const im = new Image();
      if (!/^(blob:|data:)/.test(src)) im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const scale = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
          const W = Math.max(1, Math.round(im.naturalWidth * scale)), H = Math.max(1, Math.round(im.naturalHeight * scale));
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(im, 0, 0, W, H);
          const img = g.getImageData(0, 0, W, H), d = img.data;
          // examina a borda (2px)
          let edge = 0, clear = 0, white = 0;
          const isWhite = i => d[i + 3] > 200 && d[i] > 236 && d[i + 1] > 236 && d[i + 2] > 236;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (x > 1 && y > 1 && x < W - 2 && y < H - 2) { x = W - 3; continue; }
            const i = (y * W + x) * 4; edge++;
            if (d[i + 3] < 200) clear++; else if (isWhite(i)) white++;
          }
          if (clear / edge > 0.35) return done({ cutout: true, url: null });       // já é recorte (PNG transparente)
          if (white / edge < 0.8) return done({ cutout: false, url: null });       // foto/ilustração com fundo
          // fundo branco: apaga o branco conectado às bordas (o branco "de dentro" fica)
          const N = W * H, gone = new Uint8Array(N), stack = new Int32Array(N);
          let sp = 0;
          const near = i => d[i + 3] > 0 && d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 228;
          const seed = p => { if (!gone[p] && near(p * 4)) { gone[p] = 1; stack[sp++] = p; } };
          for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
          for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
          while (sp) {
            const p = stack[--sp], x = p % W;
            if (x > 0) seed(p - 1);
            if (x < W - 1) seed(p + 1);
            if (p >= W) seed(p - W);
            if (p < N - W) seed(p + W);
          }
          for (let p = 0; p < N; p++) {
            const i = p * 4;
            if (gone[p]) { d[i + 3] = 0; continue; }
            // suaviza a borda do recorte: pixels claros vizinhos ao fundo ficam semitransparentes
            const x = p % W;
            const touches = (x > 0 && gone[p - 1]) || (x < W - 1 && gone[p + 1]) || (p >= W && gone[p - W]) || (p < N - W && gone[p + W]);
            if (touches) {
              const lum = Math.min(d[i], d[i + 1], d[i + 2]);
              if (lum > 190) d[i + 3] = Math.min(d[i + 3], Math.round((255 - lum) * 4));
            }
          }
          g.putImageData(img, 0, 0);
          c.toBlob(b => done(b ? { cutout: true, url: URL.createObjectURL(b) } : { cutout: false, url: null }), 'image/png');
        } catch (e) { done({ cutout: false, url: null }); }                     // imagem de outro site sem permissão
      };
      im.onerror = () => done({ cutout: false, url: null });
      setTimeout(() => done({ cutout: false, url: null }), 8000);
      im.src = src;
    });
    cutoutCache.set(src, p);
    return p;
  }

  function waitImages(root) {
    const imgs = $$('img', root);
    return Promise.all(imgs.map(img => {
      const loaded = img.complete ? Promise.resolve() : new Promise(r => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', r, { once: true });
        setTimeout(r, 8000);
      });
      const fig = img.closest('figure');
      if (!fig || fig.classList.contains('framed')) return loaded;
      return Promise.all([loaded, isCutout(img.src)]).then(async ([, res]) => {
        if (!res.cutout && !fig.classList.contains('cutout')) return;
        fig.classList.add('cutout');
        if (res.url) {                       // troca pela versão sem fundo branco
          img.src = res.url;
          if (!img.complete) await new Promise(r => { img.onload = img.onerror = r; });
        }
        // texto contorna a silhueta quando a imagem flutua (sem legenda, para o contorno bater)
        if ((fig.classList.contains('float-right') || fig.classList.contains('float-left')) && !fig.querySelector('figcaption')) {
          fig.style.shapeOutside = `url("${img.src}")`;
          fig.style.shapeImageThreshold = '0.25';
          fig.style.shapeMargin = '7px';
        }
      });
    })).then(() => imgs.forEach(img => { if (img.complete && !img.naturalWidth) img.classList.add('broken'); }));
  }

  const fontCache = new Set();
  function loadFonts(theme) {
    if (fontCache.has(theme.id)) return Promise.resolve();
    const all = Promise.all(theme.fonts.map(f => document.fonts.load(f).catch(() => null)));
    const timeout = new Promise(r => setTimeout(r, 4000));
    return Promise.race([all, timeout]).then(() => fontCache.add(theme.id));
  }

  let renderToken = 0, renderTimer = null, rendering = null;
  function scheduleRender(delay) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay == null ? 350 : delay);
  }

  async function render() {
    const token = ++renderToken;
    const theme = THEMES.find(t => t.id === state.theme) || THEMES[0];
    const html = BookParser.parse(ed.value, { resolve });
    const holder = document.createElement('div');
    holder.innerHTML = html;
    await Promise.all([waitImages(holder), loadFonts(theme)]);
    if (token !== renderToken) return;

    bookClasses(stage);
    const t0 = performance.now();
    const n = Paginator.paginate([...holder.children], stage, { bookTitle: state.title });
    const ms = Math.round(performance.now() - t0);
    if (token !== renderToken) return;

    const scroll = pane.scrollTop;
    bookClasses(pagesEl);
    pagesEl.style.zoom = state.zoom;
    pagesEl.replaceChildren(...stage.children);
    pane.scrollTop = scroll;

    const words = (ed.value.replace(/[#*_>|:\\=`~^-]+/g, ' ').match(/[\wÀ-ſ]+/g) || []).length;
    $('#stPages').textContent = `${n} ${n === 1 ? 'página' : 'páginas'}`;
    $('#stWords').textContent = `${words.toLocaleString('pt-BR')} palavras`;
    $('#stTime').textContent = `diagramado em ${ms} ms`;
    if (document.activeElement === ed) syncPreviewToCursor(true);
  }
  rendering = render;

  document.fonts.addEventListener('loadingdone', () => scheduleRender(150));

  /* ---------- tamanho de impressão ---------- */
  function updatePrintSize() {
    const size = state.size === 'a4' ? '210mm 297mm' : '8.5in 11in';
    $('#print-size').textContent = `@page { size: ${size}; margin: 0; }`;
  }

  /* ---------- zoom / visualização ---------- */
  function setZoom(z) {
    state.zoom = Math.max(0.25, Math.min(2, Math.round(z * 100) / 100));
    pagesEl.style.zoom = state.zoom;
    $('#zoomVal').textContent = Math.round(state.zoom * 100) + '%';
    save();
  }
  function fitZoom() {
    const page = pagesEl.querySelector('.page');
    if (!page) return;
    const w = page.offsetWidth * (state.spread ? 2 : 1) + 8;
    setZoom((pane.clientWidth - 56) / w);
  }

  /* ---------- sincronização editor ⇄ prévia ---------- */
  function lineOfIndex(idx) { return ed.value.slice(0, idx).split('\n').length - 1; }
  function indexOfLine(line) {
    const lines = ed.value.split('\n');
    let idx = 0;
    for (let i = 0; i < line && i < lines.length; i++) idx += lines[i].length + 1;
    return { start: idx, end: idx + (lines[line] || '').length };
  }

  const mirror = document.createElement('div');
  mirror.className = 'ed-mirror';
  document.body.append(mirror);
  function caretY(idx) {
    const cs = getComputedStyle(ed);
    ['fontFamily', 'fontSize', 'lineHeight', 'paddingLeft', 'paddingRight', 'paddingTop', 'letterSpacing', 'tabSize', 'whiteSpace', 'wordWrap', 'overflowWrap']
      .forEach(p => { mirror.style[p] = cs[p]; });
    mirror.style.width = ed.clientWidth + 'px';
    mirror.textContent = ed.value.slice(0, idx) + '​';
    return mirror.scrollHeight;
  }
  function scrollEditorToLine(line) {
    const r = indexOfLine(line);
    ed.focus({ preventScroll: true });
    ed.setSelectionRange(r.start, r.end);
    ed.scrollTop = Math.max(0, caretY(r.start) - ed.clientHeight / 3);
  }

  function flash(node) {
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
    setTimeout(() => node.classList.remove('flash'), 1300);
  }

  function syncPreviewToCursor(onlyIfHidden) {
    const line = lineOfIndex(ed.selectionStart);
    let best = null, bestLine = -1;
    for (const n of pagesEl.querySelectorAll('[data-line]')) {
      const l = +n.dataset.line;
      if (l <= line && l > bestLine) { best = n; bestLine = l; }
    }
    if (!best) return;
    const r = best.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    const visible = r.bottom > pr.top + 20 && r.top < pr.bottom - 20;
    if (onlyIfHidden && visible) return;
    best.scrollIntoView({ block: 'center', behavior: onlyIfHidden ? 'auto' : 'smooth' });
    if (!onlyIfHidden) flash(best);
  }

  pagesEl.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a) {
      e.preventDefault();
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const t = pagesEl.querySelector('[id="' + CSS.escape(id) + '"]');
      if (t) { t.scrollIntoView({ block: 'start', behavior: 'smooth' }); flash(t); }
      return;
    }
    const n = e.target.closest('[data-line]');
    if (n) scrollEditorToLine(+n.dataset.line);
  });

  ed.addEventListener('click', () => syncPreviewToCursor(false));
  ed.addEventListener('keyup', e => {
    if (/^(Arrow|Page|Home|End)/.test(e.key)) syncPreviewToCursor(true);
  });

  /* ---------- edição ---------- */
  function onTextChanged() {
    state.text = ed.value;
    save();
    scheduleRender();
  }
  ed.addEventListener('input', onTextChanged);

  function replaceSel(text, selStartOffset, selEndOffset) {
    const s = ed.selectionStart, e = ed.selectionEnd;
    ed.focus();
    ed.setRangeText(text, s, e, 'end');
    if (selStartOffset != null) ed.setSelectionRange(s + selStartOffset, s + (selEndOffset != null ? selEndOffset : text.length));
    onTextChanged();
  }

  function wrap(before, after, placeholder) {
    const s = ed.selectionStart, e = ed.selectionEnd;
    const sel = ed.value.slice(s, e) || placeholder;
    replaceSel(before + sel + after, before.length, before.length + sel.length);
  }

  /* insere um bloco em linhas próprias, com linha em branco antes e depois */
  function insertBlock(text, selectFrom, selectTo) {
    const v = ed.value;
    let s = ed.selectionStart, e = ed.selectionEnd;
    // vai para o fim da linha atual se o cursor estiver no meio de uma linha
    if (s === e) { const nl = v.indexOf('\n', s); s = e = (nl === -1 ? v.length : nl); }
    const before = v.slice(0, s), after = v.slice(e);
    let pre = '', post = '';
    if (before.length && !before.endsWith('\n\n')) pre = before.endsWith('\n') ? '\n' : '\n\n';
    if (!after.startsWith('\n\n')) post = after.startsWith('\n') ? '\n' : '\n\n';
    ed.focus();
    ed.setRangeText(pre + text + post, s, e, 'end');
    const base = s + pre.length;
    if (selectFrom != null) {
      const i = text.indexOf(selectFrom);
      if (i >= 0) ed.setSelectionRange(base + i, base + i + (selectTo || selectFrom).length);
    } else ed.setSelectionRange(base + text.length, base + text.length);
    onTextChanged();
    const st = ed.selectionStart;
    ed.scrollTop = Math.max(0, caretY(st) - ed.clientHeight / 3);
  }

  function prefixLines(prefix, numbered) {
    const v = ed.value;
    let s = v.lastIndexOf('\n', ed.selectionStart - 1) + 1;
    let e = ed.selectionEnd;
    const nl = v.indexOf('\n', e); e = nl === -1 ? v.length : nl;
    const lines = v.slice(s, e).split('\n');
    const out = lines.map((l, i) => {
      const clean = l.replace(/^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, '');
      return (numbered ? (i + 1) + '. ' : prefix) + clean;
    }).join('\n');
    ed.focus();
    ed.setRangeText(out, s, e, 'select');
    onTextChanged();
  }

  const SNIPPETS = {
    h1: ['# Capítulo 1: Título do Capítulo', 'Título do Capítulo'],
    table: ['##### Tabela: Título da Tabela\n| d6 | Resultado |\n|:--:|:----------|\n| 1 | Primeiro resultado |\n| 2 | Segundo resultado |\n| 3 | Terceiro resultado |', 'Título da Tabela'],
    nota: [':::nota Título da Nota\nTexto da nota. Use para regras, dicas e observações.\n:::', 'Título da Nota'],
    quadro: [':::quadro Título do Quadro\nUm quadro lateral com informações extras, histórias ou variantes de regras.\n:::', 'Título do Quadro'],
    quadroBaixo: [':::quadro{baixo} Título do Quadro\nEste quadro fica preso ao pé da coluna, e o texto continua por cima dele.\n:::', 'Título do Quadro'],
    leitura: [':::leitura\nTexto para ler em voz alta aos jogadores, descrevendo a cena diante deles.\n:::', 'Texto para ler em voz alta aos jogadores, descrevendo a cena diante deles.'],
    destaque: [':::destaque Atenção\n**Regra importante.** Escreva aqui algo que os jogadores não podem esquecer.\n:::', 'Atenção'],
    criatura: [':::criatura Nome da Criatura\n*Monstruosidade Média, Neutro*\n\n---\n\n**Classe de Armadura** 14 (armadura natural)  \n**Pontos de Vida** 52 (8d8 + 16)  \n**Deslocamento** 9 m\n\n---\n\n@atributos 16 12 14 6 10 8\n\n---\n\n**Sentidos** Visão no Escuro 18 m, Percepção passiva 10  \n**Idiomas** —  \n**Nível de Desafio** 2 (450 XP)\n\n#### Ações\n\n***Mordida.*** *Ataque Corpo a Corpo:* +5 para atingir, alcance 1,5 m, um alvo. *Acerto:* 10 (2d6 + 3) de dano perfurante.\n:::', 'Nome da Criatura'],
    magia: [':::magia Nome da Magia\n*Evocação de 1º círculo*\n\n**Tempo de Conjuração:** 1 ação  \n**Alcance:** 18 metros  \n**Componentes:** V, S  \n**Duração:** Instantânea\n\nDescrição do efeito da magia.\n:::', 'Nome da Magia'],
    item: [':::item Nome do Item\n*Item maravilhoso, raro (requer sintonização)*\n\nDescrição do item mágico e de seus poderes.\n:::', 'Nome do Item'],
    citacao: ['> Uma frase marcante dita por alguém importante do seu mundo.\n> — Nome do Personagem', 'Uma frase marcante dita por alguém importante do seu mundo.'],
    hr: ['---'],
    colbreak: ['\\coluna'],
    pagebreak: ['\\pagina'],
    toc: ['\\sumario'],
    cover: [':::capa\n![](assets/capa.svg)\n# Título do Livro\n## Subtítulo do livro\nNome do Autor\n:::', 'Título do Livro'],
    solo: [':::pagina\n## Créditos\n**Autor:** Seu nome  \n**Arte:** Nome do artista\n:::', 'Seu nome'],
    abilities: ['@atributos 10 10 10 10 10 10']
  };

  function act(a) {
    switch (a) {
      case 'h2': return prefixLines('## ');
      case 'h3': return prefixLines('### ');
      case 'h4': return prefixLines('#### ');
      case 'bold': return wrap('**', '**', 'negrito');
      case 'italic': return wrap('*', '*', 'itálico');
      case 'mark': return wrap('==', '==', 'destaque');
      case 'sc': return wrap('^^', '^^', 'Versalete');
      case 'ul': return prefixLines('- ');
      case 'ol': return prefixLines('', true);
      case 'link': return wrap('[', '](https://)', 'texto do link');
      case 'image': return openImageDialog('url');
      default: {
        const sn = SNIPPETS[a];
        if (sn) insertBlock(sn[0], sn[1]);
      }
    }
  }

  $('#toolbar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) act(b.dataset.act);
  });

  ed.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); act('bold'); }
      else if (k === 'i') { e.preventDefault(); act('italic'); }
      else if (k === 'e') { e.preventDefault(); act('mark'); }
      else if (k === 'enter') { e.preventDefault(); insertBlock('\\pagina'); }
      else if (k === 's') { e.preventDefault(); save(); exportProject(); }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      replaceSel('  ');
    }
  });

  /* ---------- imagens: colar e arrastar no editor ---------- */
  const IMG_URL_RE = /^(https?:\/\/\S+?\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?\S*)?|https?:\/\/\S*(googleusercontent|imgur|wikimedia|discordapp|pinimg|artstation)\S*|data:image\/[a-z+]+;base64,\S+)$/i;

  function imageMarkdown(src, caption, attrs) {
    return `![${caption || ''}](${src})${attrs ? '{' + attrs + '}' : ''}`;
  }

  async function addFilesAsImages(files) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return false;
    const snippets = [];
    for (const f of imgs) {
      const id = await ImageStore.add(f, f.name);
      snippets.push(imageMarkdown('img:' + id, ''));
    }
    insertBlock(snippets.join('\n\n'));
    toast(imgs.length > 1 ? `${imgs.length} imagens adicionadas à biblioteca` : 'Imagem adicionada à biblioteca');
    return true;
  }

  ed.addEventListener('paste', async e => {
    const cd = e.clipboardData;
    if (!cd) return;
    if (cd.files && cd.files.length && [...cd.files].some(f => f.type.startsWith('image/'))) {
      e.preventDefault();
      await addFilesAsImages(cd.files);
      return;
    }
    const txt = (cd.getData('text/plain') || '').trim();
    const prevChar = ed.value.slice(Math.max(0, ed.selectionStart - 2), ed.selectionStart);
    if (IMG_URL_RE.test(txt) && !/\]\($|\($/.test(prevChar) && !/\(\s*$/.test(prevChar)) {
      e.preventDefault();
      insertBlock(imageMarkdown(txt, ''));
      toast('Link de imagem convertido em imagem ✓');
    }
  });

  ed.addEventListener('dragover', e => { e.preventDefault(); ed.classList.add('drop-hover'); });
  ed.addEventListener('dragleave', () => ed.classList.remove('drop-hover'));
  ed.addEventListener('drop', async e => {
    ed.classList.remove('drop-hover');
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length) { e.preventDefault(); await addFilesAsImages(dt.files); return; }
    const html = dt.getData('text/html');
    const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
    const uri = (m && m[1]) || dt.getData('text/uri-list');
    if (uri && /^(https?:|data:image)/.test(uri)) {
      e.preventDefault();
      insertBlock(imageMarkdown(uri.trim(), ''));
      toast('Imagem inserida pelo link ✓');
    }
  });

  /* ---------- diálogo de imagem ---------- */
  const dlg = $('#imgDialog');
  let imgSrc = '';
  let imgPos = 'coluna';

  function setImgSrc(src) {
    imgSrc = src || '';
    const prev = $('#imgPreview');
    const msg = $('#imgPrevMsg');
    if (!imgSrc) { prev.removeAttribute('src'); prev.hidden = true; msg.hidden = false; msg.textContent = 'Pré-visualização'; return; }
    prev.hidden = false; msg.hidden = true;
    prev.onerror = () => { prev.hidden = true; msg.hidden = false; msg.textContent = 'Não foi possível carregar essa imagem. Confira o link.'; };
    prev.src = resolve(imgSrc);
  }

  function showTab(name) {
    $$('#imgDialog .tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('#imgDialog .tab').forEach(t => { t.hidden = t.dataset.tab !== name; });
    if (name === 'lib') renderLibrary();
    if (name === 'url') setTimeout(() => $('#imgUrl').focus(), 30);
  }

  function renderLibrary() {
    const grid = $('#libGrid');
    const list = ImageStore.list();
    grid.replaceChildren();
    if (!list.length) {
      grid.innerHTML = '<p class="hint">Sua biblioteca está vazia. Envie imagens pela aba “Do computador”, ou cole/arraste imagens direto no editor.</p>';
      return;
    }
    for (const it of list) {
      const card = document.createElement('div');
      card.className = 'lib-item' + (imgSrc === 'img:' + it.id ? ' selected' : '');
      card.innerHTML = `<img alt=""><span></span><button type="button" class="lib-del" title="Apagar da biblioteca">✕</button>`;
      card.querySelector('img').src = ImageStore.url(it.id);
      card.querySelector('span').textContent = it.name;
      card.addEventListener('click', ev => {
        if (ev.target.closest('.lib-del')) return;
        setImgSrc('img:' + it.id);
        $$('.lib-item', grid).forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      card.querySelector('.lib-del').addEventListener('click', async () => {
        if (!confirm(`Apagar “${it.name}” da biblioteca? Ela deixará de aparecer onde estiver sendo usada.`)) return;
        await ImageStore.remove(it.id);
        if (imgSrc === 'img:' + it.id) setImgSrc('');
        renderLibrary();
        scheduleRender(50);
      });
      grid.append(card);
    }
  }

  let savedSel = [0, 0];
  function openImageDialog(tab) {
    savedSel = [ed.selectionStart, ed.selectionEnd];
    setImgSrc('');
    $('#imgUrl').value = '';
    $('#imgCaption').value = '';
    $('#imgNoBorder').checked = false;
    setPos('coluna');
    showTab(tab || 'url');
    dlg.showModal();
  }

  function setPos(p) {
    imgPos = p;
    $$('#posGrid button').forEach(b => b.classList.toggle('active', b.dataset.pos === p));
    const def = (p === 'direita' || p === 'esquerda') ? 45 : 100;
    $('#imgWidth').value = def;
    $('#imgWidthVal').textContent = def + '%';
    $('#widthRow').hidden = (p === 'pagina');
  }

  $('#posGrid').addEventListener('click', e => { const b = e.target.closest('[data-pos]'); if (b) setPos(b.dataset.pos); });
  $('#imgWidth').addEventListener('input', e => { $('#imgWidthVal').textContent = e.target.value + '%'; });
  $$('#imgDialog .tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#imgUrl').addEventListener('input', e => setImgSrc(e.target.value.trim()));

  const dz = $('#dropzone');
  $('#imgFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const id = await ImageStore.add(f, f.name);
    setImgSrc('img:' + id);
    if (!$('#imgCaption').value) $('#imgCaption').value = '';
    toast('Imagem salva na biblioteca ✓');
    e.target.value = '';
  });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('hover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('hover'));
  dz.addEventListener('drop', async e => {
    e.preventDefault(); dz.classList.remove('hover');
    const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'));
    if (f) { const id = await ImageStore.add(f, f.name); setImgSrc('img:' + id); toast('Imagem salva na biblioteca ✓'); return; }
    const html = e.dataTransfer.getData('text/html');
    const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
    const uri = (m && m[1]) || e.dataTransfer.getData('text/uri-list');
    if (uri) { $('#imgUrl').value = uri.trim(); setImgSrc(uri.trim()); showTab('url'); }
  });

  $('#imgInsert').addEventListener('click', e => {
    e.preventDefault();
    if (!imgSrc) { toast('Escolha uma imagem primeiro (link, arquivo ou biblioteca).'); return; }
    const attrs = [];
    if (imgPos !== 'coluna') attrs.push(imgPos);
    const w = +$('#imgWidth').value;
    const def = (imgPos === 'direita' || imgPos === 'esquerda') ? 45 : 100;
    if (imgPos !== 'pagina' && w !== def) attrs.push('largura=' + w + '%');
    if ($('#imgNoBorder').checked) attrs.push('sem-borda');
    dlg.close();
    ed.focus({ preventScroll: true });
    ed.setSelectionRange(savedSel[0], savedSel[1]);
    insertBlock(imageMarkdown(imgSrc, $('#imgCaption').value.trim(), attrs.join(' ')));
  });
  $('#imgCancel').addEventListener('click', e => { e.preventDefault(); dlg.close(); });

  /* ---------- painel de temas ---------- */
  const MINI = `<div class="page odd"><div class="page-deco"></div><div class="page-inner"><div class="page-body">
    <h1 class="chapter"><span class="ch-label">Capítulo 1</span><span class="ch-title">O Despertar</span><span class="ch-orn"></span></h1>
    <div class="cols" style="height:auto"><div class="col">
      <p class="dropcap">Era uma vez um reino partido em sete pedaços, cada um governado por um rei que jurava ser o verdadeiro herdeiro da coroa antiga.</p>
      <h3>Regras da Estrada</h3><p>Viajantes prudentes andam em grupo e nunca acendem fogueiras perto das ruínas.</p>
    </div><div class="col">
      <div class="box nota"><h4 class="box-title">Dica do Mestre</h4><p>Mostre o mapa aos jogadores somente depois da primeira sessão.</p></div>
      <table><thead><tr><th>d6</th><th>Evento</th></tr></thead><tbody><tr><td>1</td><td>Emboscada</td></tr><tr><td>2</td><td>Mercador</td></tr><tr><td>3</td><td>Tempestade</td></tr></tbody></table>
    </div></div></div></div>
    <div class="page-footer"><span class="running">Capítulo 1 | O Despertar</span><span class="pnum"><span class="pnum-n">7</span></span></div></div>`;

  function buildThemePanel() {
    const grid = $('#themeGrid');
    grid.replaceChildren();
    for (const t of THEMES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card' + (t.id === state.theme ? ' active' : '');
      card.innerHTML = `<div class="mini-wrap"><div class="book-pages mini theme-${t.id} size-letter">${MINI}</div></div>
        <div class="theme-info"><b></b><small></small></div>`;
      card.querySelector('b').textContent = t.name;
      card.querySelector('small').textContent = t.desc;
      card.addEventListener('click', () => { setTheme(t.id); closeThemePanel(); });
      grid.append(card);
      loadFonts(t);
    }
  }
  function setTheme(id) {
    state.theme = id;
    const t = THEMES.find(x => x.id === id);
    $('#themeName').textContent = t ? t.name : id;
    $$('.theme-card').forEach((c, i) => c.classList.toggle('active', THEMES[i].id === id));
    save();
    render();
  }
  const themePanel = $('#themePanel');
  function closeThemePanel() { themePanel.hidden = true; }
  $('#themeBtn').addEventListener('click', e => {
    e.stopPropagation();
    themePanel.hidden = !themePanel.hidden;
    if (!themePanel.hidden && !$('#themeGrid').children.length) buildThemePanel();
  });
  document.addEventListener('click', e => {
    if (!themePanel.hidden && !e.target.closest('#themePanel') && !e.target.closest('#themeBtn')) closeThemePanel();
    if (!e.target.closest('.menu')) $$('.menu.open').forEach(m => m.classList.remove('open'));
  });

  /* ---------- barra superior ---------- */
  $('#bookTitle').value = state.title;
  $('#bookTitle').addEventListener('input', e => { state.title = e.target.value; save(); scheduleRender(400); });
  $('#pageSize').value = state.size;
  $('#pageSize').addEventListener('change', e => { state.size = e.target.value; updatePrintSize(); save(); render(); });
  $('#zoomIn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  $('#zoomOut').addEventListener('click', () => setZoom(state.zoom - 0.1));
  $('#zoomFit').addEventListener('click', fitZoom);
  $('#spreadBtn').addEventListener('click', () => {
    state.spread = !state.spread;
    $('#spreadBtn').classList.toggle('active', state.spread);
    bookClasses(pagesEl); save();
  });
  $('#imagesBtn').addEventListener('click', () => openImageDialog(ImageStore.list().length ? 'lib' : 'file'));
  $('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal());
  $('#helpClose').addEventListener('click', () => $('#helpDialog').close());

  $$('.menu > button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const m = b.parentElement;
    const was = m.classList.contains('open');
    $$('.menu.open').forEach(x => x.classList.remove('open'));
    if (!was) m.classList.add('open');
  }));

  $('#printBtn').addEventListener('click', async () => {
    toast('Abrindo impressão… escolha “Salvar como PDF” como destino.');
    await render();
    setTimeout(() => window.print(), 300);
  });

  /* ---------- arquivo ---------- */
  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const fileBase = () => (state.title || 'livro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'livro';

  async function exportProject() {
    const used = new Set((ed.value.match(/img:([a-z0-9]+)/gi) || []).map(s => s.slice(4)));
    const images = await ImageStore.exportAll(used);
    const data = { app: 'forja-de-tomos', version: 1, title: state.title, theme: state.theme, size: state.size, text: ed.value, images };
    download(fileBase() + '.tomo.json', JSON.stringify(data), 'application/json');
    toast('Projeto salvo (texto + imagens + tema).');
  }

  $('#fileMenu').addEventListener('click', async e => {
    const b = e.target.closest('[data-file]');
    if (!b) return;
    $$('.menu.open').forEach(x => x.classList.remove('open'));
    const a = b.dataset.file;
    if (a === 'new') {
      if (!confirm('Começar um livro em branco? O texto atual será substituído (exporte antes se quiser guardá-lo).')) return;
      ed.value = ':::capa\n# Título do Livro\n## Subtítulo\nAutor\n:::\n\n\\sumario\n\n\\pagina\n\n# Capítulo 1: Começo\n\nEscreva aqui...\n';
      state.title = 'Meu Livro'; $('#bookTitle').value = state.title;
      onTextChanged();
    } else if (a === 'sample') {
      if (!confirm('Carregar o livro de exemplo? O texto atual será substituído.')) return;
      ed.value = window.SAMPLE_BOOK; state.title = DEFAULTS.title; $('#bookTitle').value = state.title;
      onTextChanged();
    } else if (a === 'sampleKi') {
      if (!confirm('Carregar o exemplo de artes marciais? O texto atual será substituído.')) return;
      ed.value = window.SAMPLE_KI; state.title = 'Saga do Torneio Celestial'; $('#bookTitle').value = state.title;
      setTheme('ki');
      onTextChanged();
    } else if (a === 'import') {
      $('#importFile').click();
    } else if (a === 'md') {
      download(fileBase() + '.md', ed.value, 'text/markdown;charset=utf-8');
    } else if (a === 'json') {
      exportProject();
    } else if (a === 'html') {
      exportHtml();
    }
  });

  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const txt = await f.text();
    e.target.value = '';
    if (/\.json$/i.test(f.name)) {
      try {
        const d = JSON.parse(txt);
        await ImageStore.importAll(d.images || []);
        ed.value = d.text || '';
        if (d.title != null) { state.title = d.title; $('#bookTitle').value = d.title; }
        if (d.theme) setTheme(d.theme);
        if (d.size) { state.size = d.size; $('#pageSize').value = d.size; updatePrintSize(); }
        onTextChanged();
        toast('Projeto importado ✓');
      } catch (err) { alert('Arquivo de projeto inválido: ' + err.message); }
    } else {
      ed.value = txt;
      onTextChanged();
      toast('Texto importado ✓');
    }
  });

  async function exportHtml() {
    await render();
    const css = $$('link[rel=stylesheet], style').map(n => n.outerHTML).join('\n');
    const clone = pagesEl.cloneNode(true);
    clone.style.zoom = '';
    clone.classList.remove('spread');
    // embute imagens da biblioteca
    for (const img of $$('img', clone)) {
      if (img.src.startsWith('blob:')) {
        const blob = await (await fetch(img.src)).blob();
        img.src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      }
    }
    const base = location.href.replace(/[^/]*$/, '');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${state.title}</title><base href="${base}">${css}
<style>body{margin:0;background:#555}.book-pages{padding:24px 0}.book-pages .page{margin:0 auto 24px;box-shadow:0 4px 20px rgba(0,0,0,.5)}@media print{body{background:none}.book-pages{padding:0}.book-pages .page{margin:0;box-shadow:none}}</style>
</head><body>${clone.outerHTML}</body></html>`;
    download(fileBase() + '.html', html, 'text/html;charset=utf-8');
  }

  /* ---------- divisor arrastável ---------- */
  function applyEdWidth() { document.documentElement.style.setProperty('--ed-w', state.edWidth + '%'); }
  const splitter = $('#splitter');
  splitter.addEventListener('pointerdown', e => {
    splitter.setPointerCapture(e.pointerId);
    document.body.classList.add('dragging');
    const move = ev => {
      const w = Math.max(20, Math.min(75, ev.clientX / window.innerWidth * 100));
      state.edWidth = Math.round(w * 10) / 10;
      applyEdWidth();
    };
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      save();
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  /* ---------- avisos ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- início ---------- */
  (async function init() {
    applyEdWidth();
    updatePrintSize();
    ed.value = state.text;
    $('#themeName').textContent = (THEMES.find(t => t.id === state.theme) || THEMES[0]).name;
    $('#zoomVal').textContent = Math.round(state.zoom * 100) + '%';
    $('#spreadBtn').classList.toggle('active', state.spread);
    bookClasses(pagesEl);
    await ImageStore.init();
    await render();
  })();

  window.ForjaDeTomos = { render, state, THEMES };
})();
