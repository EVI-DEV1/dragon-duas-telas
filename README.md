# DRAGON // travessia de duas telas

Um dragão que atravessa fisicamente do monitor da direita para o notebook da
esquerda. Não é transição de página, não é redirect, não é um segundo dragão
desenhado do outro lado.

---

## A ideia central

O erro óbvio seria: "quando o dragão sai da tela 1, mando um evento e a tela 2
cria um dragão entrando pela direita". Isso sempre parece teleporte, porque são
duas animações independentes costuradas por um evento.

Aqui é outra coisa:

> **Existe um mundo virtual único que atravessa os dois monitores.
> A borda física entre as telas é a coordenada `x = 0` desse mundo.
> Cada janela é apenas um recorte dele.**

```
        NOTEBOOK (esquerda)              MONITOR (direita)
  [ -1601 ................. 0 ]  ||  [ 0 ................. 1440 ]
                              ^^^^^^^^
                          x = 0  (a moldura)
```

O dragão nunca é recriado. Ele voa dentro desse mundo, e cada janela mostra
a parte que cai no seu recorte. Quando ele chega em `x = 0`, a cabeça entra
no recorte do notebook **no mesmo frame** em que sai do recorte do monitor.

Durante ~770 ms da travessia o corpo está **nas duas telas ao mesmo tempo**:
a cabeça já no notebook, a cauda ainda no monitor. Medido no teste — a tela
que recebe registra 25 frames com o corpo dividido, indo de 1 até 77 vértebras
do lado dela.

### Quem simula

Uma única janela simula (o *dono*) e transmite o **corpo inteiro** —
78 vértebras × (x, y, ângulo) — a 60 Hz. A outra **não simula nada**:
ela desenha exatamente o corpo que recebeu.

Quando a cauda termina de passar, o domínio muda de janela
(`DRAGON_HANDOFF`) sem cortar o movimento: a nova dona adota o corpo exato,
a velocidade exata e continua o mesmo voo.

### O detalhe que faz funcionar

As duas telas desenham **o mesmo instante do mundo**: `worldNow() - renderDelay`
(26 ms). Inclusive a janela dona, que também desenha atrasada.

Sem isso, a dona desenharia o "agora" e a receptora desenharia o "agora menos a
latência" — e o corpo apareceria descolado exatamente na emenda, que é o único
lugar onde dá para perceber. Com isso, as duas mostram sempre o mesmo frame do
mundo, e a emenda fecha.

O relógio comum é `performance.timeOrigin + performance.now()`, que dá um epoch
sub-milissegundo comparável entre janelas da mesma máquina.

---

## Estrutura

```
dragão/
├── index.html                 painel: abre as duas janelas, calibra, configura
├── monitor.html               TELA 1 (direita)
├── notebook.html              TELA 2 (esquerda)
│
├── css/
│   └── style.css              interface das três páginas
│
├── js/
│   ├── config.js              DISPLAY_CONFIG + calibração persistida
│   ├── bridge.js              BroadcastChannel + postMessage + localStorage
│   ├── world.js               mapeamento mundo <-> tela, escala, costura
│   ├── dragon.js              motor da criatura (física + serialização)
│   ├── dragon-render.js       desenho: escamas, asas, cauda, cabeça
│   ├── fx.js                  partículas, anéis, atmosfera, costura
│   ├── screen.js              runtime compartilhado pelas duas janelas
│   └── launcher.js            abertura nas telas certas + auto-calibração
│
├── server.js                  servidor local (Node, sem dependências)
├── start.bat                  sobe o servidor e abre o navegador
└── legado-single-screen.html  o projeto original preservado
```

`monitor.html` e `notebook.html` carregam **o mesmo runtime**, mudando só o
papel. Duas cópias de código produziriam duas animações independentes — que é
justamente o que não queremos.

---

## Como rodar

```bash
node server.js
```

ou clique duas vezes em `start.bat`. Depois abra `http://localhost:5173`.

**Precisa ser servidor.** Em `file://` o Chrome trata cada janela como uma
origem opaca e diferente: BroadcastChannel e localStorage não são
compartilhados, e as telas nunca se enxergam.

---

## Um clique

O botão **Começar a experiência** faz a sequência inteira:

1. detecta os monitores (Window Management API);
2. abre as duas janelas — como *pop-ups*, sem barra de endereço, já
   dimensionadas para preencher cada monitor;
