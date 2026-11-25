/* =====================================================================
   Forja de Tomos — Parser
   Markdown estendido para livros de RPG.
   Converte o texto em blocos HTML de nível superior (cada um com
   data-line), que depois são distribuídos em páginas pelo paginador.
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- utilidades ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const stripMd = s => String(s).replace(/<[^>]+>/g, '').replace(/[*_=~^`]/g, '').trim();

  function slugify(t) {
    return stripMd(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'secao';
  }

  const ALIASES = {
    wide: 'larga', largo: 'larga', 'largura-total': 'larga', 'duas-colunas': 'larga',
    full: 'pagina', page: 'pagina', 'pagina-inteira': 'pagina', fullpage: 'pagina',
    right: 'direita', left: 'esquerda', bottom: 'baixo', rodape: 'baixo',
    center: 'centro', centered: 'centro', centralizado: 'centro',
    noborder: 'sem-borda', semborda: 'sem-borda', 'sem-moldura': 'sem-borda',
    width: 'largura', w: 'largura', height: 'altura', h: 'altura',
    nobreak: 'continuar', 'sem-quebra': 'continuar',
    notoc: 'sem-sumario', 'fora-do-sumario': 'sem-sumario',
    dropcap: 'capitular', 'no-indent': 'sem-recuo'
  };
  function normKey(k) {
    k = String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[.#]/, '');
    return ALIASES[k] || k;
  }

  function parseAttrs(str) {
    const out = { flags: new Set(), kv: {} };
    if (!str) return out;
    const re = /([^\s=]+)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)|([^\s]+)/g;
    let m;
    while ((m = re.exec(str))) {
      if (m[1]) out.kv[normKey(m[1])] = m[2].replace(/^["']|["']$/g, '');
      else out.flags.add(normKey(m[3]));
    }
    return out;
  }

  /* Extrai {atributos} de qualquer lugar de uma string. */
  function extractAttrs(s) {
    let attrs = '';
    const text = String(s || '').replace(/\{([^{}]*)\}/g, (_, a) => { attrs += ' ' + a; return ''; }).trim();
    return { text, attrs: parseAttrs(attrs) };
  }

  const unit = v => /^\d+(\.\d+)?$/.test(v) ? v + '%' : v;
  const unwrapUrl = u => u.replace(/^<|>$/g, '').trim();
  const cssUrl = u => u.replace(/'/g, '%27').replace(/\)/g, '%29');

  /* ---------- inline ---------- */
  function inline(text, ctx) {
    const store = [];
    const hold = h => '\u0001' + (store.push(h) - 1) + '\u0002';

    text = text.replace(/`([^`]+)`/g, (_, c) => hold('<code>' + esc(c) + '</code>'));
    text = text.replace(/!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"([^"]*)")?\s*\)(\{[^}]*\})?/g, (_, alt, src, title, attrs) => {
      const a = parseAttrs(attrs ? attrs.slice(1, -1) : '');
      let st = '';
      if (a.kv.altura) st += `height:${unit(a.kv.altura)};`;
      if (a.kv.largura) st += `width:${unit(a.kv.largura)};`;
      return hold(`<img class="inline-img" src="${esc(ctx.resolve(unwrapUrl(src)))}" alt="${esc(alt)}"${st ? ` style="${st}"` : ''}>`);
    });
    text = text.replace(/\[([^\]]+)\]\(\s*([^)\s]+)\s*\)/g, (_, t, href) => hold(`<a href="${esc(href)}">${inline(t, ctx)}</a>`));
    // HTML cru é permitido (protegido para não ser afetado pelos marcadores)
    text = text.replace(/<\/?[a-zA-Z][^>]*>/g, m => hold(m));

    text = text
      .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
      .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
      .replace(/(^|[^\wÀ-ſ])_(?=\S)([\s\S]*?\S)_(?![\wÀ-ſ])/g, '$1<em>$2</em>')
      .replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
      .replace(/\^\^(?=\S)([\s\S]*?\S)\^\^/g, '<span class="sc">$1</span>');

    let prev;
    do { prev = text; text = text.replace(/\u0001(\d+)\u0002/g, (_, k) => store[k]); } while (text !== prev);
    return text;
  }

  /* ---------- reconhecimento de linhas ---------- */
  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const IMG_LINE = /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"([^"]*)")?\s*\)\s*(\{[^}]*\})?\s*$/;
  const HR_RE = /^([-*_])(\s*\1){2,}$/;
  const PAGE_RE = /^\\(page|pagina|página|newpage|quebra|quebra-de-pagina)\s*$/i;
  const COL_RE = /^\\(column|coluna|colbreak|quebra-de-coluna)\s*$/i;
  const TOC_RE = /^(?:\\(?:toc|sumario|sumário|indice|índice)|\[(?:toc|sumario|sumário)\])(?:\s+(\d))?(?:\s+(.+))?$/i;
  const ABIL_RE = /^@(atributos|attributes|abilities|habilidades)\s+(.*)$/i;
  const SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  const indentOf = l => l.match(/^\s*/)[0].length;

  function startsBlock(lines, j) {
    const l = lines[j], t = l.trim();
    return /^#{1,6}\s/.test(t) || /^:{3,}/.test(t) || /^(`{3,}|~{3,})/.test(t) || t.startsWith('>') ||
      LIST_RE.test(l) || PAGE_RE.test(t) || COL_RE.test(t) || TOC_RE.test(t) || IMG_LINE.test(t) ||
      HR_RE.test(t) || ABIL_RE.test(t) || (t.startsWith('|') && SEP_RE.test(lines[j + 1] || ''));
  }

  /* ---------- blocos ---------- */
  function blocks(lines, base, ctx, depth) {
    const out = [];
    const n = lines.length;
    let i = 0, m;
    while (i < n) {
      const line = lines[i], t = line.trim(), ln = base + i, dl = ` data-line="${ln}"`;
      if (!t) { i++; continue; }

      if (PAGE_RE.test(t)) { out.push(`<div class="x-pagebreak"${dl}></div>`); i++; continue; }
      if (COL_RE.test(t)) { out.push(`<div class="x-colbreak"${dl}></div>`); i++; continue; }
      if ((m = t.match(TOC_RE))) {
        out.push(`<nav class="toc" data-depth="${m[1] || 2}" data-title="${esc(m[2] || 'Sumário')}"${dl}></nav>`);
        i++; continue;
      }

      // bloco de código cercado
      if ((m = t.match(/^(`{3,}|~{3,})(.*)$/))) {
        const fence = m[1]; const code = []; let j = i + 1;
        while (j < n && !lines[j].trim().startsWith(fence)) { code.push(lines[j]); j++; }
        out.push(`<pre${dl}><code>${esc(code.join('\n'))}</code></pre>`);
        i = j + 1; continue;
      }

      // contêiner :::tipo ... :::
      if ((m = t.match(/^:{3,}\s*([^\s{]+)\s*(.*)$/))) {
        let d = 1, j = i + 1, fenced = false;
        for (; j < n; j++) {
          const tj = lines[j].trim();
          if (/^(`{3,}|~{3,})/.test(tj)) fenced = !fenced;
          if (fenced) continue;
          if (/^:{3,}\s*$/.test(tj)) { if (--d === 0) break; }
          else if (/^:{3,}\s*[^\s{]/.test(tj)) d++;
        }
        out.push(container(m[1], m[2], lines.slice(i + 1, j), base + i + 1, ctx, depth, ln));
        i = j + 1; continue;
      }

      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out.push(heading(m[1].length, m[2], ctx, depth, ln)); i++; continue; }
      if (HR_RE.test(t)) { out.push(`<hr${dl}>`); i++; continue; }

      if (t.startsWith('|') && i + 1 < n && SEP_RE.test(lines[i + 1])) {
        let j = i + 2;
        while (j < n && lines[j].trim().startsWith('|')) j++;
        out.push(table(lines.slice(i, j), ctx, ln));
        i = j; continue;
      }

      if (t.startsWith('>')) {
        const q = []; let j = i;
        while (j < n && lines[j].trim().startsWith('>')) { q.push(lines[j].trim().replace(/^>\s?/, '')); j++; }
        out.push(blockquote(q, base + i, ctx, depth, ln));
        i = j; continue;
      }

      if ((m = t.match(IMG_LINE))) { out.push(figure(m, ctx, ln)); i++; continue; }
      if ((m = t.match(ABIL_RE))) { out.push(abilities(m[2], ln)); i++; continue; }

      if (LIST_RE.test(line)) {
        const r = list(lines, i, base, ctx, depth);
        out.push(r.html); i = r.next; continue;
      }

      // parágrafo
      const para = [line]; let j = i + 1;
      while (j < n && lines[j].trim() && !startsBlock(lines, j)) { para.push(lines[j]); j++; }
      out.push(paragraph(para, ctx, depth, ln));
      i = j;
    }
    return out.join('\n');
  }

  const PARA_FLAGS = { centro: 'center', direita: 'right', pequeno: 'small', grande: 'big', capitular: 'dropcap', 'sem-recuo': 'noindent', destaque: 'lead', manuscrito: 'hand' };

  function paragraph(para, ctx, depth, ln) {
    let text = para.map((l, k) => {
      const br = (ctx.keepBreaks || /( {2,}|\\)$/.test(l)) && k < para.length - 1;
      return l.trim().replace(/\\$/, '') + (br ? '<br>' : '');
    }).join(' ').replace(/<br> /g, '<br>');

    const cls = [];
    const mm = text.match(/\s*\{([^{}]*)\}\s*$/);
    if (mm) {
      const a = parseAttrs(mm[1]);
      if (a.flags.size && [...a.flags].every(f => PARA_FLAGS[f]) && !Object.keys(a.kv).length) {
        a.flags.forEach(f => cls.push(PARA_FLAGS[f]));
        text = text.slice(0, mm.index);
      }
    }
    if (depth === 0 && ctx.dropNext) { if (!cls.includes('dropcap')) cls.push('dropcap'); ctx.dropNext = false; }
    return `<p${cls.length ? ` class="${cls.join(' ')}"` : ''} data-line="${ln}">${inline(text, ctx)}</p>`;
  }

  function uniqueId(ctx, base) {
    let id = base, k = 1;
    while (ctx.ids[id]) id = base + '-' + (++k);
    ctx.ids[id] = true;
    return id;
  }

  function heading(level, raw, ctx, depth, ln) {
    const { text, attrs } = extractAttrs(raw);
    const f = attrs.flags;
    if (depth > 0 || ctx.plainHeadings) {
      return `<h${level} data-line="${ln}">${inline(text, ctx)}</h${level}>`;
    }
    const id = uniqueId(ctx, slugify(text));
    const cls = [];
    if (f.has('sem-sumario')) cls.push('no-toc');
    if (f.has('larga')) cls.push('wide');
    const title = esc(stripMd(text));

    if (level === 1) {
      cls.push('chapter', 'wide');
      if (f.has('continuar')) cls.push('no-break');
      let label = '', main = text;
      const mm = text.match(/^(.{1,40}?)\s*[:|—–]\s+(.+)$/);
      if (mm && /\d|^(cap[íi]tulo|parte|ap[êe]ndice|chapter|part|appendix|livro|ato|interl[úu]dio|pr[óo]logo|ep[íi]logo|introdu[çc][ãa]o|anexo|se[çc][ãa]o)\b/i.test(mm[1])) {
        label = mm[1]; main = mm[2];
      }
      ctx.dropNext = !f.has('sem-capitular');
      const running = esc(stripMd(label ? label + ' | ' + main : main));
      return `<h1 id="${id}" class="${cls.join(' ')}" data-title="${title}" data-running="${running}" data-line="${ln}">` +
        (label ? `<span class="ch-label">${inline(label, ctx)}</span>` : '') +
        `<span class="ch-title">${inline(main, ctx)}</span><span class="ch-orn"></span></h1>`;
    }
    return `<h${level} id="${id}"${cls.length ? ` class="${cls.join(' ')}"` : ''} data-title="${title}" data-line="${ln}">${inline(text, ctx)}</h${level}>`;
  }

  const BOX_TYPES = {
    nota: 'nota', note: 'nota', dica: 'nota', regra: 'nota',
    quadro: 'quadro', sidebar: 'quadro', barra: 'quadro', 'barra-lateral': 'quadro', lateral: 'quadro',
    leitura: 'leitura', 'read-aloud': 'leitura', narracao: 'leitura', descricao: 'leitura', ler: 'leitura', fala: 'leitura', balao: 'leitura', dialogo: 'leitura',
    destaque: 'destaque', callout: 'destaque', alerta: 'destaque', aviso: 'destaque', importante: 'destaque',
    citacao: 'citacao', quote: 'citacao', epigrafe: 'citacao',
    criatura: 'criatura', monstro: 'criatura', statblock: 'criatura', monster: 'criatura', npc: 'criatura', ficha: 'criatura', lutador: 'criatura', personagem: 'criatura', inimigo: 'criatura',
    magia: 'magia', spell: 'magia', feitico: 'magia', tecnica: 'magia', golpe: 'magia', habilidade: 'magia', transformacao: 'magia',
    item: 'item', objeto: 'item', 'item-magico': 'item', tesouro: 'item'
  };

  function container(type, rest, inner, innerBase, ctx, depth, ln) {
    const { text: title, attrs } = extractAttrs(rest);
    const f = attrs.flags;
    const t = normKey(type);

    if (t === 'capa' || t === 'cover') {
      let bg = '';
      const body = inner.map(l => {
        const m = l.trim().match(IMG_LINE);
        if (m && !bg) { bg = ctx.resolve(unwrapUrl(m[2])); return ''; }
        return l;
      });
      const sub = Object.assign({}, ctx, { plainHeadings: true, keepBreaks: true });
      const cls = ['cover'];
      if (f.has('baixo')) cls.push('cover-bottom');
      if (f.has('centro')) cls.push('cover-center');
      if (f.has('claro')) cls.push('cover-light');
      return `<section class="${cls.join(' ')}" data-line="${ln}">` +
        (bg ? `<div class="cover-bg" style="background-image:url('${cssUrl(bg)}')"></div>` : '') +
        `<div class="cover-content">${blocks(body, innerBase, sub, depth + 1)}</div></section>`;
    }
    if (t === 'larga' || t === 'wide') {
      return `<div class="wide-wrap wide" data-line="${ln}">${blocks(inner, innerBase, ctx, depth)}</div>`;
    }
    if (t === 'pagina' || t === 'folha' || t === 'solo') {
      const sub = Object.assign({}, ctx, { plainHeadings: true, keepBreaks: true });
      return `<section class="solo-page${f.has('baixo') ? ' solo-bottom' : ''}${f.has('topo') ? ' solo-top' : ''}" data-line="${ln}">${blocks(inner, innerBase, sub, depth + 1)}</section>`;
    }
    if (t === 'centro' || t === 'center') {
      return `<div class="center-wrap" data-line="${ln}">${blocks(inner, innerBase, ctx, depth + 1)}</div>`;
    }

    const kind = BOX_TYPES[t] || t.replace(/[^a-z0-9-]/g, '');
    const cls = ['box', kind];
    if (f.has('baixo')) cls.push('pin-bottom');
    else if (f.has('larga')) cls.push('wide');
    if (f.has('centro')) cls.push('center');
    const style = attrs.kv.fundo ? ` style="background:${esc(attrs.kv.fundo)}"` : '';
    // em fichas, cada linha do texto é uma linha na página
    const keep = kind === 'criatura' || kind === 'magia' || kind === 'item';
    const innerHtml = blocks(inner, innerBase, keep ? Object.assign({}, ctx, { keepBreaks: true }) : ctx, depth + 1);
    if (kind === 'citacao') {
      return `<div class="${cls.join(' ')}"${style} data-line="${ln}">${innerHtml}${title ? `<p class="cite">— ${inline(title, ctx)}</p>` : ''}</div>`;
    }
    const tag = kind === 'criatura' ? 'h3' : 'h4';
    return `<div class="${cls.join(' ')}"${style} data-line="${ln}">` +
      (title ? `<${tag} class="box-title">${inline(title, ctx)}</${tag}>` : '') + innerHtml + `</div>`;
  }

  function figure(m, ctx, ln) {
    const alt = m[1], src = ctx.resolve(unwrapUrl(m[2]));
    const a = parseAttrs(m[4] ? m[4].slice(1, -1) : '');
    const f = a.flags, kv = a.kv;
    const cap = alt && !f.has('sem-legenda') ? alt : '';
    if (f.has('pagina')) {
      return `<section class="art-page${f.has('conter') ? ' contain' : ''}" data-line="${ln}"><img src="${esc(src)}" alt="${esc(alt)}">` +
        (cap ? `<div class="art-caption">${inline(cap, ctx)}</div>` : '') + `</section>`;
    }
    const cls = ['fig'];
    if (f.has('baixo')) cls.push('pin-bottom');
    else if (f.has('larga')) cls.push('wide');
    if (f.has('direita')) cls.push('float-right');
    if (f.has('esquerda')) cls.push('float-left');
    if (f.has('sem-borda')) cls.push('noborder');
    if (f.has('centro')) cls.push('center');
    if (f.has('redonda')) cls.push('round');
    if (f.has('recorte')) cls.push('cutout');          // força: imagem sem fundo (sem moldura)
    if (f.has('moldura')) cls.push('framed');          // força: mantém moldura mesmo se for transparente
    let st = '';
    if (kv.largura) st += `width:${unit(kv.largura)};`;
    const imgSt = kv.altura ? ` style="height:${unit(kv.altura)};object-fit:cover"` : '';
    return `<figure class="${cls.join(' ')}"${st ? ` style="${st}"` : ''} data-line="${ln}"><img src="${esc(src)}" alt="${esc(alt)}"${imgSt}>` +
      (cap ? `<figcaption>${inline(cap, ctx)}</figcaption>` : '') + `</figure>`;
  }

  function abilities(str, ln) {
    const nums = (str.match(/-?\d+/g) || []).slice(0, 6).map(Number);
    const labels = ['FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'];
    const mod = s => { const v = Math.floor((s - 10) / 2); return (v >= 0 ? '+' : '−') + Math.abs(v); };
    return `<table class="abilities" data-line="${ln}"><thead><tr>${labels.slice(0, Math.max(nums.length, 1)).map(l => `<th>${l}</th>`).join('')}</tr></thead>` +
      `<tbody><tr>${nums.map(s => `<td>${s} (${mod(s)})</td>`).join('')}</tr></tbody></table>`;
  }

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  }

  function table(rows, ctx, ln) {
    const head = splitRow(rows[0]);
    const al = splitRow(rows[1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '');
    const st = k => al[k] ? ` style="text-align:${al[k]}"` : '';
    const th = head.map((c, k) => `<th${st(k)}>${inline(c, ctx)}</th>`).join('');
    const body = rows.slice(2).map(r => '<tr>' + splitRow(r).map((c, k) => `<td${st(k)}>${inline(c, ctx)}</td>`).join('') + '</tr>').join('');
    return `<table data-line="${ln}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function blockquote(q, base, ctx, depth, ln) {
    let cite = '';
    if (q.length && /^(—|--|~)\s*/.test(q[q.length - 1].trim())) cite = q.pop().trim().replace(/^(—|--|~)\s*/, '');
    return `<blockquote data-line="${ln}">${blocks(q, base, ctx, depth + 1)}${cite ? `<p class="cite">— ${inline(cite, ctx)}</p>` : ''}</blockquote>`;
  }

  function list(lines, i, base, ctx, depth) {
    const first = lines[i].match(LIST_RE);
    const baseInd = first[1].length;
    const ordered = /\d/.test(first[2]);
    const start = ordered ? parseInt(first[2], 10) : 1;
    const items = [];
    let cur = null, j = i, loose = false, prevBlank = false;
    while (j < lines.length) {
      const l = lines[j];
      if (!l.trim()) {
        let k = j + 1;
        while (k < lines.length && !lines[k].trim()) k++;
        if (k >= lines.length) break;
        const nm = lines[k].match(LIST_RE), ind = indentOf(lines[k]);
        if ((nm && ind <= baseInd + 1 && /\d/.test(nm[2]) === ordered) || ind > baseInd + 1) {
          cur.lines.push(''); prevBlank = true; j++; continue;
        }
        break;
      }
      const m = l.match(LIST_RE), ind = indentOf(l);
      if (m && ind <= baseInd + 1) {
        if (/\d/.test(m[2]) !== ordered) break;
        if (prevBlank) loose = true;
        cur = { lines: [m[3]], ln: base + j, ci: ind + m[2].length + 1 };
        items.push(cur); prevBlank = false; j++; continue;
      }
      if (ind > baseInd + 1 || (!prevBlank && !startsBlock(lines, j))) {
        cur.lines.push(ind >= cur.ci ? l.slice(cur.ci) : l.trim());
        prevBlank = false; j++; continue;
      }
      break;
    }
    const lis = items.map(it => {
      let h = blocks(it.lines, it.ln, ctx, depth + 1);
      if (!loose) h = h.replace(/^<p[^>]*>([\s\S]*?)<\/p>/, '$1');
      return `<li>${h}</li>`;
    }).join('');
    const tag = ordered ? 'ol' : 'ul';
    return {
      html: `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''} data-line="${base + i}">${lis}</${tag}>`,
      next: j
    };
  }

  /* ---------- API ---------- */
  function parse(src, opts) {
    opts = opts || {};
    const ctx = { resolve: opts.resolve || (s => s), ids: Object.create(null), dropNext: false };
    const lines = String(src || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    return blocks(lines, 0, ctx, 0);
  }

  global.BookParser = { parse, slugify, inline: (t, o) => inline(t, { resolve: (o && o.resolve) || (s => s) }) };
})(window);
