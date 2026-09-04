# Quadro de Investigação — Canvas colaborativo estilo Obsidian

Quadro livre em tempo real para a mesa: cards de texto, imagens coladas
direto do clipboard, setas de conexão entre cards, pan/zoom infinito —
tudo com o visual do Canvas do Obsidian.

## Como funciona

- **Frontend**: HTML/CSS/JS puro, sem build step. Cada card é um `<div>`
  posicionado livremente dentro de um plano com pan/zoom (igual ao
  Obsidian). As setas são desenhadas em SVG por cima.
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
- **Acesso**: sem login. Cada jogador abre o link do quadro, digita um
  nome (fica salvo no navegador dele) e já pode editar.

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

- Abra o link publicado — isso cria um quadro novo automaticamente
  (o endereço ganha um `?board=xxxxxx`).
- Clique em **Copiar link** na barra superior e mande esse link
  completo (com o `?board=...`) para os jogadores — é ele que garante
  que todo mundo caia no mesmo quadro.
- Quer quadros separados por sessão/arco da campanha? Basta trocar o
  valor depois de `?board=` na URL (ex. `?board=caso-do-farol`) e
  compartilhar o novo link — cada valor diferente é um quadro isolado.

## Controles

| Ação | Como fazer |
|---|---|
| Criar card | Duplo clique no quadro vazio, ou botão **+** |
| Mover card | Arrastar pela barra de cima do card |
| Redimensionar | Arrastar o cantinho inferior direito |
| Editar texto | Clicar dentro do card e digitar |
| Colar imagem | `Ctrl+V` (ou `Cmd+V`) com uma imagem copiada |
| Trocar cor | Bolinha no canto do card |
| Conectar dois cards | Arrastar a partir do ponto na lateral direita até outro card |
| Editar/remover conexão | Clicar na seta |
| Pan | Arrastar o fundo vazio |
| Zoom | `Ctrl` + scroll, ou os botões `+`/`−` no canto |
| Renomear o quadro | Clicar no título no topo |

## Possíveis próximos passos

- Mostrar cursores/presença dos outros jogadores em tempo real
- Exportar o quadro como `.canvas` (formato nativo do Obsidian)
- Anexar rolagens de dado ou fichas de personagem dentro de um card
- Histórico de versões do quadro (undo colaborativo)