3. espera as duas aparecerem no canal;
4. calibra pelas dimensões reais que cada janela reporta;
5. conta 3 segundos e dispara a travessia (`LAUNCH_REQUEST`).

O clique do usuário é o gesto que autoriza abrir janelas e pedir a permissão
de gerenciamento de telas — por isso tudo isso pode acontecer num botão só.

O Chrome vai pedir **duas** autorizações: pop-ups e gerenciamento de janelas.
Recusando qualquer uma, a sequência não quebra: ela informa o que faltou e o
resto continua funcionando com posicionamento manual.

### Abrir na mão, se preferir

Abra `monitor.html` e `notebook.html` em duas janelas, arraste cada uma para o
seu monitor e tecle `F` em cada uma. Depois volte ao painel e clique em
**Calibrar automaticamente**.

### Inverter os lados

No painel, **Inverter os lados**. Ou direto no código:

```js
const DISPLAY_CONFIG = {
    monitorPosition: "right",    // troque para "left"
    notebookPosition: "left",    // troque para "right"
    transitionDuration: 1200,
    dragonScale: 1
};
```

Todo o resto se ajusta sozinho: a borda que acende, o lado por onde ele sai,
o lado por onde entra, e a posição dos painéis (que sempre ficam do lado
oposto à costura, para não atrapalhar a passagem).

---

## Testar a travessia

Clique em **Começar a experiência** e olhe para a **moldura entre os
monitores** — não para o dragão. É lá que a ilusão acontece.

### Clique para chamá-lo

**Clique em qualquer ponto de qualquer uma das duas telas** e o dragão voa até
lá. Se o ponto estiver do outro lado da moldura, a travessia inteira acontece
sozinha — é a mesma mecânica do botão, sem código especial de direção.

O ponto clicado é convertido para coordenadas do **mundo**, então clicar no
notebook e clicar no monitor são a mesma operação: só muda o destino. Ele pousa
exatamente onde você clicou (medido: erro de 0 px nas duas direções).

Se a tela onde você clicou não é a que está com o dragão, ela apenas envia um
`SUMMON`; quem tem o domínio executa.

### Quando ele aparece

O dragão está no monitor **desde que a janela abre** — voando e seguindo o
mouse. No notebook não há nada até a travessia: ele está fora do campo de
visão daquela tela, e é isso que faz a entrada funcionar.

Depois do clique, a linha do tempo é:

| momento | o que acontece |
|---|---|
| 0 s | contagem **3 · 2 · 1** aparece **nas duas telas**, e a moldura pulsa |
| 3,0 s | ele arranca e começa a acelerar |
| ~4,5 s | a cabeça chega na borda — a contagem já sumiu |
| 4,5 → 5,3 s | **os 0,8 s da travessia**: corpo nas duas telas ao mesmo tempo |
| ~6 s | freia e pousa no notebook |

A contagem roda **dentro das telas do dragão**, não no painel: com as janelas
em tela cheia, o painel fica escondido atrás delas e o aviso não seria visto.
As duas contam a partir do mesmo relógio compartilhado, então os números
trocam juntos nos dois monitores.

O HUD no canto de cada tela também narra: `PREPARANDO A PARTIDA` →
`DRAGAO A CAMINHO DA BORDA` → `SAINDO PELA BORDA` → `CHEGADA CONFIRMADA`.

Para repetir sem contagem, tecle `T`.

Na tela de chegada, **Devolver ao monitor** atravessa no sentido inverso.
Para repetir sem passar pelo painel: `T` em qualquer uma das janelas.

| tecla | ação |
|---|---|
| `T` / `Espaço` | atravessar |
| `C` | calibração |
| `Esc` | fecha a calibração (ou o **×** no canto do painel) |
| `D` | painel de diagnóstico (latência, buffer, faixa do mundo) |
| `F` | tela cheia |
| `R` | reiniciar as duas telas |

O mouse guia o dragão em modo livre — **de qualquer uma das duas telas**.
A janela sem o domínio manda a posição do ponteiro pelo canal.

---

## Calibração

Tecle `C` **nas duas janelas ao mesmo tempo**. Aparecem réguas no mundo virtual:

- **linhas horizontais** — precisam formar uma linha contínua atravessando a
  moldura física. Se estiverem desalinhadas, ajuste `offsetY`.
- **traços de 100 vpx** — precisam ter o mesmo tamanho **físico** (régua na
  tela, se quiser) nas duas. Se não tiverem, ajuste a escala.
