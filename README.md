# Quadro de Investigação — Canvas colaborativo estilo Obsidian

Quadro livre em tempo real para a mesa: cards de texto, imagens coladas
direto do clipboard, setas de conexão entre cards, pan/zoom infinito
(com suporte a toque/celular) — tudo com o visual do Canvas do Obsidian,
organizado em **cofres** protegidos por senha.

## Como funciona

- **Frontend**: HTML/CSS/JS puro, sem build step. Cada card é um `<div>`
  posicionado livremente dentro de um plano com pan/zoom (igual ao
  Obsidian). As setas são desenhadas em SVG por cima.
- **Cofres**: ao abrir o site sem um link direto, a pessoa cai numa
  lista de cofres já criados. Pode entrar em um (com a senha definida
  por quem criou) ou criar um novo cofre com nome e senha próprios.
  Cada cofre é um quadro isolado — cards e conexões nunca se misturam
  entre cofres diferentes. Depois de digitar a senha certa uma vez, o
  navegador lembra e não pede de novo nesse aparelho.
- **Exclusão de cofre**: na criação, além da senha de entrada, também
  se define uma **senha de exclusão** separada. Ela é a única forma de
  apagar o cofre depois (pelo ícone 🗑 na lista de cofres, ou pelo menu
  "Você: nome ▾" enquanto está dentro dele) — apaga o cofre e todos os
  cards e conexões dele, sem volta. Cofres criados antes desse recurso
  não têm senha de exclusão cadastrada e não podem ser apagados por
  essa tela.
- **Tempo real**: Firebase Firestore. Cada card e cada seta é um
  documento separado, então quando alguém move um card ou escreve algo,
  só aquele documento é sincronizado — todo mundo com o link aberto vê
  a mudança na hora.
- **Imagens**: em vez de usar o Firebase Storage (que hoje exige o
  plano pago Blaze), a imagem colada é redimensionada e comprimida no
  próprio navegador e guardada como base64 dentro do card. Isso mantém
  tudo no plano gratuito do Firebase. Funciona bem para prints,
  fotos de referência e artes — não é indicado para fotos gigantes em
  altíssima resolução.
- **Acesso**: sem login de conta. Cada jogador entra no cofre com a
  senha da mesa, digita um nome (fica salvo no navegador dele) e já
  pode editar.
- **Celular/tablet**: o quadro usa gestos de toque próprios — arrastar
  com um dedo move o quadro, pinçar com dois dedos dá zoom, e os
  controles dos cards (mover, redimensionar, conectar) ficam sempre
  visíveis em telas sem mouse, com alvos maiores pro dedo.
