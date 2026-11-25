/* =====================================================================
   Forja de Tomos — Guia de escrita para IA
   Mede a página de verdade (tema e tamanho atuais) e gera um texto para
   colar no começo da conversa com a IA que vai escrever o livro: quantas
   palavras cabem, quanto cada elemento ocupa, as regras do diagramador e
   o estado atual do livro (páginas com espaço sobrando).
   ===================================================================== */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const API = () => window.ForjaDeTomos;

  const SENT = 'O guerreiro gasta a Estamina para atacar, defender e se mover durante o turno, e cada dado investido é uma escolha importante na luta.';
  const SENT_WORDS = SENT.split(/\s+/).length;
  const PARA = [SENT, SENT, SENT, SENT].join(' ');
  const PARA_WORDS = SENT_WORDS * 4;

  const parse = md => {
    const d = document.createElement('div');
    d.innerHTML = BookParser.parse(md);
    return [...d.children];
  };
  const words = el => (el.textContent.match(/\S+/g) || []).length;
  const r10 = n => Math.round(n / 10) * 10;
  const r1 = n => Math.round(n * 10) / 10;

  const tableMd = (n, longText) => {
    let s = '| Nome | Descrição | Valor |\n|:--|:--|:--|\n';
    for (let i = 0; i < n; i++) {
      s += longText
        ? '| Nome | Uma descrição mais longa, com várias palavras, que ocupa mais de uma linha | 10 |\n'
        : '| Nome | Texto curto | 10 |\n';
    }
    return s;
  };
  const listMd = n => Array.from({ length: n }, () => '- Um item curto de lista.').join('\n');

  const STAT = [':::criatura Nome do Lutador', '*Humanoide Médio, rival*', '', '---', '',
    '**Classe de Armadura** 16', '**Pontos de Vida** 85 (10d10 + 30)', '**Deslocamento** 12 m, voo 18 m', '', '---', '',
    '@atributos 18 18 16 10 14 12', '', '---', '',
    '**Sentidos** sentir ki 1 km, Percepção passiva 15', '**Nível de Desafio** 6 (2.300 XP)', '',
    '***Orgulho do Rival.*** Tem Vantagem em ataques contra uma criatura que o derrotou antes.', '',
    '#### Ações', '', '***Sequência de Golpes.*** Faz três ataques de soco. *Acerto:* 10 (2d6 + 3) de dano contundente cada.', ':::'].join('\n');
  const TECH = [':::tecnica Nome da Técnica', '*Técnica especial de movimento*', '**TP:** 400 · **Horas com mestre:** 40',
    '**Exige:** Controle Avançado', '**Custo:** 2 Ki + 1 EST', ':::'].join('\n');

  /* ---------- medição ---------- */
  async function measure() {
    const api = API();
    const { state, THEMES, stage } = api;
    const theme = THEMES.find(t => t.id === state.theme) || THEMES[0];
    await api.loadFonts(theme);
    await document.fonts.ready;
    api.bookClasses(stage);

    // 1) capacidade real: capítulo + muito texto corrido, diagramado pelo motor de verdade
    const filler = Array.from({ length: 150 }, () => PARA).join('\n\n');
    Paginator.paginate(parse('# Capítulo 1: Título do Capítulo\n\n' + filler), stage, {});
    const pages = [...stage.querySelectorAll('.page')];
    const opener = pages[0], full = pages[1];
    const wOpener = words(opener.querySelector('.page-body')) - words(opener.querySelector('h1'));
    const wPage = words(full.querySelector('.page-body'));

    // 2) geometria
    const body = full.querySelector('.page-body');
    const col = full.querySelector('.col');
    const colH = col.clientHeight, colW = col.clientWidth, bodyW = body.clientWidth;
    col.replaceChildren(...parse('palavra'));
    const lineH = col.firstElementChild.offsetHeight;
    col.replaceChildren(...parse(PARA));
    const paraLines = col.firstElementChild.offsetHeight / lineH;
    const wordsPerLine = PARA_WORDS / paraLines;
    const L = Math.floor(colH / lineH);

    // 3) custo de cada elemento, em linhas de texto (mede o espaço entre dois parágrafos marcadores)
    const costEls = (host, els) => {
      const m1 = parse('marcador')[0], m2 = parse('marcador')[0];
      host.replaceChildren(m1, ...els, m2);
      return Math.max(0, m2.offsetTop - (m1.offsetTop + m1.offsetHeight)) / lineH;
    };
    const cost = (host, md) => costEls(host, parse(md));
    const fig = (h, caption) => {
      const f = document.createElement('figure');
      f.className = 'fig';
      f.innerHTML = `<img alt="" style="height:${h}px;width:100%;object-fit:cover">` + (caption ? '<figcaption>Legenda curta da imagem</figcaption>' : '');
      return f;
    };

    const c = {};
    c.h2 = cost(col, '## Título de seção');
    c.h3 = cost(col, '### Subtítulo');
    c.h4 = cost(col, '#### Título menor');
    c.h5 = cost(col, '##### Tabela: Nome da tabela');
    const list1 = cost(col, listMd(1)), list6 = cost(col, listMd(6));
    c.listItem = (list6 - list1) / 5; c.listBase = list1 - c.listItem;
    const t1 = cost(col, tableMd(1)), t6 = cost(col, tableMd(6));
    c.tableRow = (t6 - t1) / 5; c.tableBase = t1 - c.tableRow;
    const tl1 = cost(col, tableMd(1, true)), tl6 = cost(col, tableMd(6, true));
    c.tableRowLong = (tl6 - tl1) / 5;
    c.nota = cost(col, ':::nota Título da nota\nUma linha.\n:::') - 1;
    c.quadro = cost(col, ':::quadro Título do quadro\nUma linha.\n:::') - 1;
    c.destaque = cost(col, ':::destaque Título\nUma linha.\n:::') - 1;
    c.stat = cost(col, STAT);
    c.tech = cost(col, TECH);
    c.quote = cost(col, '> Uma frase curta de citação.\n> — Autor');
    c.hr = cost(col, '---');
    c.figCap = costEls(col, [fig(100, true)]) - 100 / lineH;
    c.figNoCap = costEls(col, [fig(100, false)]) - 100 / lineH;
    // largura total (ocupa a mesma altura nas duas colunas)
    c.chapter = cost(body, '# Capítulo 1: Título do Capítulo');
    const w1 = cost(body, ':::larga\n' + tableMd(1) + ':::'), w6 = cost(body, ':::larga\n' + tableMd(6) + ':::');
    c.wideRow = (w6 - w1) / 5; c.wideBase = w1 - c.wideRow;
    stage.replaceChildren();

    return {
      theme: theme.name, size: state.size === 'a4' ? 'A4 (21 × 29,7 cm)' : 'Carta (21,6 × 27,9 cm)',
      L, wordsPerLine, wordsCol: wPage / 2, wordsPage: wPage, wordsOpener: wOpener,
      imgLines: colW / lineH, wideImgLines: bodyW / lineH, lineH, c
    };
  }

  /* ---------- texto do guia ---------- */
  const REASON_TXT = {
    capitulo: 'o capítulo seguinte começa em página nova',
    quebra: 'há um \\pagina logo depois',
    especial: 'a página seguinte é especial (capa, página avulsa ou arte)',
    'bloco-largo': 'uma tabela :::larga não coube e foi para a página seguinte',
    'bloco-alto': 'uma imagem ou ficha não coube e foi para a página seguinte',
    cheia: 'um título, imagem ou tabela curta não coube no pé da coluna',
    fim: 'é a última página do livro'
  };

  function buildGuide(m) {
    const n = x => Math.max(1, Math.round(x));
    const c = m.c;
    const wl = r1(m.wordsPerLine);
    const out = [];
    out.push(`# Guia de escrita para a Forja de Tomos`,
      ``,
      `Você vai escrever (ou revisar) o texto de um livro de RPG que será diagramado automaticamente pela Forja de Tomos.`,
      `Este guia diz **quanto cabe em cada página** e **como o diagramador distribui o texto**, para o livro sair sem páginas meio vazias.`,
      `Medidas tiradas do diagramador real, no tema **${m.theme}**, página **${m.size}**, em **duas colunas**.`,
      ``,
      `## 1. Medidas da página`,
      ``,
      `| Medida | Valor |`,
      `|:--|:--|`,
      `| Linhas de texto por coluna | ${m.L} linhas |`,
      `| Palavras por linha (média) | ~${wl} palavras |`,
      `| Palavras por coluna (só texto corrido) | ~${r10(m.wordsCol)} palavras |`,
      `| **Página cheia (2 colunas)** | **~${r10(m.wordsPage)} palavras** |`,
      `| **Primeira página de um capítulo** (o título ocupa o topo) | **~${r10(m.wordsOpener)} palavras** |`,
      ``,
      `Use as palavras como orçamento: tudo o que não é texto corrido (títulos, tabelas, quadros, imagens) "gasta" linhas.`,
      `Para converter: **1 linha ≈ ${wl} palavras**, e cada página tem **${m.L * 2} linhas** (${m.L} por coluna).`,
      ``,
      `## 2. Quanto cada elemento ocupa`,
      ``,
      `Valores em linhas de uma coluna (inclui o espaço antes e depois do elemento).`,
      ``,
      `| Elemento | Ocupa |`,
      `|:--|:--|`,
      `| Título de capítulo \`# Capítulo N: Nome\` | ${n(c.chapter)} linhas **nas duas colunas** (sempre no topo de página nova) |`,
      `| Título de seção \`##\` | ${n(c.h2)} linhas |`,
      `| Subtítulo \`###\` | ${n(c.h3)} linhas |`,
      `| Título menor \`####\` | ${n(c.h4)} linhas |`,
      `| Título de tabela \`#####\` | ${n(c.h5)} linhas |`,
      `| Item de lista (curto, 1 linha) | ${r1(c.listItem)} linha por item (+${r1(Math.max(0, c.listBase))} pela lista) |`,
      `| Tabela numa coluna | ${n(c.tableBase)} linhas de cabeçalho + ${r1(c.tableRow)} por linha curta (${r1(c.tableRowLong)} se a célula tiver ~15 palavras) |`,
      `| Tabela \`:::larga\` (duas colunas) | ${n(c.wideBase)} linhas de cabeçalho + ${r1(c.wideRow)} por linha, **nas duas colunas** |`,
      `| Nota / Quadro / Destaque (\`:::nota\` etc.) | o texto de dentro + ${n(Math.max(c.nota, c.quadro, c.destaque))} linhas de moldura e título |`,
      `| Ficha de lutador/criatura típica (\`:::criatura\`) | ~${n(c.stat)} linhas |`,
      `| Bloco de técnica curto (\`:::tecnica\`, 4 linhas) | ~${n(c.tech)} linhas |`,
      `| Citação curta (\`>\`) | ${n(c.quote)} linhas |`,
      `| Divisor \`---\` | ${n(c.hr)} linha |`,
      `| Imagem na coluna, largura 100% | altura da imagem + ${n(c.figCap)} linhas com legenda (${n(c.figNoCap)} sem) |`,
      ``,
      `**Altura de imagens:** uma imagem na coluna com largura 100% e proporção altura ÷ largura = R ocupa **${n(m.imgLines)} × R linhas**`,
      `(quadrada ≈ ${n(m.imgLines)} linhas; retrato 3:4 ≈ ${n(m.imgLines * 4 / 3)}; com \`largura=60%\` ≈ ${n(m.imgLines * 0.6)} × R).`,
      `Imagem \`{larga}\` (duas colunas): **${n(m.wideImgLines)} × R linhas nas duas colunas**. Imagem \`{pagina}\` ocupa a página inteira.`,
      ``,
      `## 3. Como o diagramador distribui o texto`,
      ``,
      `- O texto enche a coluna da esquerda, continua na da direita e segue para a próxima página.`,
      `- Parágrafos, listas, tabelas e quadros são **divididos** automaticamente entre colunas e páginas (tabelas repetem o cabeçalho e nunca deixam uma linha sozinha).`,
      `- **Não se dividem:** títulos (nunca ficam sozinhos no pé da coluna), imagens e o título de um quadro. Se não couberem, vão para a próxima coluna, e o texto seguinte preenche o espaço.`,
      `- **Todo capítulo (\`#\`) começa em página nova.** O espaço que sobrar na última página do capítulo anterior fica vazio. Para um capítulo começar na mesma página, escreva \`# Capítulo N: Nome {continuar}\`.`,
      `- No fim de cada capítulo as duas colunas são equilibradas (o texto da última página se divide igualmente entre elas).`,
      `- Tabela \`:::larga\` que não cabe no resto da página vai para o **topo da página seguinte**, e o texto que vem depois dela continua enchendo a página atual.`,
      `- Imagem ou quadro com \`{baixo}\` fica preso ao **pé da coluna**, e o texto corre por cima.`,
      `- \`\\pagina\` força página nova e \`\\coluna\` força coluna nova. **Evite** usar só para "organizar": cada um pode deixar espaço vazio.`,
      `- \`:::pagina\` (página avulsa) e \`:::capa\` ocupam sempre uma página inteira sozinhos.`,
      ``,
      `## 4. Como planejar para não sobrar espaço`,
      ``,
      `1. **Planeje cada capítulo em páginas inteiras.** Um capítulo de P páginas comporta ~${r10(m.wordsOpener)} + (P − 1) × ${r10(m.wordsPage)} palavras de texto corrido, **menos** o que títulos, tabelas, quadros e imagens gastam (seção 2).`,
      `2. **A última página de cada capítulo deve terminar entre 85% e 100% cheia.** Se faltar texto, acrescente conteúdo útil (exemplo, quadro de dica, tabela, imagem); se sobrar pouco, corte ou mova algo para o capítulo seguinte. Não encha com texto vazio.`,
      `3. **Imagens são o ajuste mais fácil:** com a altura de imagens (seção 2) dá para fechar a página exatamente. Mudar \`largura=\` ajusta a altura.`,
      `4. Tabelas \`:::larga\` longas (mais de ~${n((m.L * 0.45 - c.wideBase) / Math.max(0.5, c.wideRow))} linhas) dificilmente cabem no fim de uma página; coloque-as logo depois de um título de seção ou divida em duas.`,
      `5. Quando entregar o texto, informe para cada capítulo a estimativa: "~X palavras de texto + elementos ≈ P páginas, última página ~Y% cheia".`,
      ``,
      `## 5. Sintaxe (resumo)`,
      ``,
      '```',
      '# Capítulo 1: Nome            título de capítulo (página nova)',
      '## Seção   ### Subtítulo   #### Menor   ##### Tabela: Nome',
      '**negrito**  *itálico*  ==marca-texto==  ^^Versalete^^',
      '- item de lista      1. item numerado',
      '> citação            > — Autor',
      '---                  divisor',
      '\\pagina  \\coluna  \\sumario',
      ':::nota Título  (também: quadro, leitura, destaque, citacao, criatura/lutador, magia/tecnica, item)',
      'texto do bloco',
      ':::',
      ':::quadro{baixo} Título      bloco preso ao pé da coluna',
      ':::larga                     conteúdo (ex.: tabela) na largura das duas colunas',
      ':::pagina   :::capa          página avulsa centralizada / capa',
      '@atributos 10 14 12 8 13 15  (dentro de :::criatura) tabela de atributos',
      '![Legenda](link){larga | direita | esquerda | baixo | pagina | largura=60% | sem-borda}',
      '| Coluna | Coluna |   tabelas no formato Markdown',
      '|:--|:--|',
      '```');

    // estado atual do livro
    const info = (API().getPageInfo() || []).filter(p => p && p.el);
    if (info.length) {
      out.push('', `## 6. Estado atual do livro`, '',
        `O texto atual tem **${info.length} páginas** neste tema e tamanho.`);
      const chName = p => (p.el.dataset.chapter || '').replace(/\s*\|\s*/g, ': ') || '(antes do primeiro capítulo)';
      const specials = info.filter(p => p.kind === 'especial').map(p => p.n);
      if (specials.length) out.push(`Páginas especiais (capa, avulsas, arte de página inteira): ${specials.join(', ')}.`);
      const chapters = [];
      for (const p of info) {
        if (p.kind === 'especial') continue;
        const ch = chName(p);
        const last = chapters[chapters.length - 1];
        if (!last || last.name !== ch) chapters.push({ name: ch, pages: [p] });
        else last.pages.push(p);
      }
      out.push('', '| Capítulo | Páginas | Última página |', '|:--|:--|:--|');
      for (const ch of chapters) {
        const a = ch.pages[0].n, b = ch.pages[ch.pages.length - 1].n;
        const lastP = ch.pages[ch.pages.length - 1];
        out.push(`| ${ch.name} | ${a === b ? a : a + '–' + b} (${ch.pages.length}) | ${lastP.fill}% cheia |`);
      }
      const issues = info.filter(p => p.sev === 'bad' || p.sev === 'warn');
      if (issues.length) {
        out.push('', `**Páginas com espaço sobrando** (para completar, cortar ou reorganizar):`, '');
        for (const p of issues) {
          const freeFrac = Math.max(0, 1 - p.fill / 100);
          out.push(`- **Pág. ${p.n}** (${chName(p)}): ${p.fill}% cheia — cabem mais ~${r10(freeFrac * m.wordsPage)} palavras` +
            ` (~${Math.round(freeFrac * m.L)} linhas em cada coluna); motivo: ${REASON_TXT[p.reason] || REASON_TXT.cheia}.`);
        }
      } else {
        out.push('', 'Nenhuma página com espaço sobrando.');
      }
    }
    return out.join('\n');
  }

  /* ---------- janela ---------- */
  const dlg = $('#aiDialog');
  async function open() {
    const api = API();
    $('#aiText').value = 'Medindo a página…';
    $('#aiMeta').textContent = '';
    dlg.showModal();
    try {
      await api.render();
      const m = await measure();
      $('#aiText').value = buildGuide(m);
      $('#aiMeta').textContent = `Medido no tema ${m.theme}, página ${m.size}. Mudou o tema ou o tamanho? Abra o guia de novo.`;
      api.render();   // refaz a diagramação (a medição usou a área de trabalho)
    } catch (e) {
      console.error(e);
      $('#aiText').value = 'Não foi possível medir a página: ' + e.message;
    }
  }
  $('#aiBtn').addEventListener('click', open);
  $('#aiClose').addEventListener('click', () => dlg.close());
  $('#aiCopy').addEventListener('click', async () => {
    const t = $('#aiText');
    try { await navigator.clipboard.writeText(t.value); }
    catch (e) { t.select(); document.execCommand('copy'); }
    API().toast('Guia copiado. Cole no começo da conversa com a IA.');
  });
  $('#aiDownload').addEventListener('click', () => {
    const api = API();
    api.download('guia-para-ia-' + api.fileBase() + '.md', $('#aiText').value, 'text/markdown;charset=utf-8');
  });

  window.ForjaAIGuide = { measure, buildGuide };
})();