- **linha branca vertical** — a costura, `x = 0`.

| controle | teclado | efeito |
|---|---|---|
| altura desta tela | `↑` `↓` (`Shift` = passo grosso) | sobe/desce este recorte no mundo |
| escala desta tela | `+` `-` | corrige diferença de densidade |
| vão entre as telas | `←` `→` | espaço morto da moldura física |

A calibração é salva em `localStorage` e propagada para a outra janela na hora.

### Auto-calibração

O botão **Calibrar automaticamente** no painel lê a geometria real que cada
janela reporta (`screen.availLeft/availTop`, que dizem onde cada monitor está
no desktop virtual do Windows) e calcula sozinho:

- `seamGap` — o vão entre a borda direita da tela da esquerda e a borda
  esquerda da tela da direita;
- `offsetY` — o desalinhamento vertical entre os centros dos dois monitores.

Se as duas janelas reportarem o mesmo monitor, ele avisa em vez de gravar uma
calibração errada.

---

## Diferença de resolução

Esse é o problema real: 1920×1080 no monitor e 1366×768 no notebook. O modo é
`scaleMode` no `DISPLAY_CONFIG`:

| modo | comportamento |
|---|---|
| **`height`** *(padrão)* | `escala = altura / 900`. O dragão ocupa a **mesma fração da altura** em qualquer tela. Num monitor 900px a escala é 1.0; num notebook 768px é 0.853 — o notebook mostra 1601 vpx de mundo em 1366 px de tela. |
| `auto` | deriva de `devicePixelRatio`. Use quando as telas têm densidades muito diferentes. |
| `manual` | ignora a automática e usa só os valores da calibração. |

Como a escala é por tela e o mundo é comum, a velocidade em vpx/s é a mesma nas
duas — o dragão não "acelera" nem "freia" ao cruzar. A calibração manual da
escala existe para o ajuste fino quando as telas têm tamanhos físicos diferentes
com a mesma resolução.

---

## O protocolo

| mensagem | quem manda | quando |
|---|---|---|
| `HELLO` / `PRESENCE` | todos | pareamento e heartbeat (900 ms) com a geometria |
| `SUMMON` | a tela clicada | clique: "vem até este ponto do mundo" |
| `LAUNCH_REQUEST` | o painel | botão único — só quem está com o dragão obedece |
| `SEQUENCE_START` | o dono | clicou em ENTRAR |
| `DRAGON_SYNC` | o dono | 60×/s — corpo inteiro + partículas novas + anéis |
| `DRAGON_EXIT` | quem envia | a cabeça cruzou a borda física |
| `DRAGON_ENTER` | quem recebe | confirmação de recepção |
| `DRAGON_HANDOFF` | quem envia | a cauda terminou de passar: troca de domínio |
| `POINTER` | a janela sem domínio | mouse guiando o dragão da outra tela |
| `CALIBRATION` / `CONFIG` | qualquer | ajustes propagados na hora |
| `RESET` | qualquer | recomeça as duas telas |

`DRAGON_EXIT` carrega o que você pediu, **e mais**:

```js
{
    type: "DRAGON_EXIT",
    x: -5,                  // posição da cabeça na costura
    y: -31,
    velocityX: -1050,       // vpx/s
    velocityY: -109,
    rotation: -3.039,       // radianos
    timestamp: 1756...,     // relógio compartilhado

    // o que torna a continuidade real:
    buf: Float32Array(240), // 6 de cabeçalho + 78 vértebras × (x, y, ângulo)
    dir: -1,
    energy: 1,
    flightT: 1536,
    fromSide: "right"
}
```

Só `x/y/velocity/rotation` bastaria para posicionar uma cabeça — e daria
justamente o efeito de recriação. Mandando o corpo inteiro, a tela receptora
desenha a **mesma criatura**, com a mesma ondulação, a mesma pose de asa e o
mesmo estado de cauda.

### Transporte

`BroadcastChannel` é o principal. `postMessage` funciona em paralelo
(o painel relaya entre as duas janelas filhas). `localStorage` entra sozinho
se `BroadcastChannel` não existir. Mensagens duplicadas são descartadas por
`(origem, sequência)`.

Custo: 240 floats por frame ≈ 1 KB, ~58 KB/s. Nada.

### Quando avisar a outra tela