- **Área limitada**: o quadro tem um tamanho fixo (3600×2400 "pixels de
  mundo" por padrão), marcado por uma borda tracejada. Os cards não
  saem desse limite ao serem criados, arrastados ou redimensionados —
  isso evita o problema de anotações se perdendo num espaço infinito.
  O botão ⤢ na barra de zoom sempre reenquadra o quadro inteiro na
  tela. Se precisar de mais espaço, dá pra aumentar `WORLD_W` e
  `WORLD_H` no topo do `app.js`.
- **Localizar card**: o botão 🔍 Localizar na barra superior abre uma
  busca por texto entre os cards do cofre atual. Clicar num resultado
  leva a câmera direto até o card e pisca uma borda nele por alguns
  segundos, pra facilitar achar anotações antigas.
- **Conectar de qualquer lado**: cada card tem uma alcinha de conexão
  nos 4 lados (topo, direita, baixo, esquerda). Elas ficam ocultas até
  você clicar no card pra selecioná-lo — clicar no quadro vazio
  desseleciona. Isso vale tanto pra mouse quanto pra toque.
- **Anotação e formatação de texto**: tanto cards de texto quanto a
  legenda de um card de imagem aceitam negrito, itálico, sublinhado,
  tachado e lista — uma barrinha de formatação aparece assim que você
  clica pra escrever.
- **Menu da imagem**: cards de imagem têm um botão "⋯" com três opções:
  **Exibir imagem** (abre em tela cheia), **Salvar no dispositivo**
  (baixa o arquivo) e **Excluir imagem** (remove só a imagem, mantendo
  o card e a anotação — o card vira um card de texto normal, sem
  perder as conexões que já tinha).

> **Sobre a segurança da senha**: a senha do cofre é comparada dentro
> do navegador (hash SHA-256), sem servidor próprio por trás. Isso é
> suficiente pra impedir que curiosos batam na lista de cofres e
> entrem sem saber a senha — mas não é um cofre de banco: alguém com
> conhecimento técnico e acesso direto ao projeto Firebase poderia, em
> tese, contornar isso. Para uma mesa de RPG entre amigos, é uma
> proteção mais que suficiente.

## 1. Criar o projeto Firebase (grátis)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto.
2. No painel do projeto, clique no ícone **`</>`** (Web) para registrar um app web.
3. Copie o objeto `firebaseConfig` que aparece na tela.
4. Cole esse objeto em `firebase-config.js`, substituindo os valores de exemplo.
5. No menu lateral, vá em **Build > Firestore Database** e clique em
   **Criar banco de dados** (pode escolher "modo de produção" e a
   região mais próxima do Brasil, ex. `southamerica-east1`).
6. Ainda no Firestore, vá na aba **Regras** e substitua pelo conteúdo
   abaixo (permite leitura/escrita pública do quadro — como não há
   login, é assim que os jogadores conseguem editar juntos):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /vaults/{vaultId} {
      allow read, write: if true;
    }
    match /boards/{boardId} {
      allow read, write: if true;
      match /nodes/{nodeId} {
        allow read, write: if true;
      }
      match /edges/{edgeId} {
        allow read, write: if true;
      }
    }
  }
}
```

> Se você já tinha publicado as regras antigas (sem o bloco `vaults`),
> precisa voltar em **Firestore Database > Regras** e colar essa
> versão atualizada — senão a lista de cofres e a criação de novos
> cofres não vão funcionar.

> Isso deixa o quadro aberto para qualquer pessoa com o link — igual a
> um Google Doc "qualquer um com o link pode editar". Como o board id
> é aleatório e não listado em nenhum lugar público, na prática só
> quem você mandar o link consegue chegar até ele.

## 2. Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (pode ser privado ou público).
2. Suba estes arquivos para a raiz do repositório: `index.html`,
   `style.css`, `app.js`, `firebase-config.js`.
3. Vá em **Settings > Pages**, em "Source" selecione a branch `main` e
   a pasta `/ (root)`, salve.
4. Em alguns minutos o site estará no ar em algo como:
   `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`

## 3. Usar com a mesa

- Abra o link publicado — você cai na tela de cofres.
- Clique em **+ Criar novo cofre**, dê um nome (ex: "Caso do Farol") e
  uma senha, e confirme. Isso já te leva direto pro quadro.
- Clique em **Copiar link** na barra superior e mande esse link
  completo (com o `?board=...`) para os jogadores, junto com a senha
  que você escolheu — eles abrem o link, digitam a senha uma vez, o
  nome deles, e já entram no mesmo quadro.
- Se os jogadores abrirem o site sem o link direto, eles também
  conseguem achar o cofre pelo nome na lista da tela inicial — só
  precisam saber a senha.
- Quer um quadro separado por sessão/arco da campanha? É só criar um
  novo cofre — cada um tem seu próprio conjunto de cards e conexões.

## Controles

| Ação | Como fazer |
|---|---|
| Criar card | Duplo clique no quadro vazio, ou botão **+** |
| Mover card | Arrastar pela barra de cima do card |
| Redimensionar | Arrastar o cantinho inferior direito |
| Editar texto | Clicar dentro do card e digitar (barra de formatação aparece) |
| Colar imagem | `Ctrl+V` (ou `Cmd+V`) com uma imagem copiada |
| Trocar cor | Bolinha no canto do card |
| Opções da imagem | Botão "⋯" no card (exibir / salvar / excluir imagem) |
| Selecionar card (mostrar alças de conexão) | Clicar no card |
| Conectar dois cards | Clicar num card e arrastar de qualquer lado até outro |
| Editar/remover conexão | Clicar na seta |
| Pan | Arrastar o fundo vazio |
| Zoom | `Ctrl` + scroll, pinça no toque, ou os botões `+`/`−` |
| Ver o quadro inteiro | Botão `⤢` no canto |
| Localizar um card | Botão 🔍 Localizar na barra superior |
| Mudar de nome / trocar de cofre | Menu "Você: nome ▾" na barra superior |
| Renomear o quadro | Clicar no título no topo |

## Possíveis próximos passos

- Mostrar cursores/presença dos outros jogadores em tempo real
- Exportar o quadro como `.canvas` (formato nativo do Obsidian)
- Anexar rolagens de dado ou fichas de personagem dentro de um card
- Histórico de versões do quadro (undo colaborativo)
