# Gráfico de Crochê Pixel

🔗 **Acesse aqui:** [tathianamb.github.io/pixel-crochet](https://tathianamb.github.io/pixel-crochet/)

Ferramenta web simples para transformar uma imagem **já pixelada** em um gráfico de crochê (ou tricô) pixel — leitura automática de cor, ajuste de linhas/colunas e contador de carreiras. Tudo roda **100% no navegador**, nenhuma imagem é enviada a servidores.

Seu projeto (grade + progresso do contador) é **salvo automaticamente neste navegador**, então dá pra fechar e continuar dias depois de onde parou.

## Como usar

O app funciona como um carrossel de telas cheias — uma por vez, sem precisar rolar a página. Navegue deslizando o dedo (swipe) para os lados ou usando os botões "← " / "Avançar →" fixos embaixo.

1. **Tela 1** — Envie uma imagem já em pixel art (blocos de cor sólida).
2. **Tela 2** — Informe quantas colunas e linhas de pixels a imagem tem, e toque em "Gerar / atualizar gráfico". Veja o resultado ali mesmo; se não bateu certo, ajuste os números e gere de novo, quantas vezes precisar.
3. **Tela 3** — Ajuste as bordas (linhas/colunas extras) se precisar.
4. **Tela 4** — Contador de carreiras, para acompanhar seu progresso enquanto crocheta ou tricota.

Os pontinhos no topo mostram em qual tela você está.

## Sobre a persistência

O projeto fica salvo no `localStorage` do navegador usado. Isso significa:
- Funciona por navegador + dispositivo (não sincroniza entre celular e computador, por exemplo).
- Limpar dados de navegação/cache do navegador apaga o projeto salvo.
- Para começar um projeto novo, use o botão "Começar novo projeto" na barra do topo.

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (pode ser público).
2. Suba os arquivos `index.html` e `app.js` para a raiz do repositório.
3. Vá em **Settings → Pages**.
4. Em "Source", selecione a branch `main` (ou `master`) e a pasta `/root`.
5. Salve. Em alguns minutos, o GitHub vai gerar uma URL do tipo:
   `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`
6. Pronto — a ferramenta está pública e qualquer pessoa pode acessar o link.

## Estrutura dos arquivos

- `index.html` — estrutura da página e estilos.
- `app.js` — toda a lógica: leitura automática de cor da imagem (amostragem + agrupamento k-means simplificado em até 6 cores), ajuste de linhas/colunas, contador de carreiras. Tudo salvo no `localStorage` do navegador de quem usa.

## Limitações conhecidas

- O progresso é salvo por navegador/dispositivo (via `localStorage`), não é sincronizado entre aparelhos.
- A leitura de cor funciona melhor com imagens que já são pixel art nítida (blocos de cor sólida). Fotos comuns ou imagens borradas podem gerar uma grade menos precisa.
- O número de cores detectadas é limitado a 6; imagens com mais cores serão agrupadas nas cores mais próximas.
