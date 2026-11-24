# Forja de Tomos

Editor e diagramador de livros de RPG no navegador. Você escreve em texto simples (estilo Markdown) e a Forja monta o livro com **duas colunas contínuas**: o texto enche a coluna da esquerda, continua na da direita e segue para a próxima página, dividindo parágrafos, listas, tabelas e quadros automaticamente.

## Recursos

- Capa, página de créditos, sumário automático com números de página
- Capítulos com letra capitular e nome no rodapé
- Notas, quadros laterais (inclusive presos ao pé da coluna), texto para ler em voz alta, destaques e citações
- Fichas de criatura com tabela de atributos calculada, blocos de magia e itens
- Tabelas que continuam na página seguinte repetindo o cabeçalho
- Imagens por link, do computador, coladas (Ctrl+V) ou arrastadas — na coluna, em largura total, flutuando, no pé da coluna ou em página inteira
- Contador de páginas decorado e rodapé corrido
- 6 temas: Tomo Clássico, Grimório Sombrio, Crônica Élfica, Forja Anã, Diário do Explorador e Aura de Ki
- Exporta PDF com texto selecionável, Markdown, HTML e projeto `.json` (com as imagens)

## Como usar

Abra o `index.html` no navegador (ou rode `node serve.js` e acesse http://localhost:5173). O botão **❔ Guia** dentro do app mostra toda a sintaxe.

Para gerar o PDF: **Exportar PDF** → destino **Salvar como PDF**, margens **Nenhuma**.

O texto e as imagens ficam salvos no próprio navegador; use **Arquivo → Salvar projeto** para guardar uma cópia.