```js
exitPolicy: "head"   // ao a cabeça cruzar a borda  (padrão)
exitPolicy: "full"   // só depois que o corpo inteiro sair
```

`"head"` é o que gera continuidade física. `"full"` existe porque foi pedido
no enunciado — com ele há um vão em que o dragão não está em tela nenhuma.

---

## Efeitos

**A criatura** — 78 vértebras em corrente com restrição rígida de distância,
mais uma ondulação senoidal perpendicular aplicada por cima (puramente visual,
então não acumula erro numérico). Escamas hexagonais com gradiente e pulso de
energia correndo da cauda para a cabeça, crista dorsal a cada 3 vértebras,
núcleo luminoso com pulsos internos, duas asas de membrana com ossos e dedos
batendo em fases defasadas, leme de cauda de três lâminas, crânio com mandíbula,
chifres, bigodes de energia e olhos brilhantes.

O brilho do corpo é feito com passes aditivos de polilinha em vez de
`shadowBlur` por segmento — mesma aparência, e roda a 60 fps em duas janelas
simultâneas.

**As partículas atravessam junto.** Elas vivem no mundo, não na tela, e são
geradas só pelo dono e transmitidas. A posição é analítica:

```
p(t) = p0 + v·a + (a²/2)·acc
```

Sem integração por frame, então não há deriva possível entre as duas telas:
uma faísca criada no monitor continua a trajetória exata e aparece entrando
no notebook.

**A costura** acende conforme o dragão se aproxima: brilho de borda,
filete branco na moldura, e uma distorção que redesenha a faixa junto da
borda em 26 fatias deslocadas por seno — a sensação de rasgo entre as telas.

**O anel de choque** nasce em `x = 0`, exatamente na moldura. Como está na
costura, cada tela desenha **metade dele**: juntas, formam um círculo único
que se abre atravessando a fronteira física.

---

## Verificado

Rodado com as duas janelas pareadas por BroadcastChannel, monitor 1440×900 e
notebook 1366×768 (resoluções diferentes de propósito):

- faixas do mundo se encontram exatamente em `x = 0`: `[0, 1440]` e `[-1601, 0]`
- ida: `DRAGON_EXIT` em `x = -5` com `velocityX = -1050`, handoff para o notebook
- **49 frames (768 ms) com o corpo nas duas telas ao mesmo tempo**
- a tela receptora guarda 25 desses frames, com 1 → 39 → 77 vértebras do lado dela
- 80 `DRAGON_SYNC` entregues, 78 vértebras íntegras na chegada
- pouso: desacelera de −1098 vpx/s e assenta em `x = −929` (alvo −928)
- volta: `exitDirection +1`, saída em `x = 7`, handoff para o monitor, outros 49 frames
- pixels: no meio da travessia o brilho do notebook sobe até a borda direita
  (188) e o do monitor até a borda esquerda (116) — as duas metades se encontram
- zero erros de console nas três páginas

---

## Rede de segurança

Se o corpo inteiro sair do enquadramento da tela dona e a entrega não
acontecer, o dragão fica órfão: sumiu de um lado e nunca apareceu no outro.
Depois de 0,5 s nessa situação, a tela dona força o `DRAGON_HANDOFF`
(marcado com `resgate: true`) levando junto o destino.

Isso cobre qualquer causa — calibração ruim, mensagem perdida, um modo de
movimento novo que alguém esqueça de incluir na detecção de travessia.

A calibração automática também é travada: `offsetY` não passa de meia tela e
um `seamGap` maior que meia tela é tratado como leitura errada da geometria e
zerado. Sem essas travas, um `availTop` errado do Windows deslocava a faixa
vertical do mundo que a tela enxerga, e o dragão passava **inteiro** fora do
enquadramento — a tela renderizava normalmente e não aparecia nada.


## Limitações conhecidas

- **Janela minimizada ou aba em segundo plano**: o Chrome pausa
  `requestAnimationFrame`, então aquela tela congela. Em dois monitores físicos
  com as duas janelas visíveis isso não acontece. As mensagens continuam
  chegando e a tela se recupera ao voltar.
- **Window Management API**: só Chrome e Edge, e precisa de contexto seguro
  (`localhost` conta). Sem ela, o posicionamento é manual — o resto funciona igual.
- **`screen.availLeft/availTop`**: não são padrão. Se o navegador não expuser,
  a auto-calibração cai para a posição da janela e a calibração manual resolve.
