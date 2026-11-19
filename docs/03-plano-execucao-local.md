# 03 — Plano: rodar localmente (API com o modelo + app no Expo Go)

**Objetivo:** tirar uma foto no celular pelo **Expo Go**, enviar para a
**API Flask rodando no PC**, que identifica a raça com o **modelo treinado** e
devolve o resultado para o app, com histórico por aparelho.

**Fora do escopo deste plano:** servidor de produção, gunicorn, nginx, HTTPS,
desligamento automático (systemd) e login. Fica tudo para depois, se for
necessário.

Ambiente de desenvolvimento: Windows 10, Python 3.12, Node 22, celular com
Expo Go, PC e celular na mesma rede Wi-Fi.

---

## Arquitetura local

```
 Celular (Expo Go)                         PC (Windows)
┌──────────────────────┐   Wi-Fi    ┌─────────────────────────────────────┐
│ app mobile/          │───────────►│ Metro (npx expo start) :8081        │
│  - tira/escolhe foto │  JS bundle │   entrega o código do app           │
│  - reduz p/ 1024px   │            │                                     │
│  - POST multipart    │───────────►│ API Flask (python app.py) :5000     │
│    + X-Device-Id     │◄───────────│   predictor.py → modelo .onnx       │
│  - mostra resultado  │    JSON    │   SQLite (histórico)                │
│  - lista histórico   │            │   static/uploads (fotos)            │
└──────────────────────┘            └─────────────────────────────────────┘
```

Dois processos rodam no PC: o **Metro**, que entrega o código do app para o
Expo Go, e a **API**. O celular conversa com os dois pelo IP do PC na rede.

## Estrutura final do repositório

```
pets_identificator/
├── backend/
│   ├── app.py               -> API (só JSON)
│   ├── predictor.py         -> modelo ONNX (com fallback simulado)
│   ├── requirements.txt
│   ├── modelo/
│   │   ├── modelo_racas.onnx
│   │   └── classes.json
│   ├── database/
│   │   └── schema.sql       -> banco.db é gerado e não é versionado
│   ├── static/uploads/      -> fotos recebidas (não versionadas)
│   └── tests/
│       └── test_api.py
├── mobile/                  -> app Expo
├── notebooks/
│   └── treinamento.ipynb    -> notebook do Colab
├── docs/
│   ├── 01-treinamento-modelo.md
│   ├── 02-implantacao-modelo.md
│   ├── 03-plano-execucao-local.md
│   └── img/                 -> gráficos do treino, prints do app
├── .gitignore
└── README.md
```

## Ordem de execução

```
Fase 0  Commit inicial (A1)
Fase 1  Reorganizar pastas ──┐
Fase 2  Transformar em API ──┤
Fase 3  Integrar o modelo ◄──┼── depende do guia 01 (Colab), que pode rodar em paralelo
Fase 4  Rede: PC ↔ celular   │
Fase 5  App Expo ◄───────────┘
Fase 6  Testes e validação ponta a ponta
Fase 7  Documentação final
```

Como o `predictor.py` usa a predição simulada enquanto o modelo não existe,
as **fases 1, 2, 4 e 5 não precisam esperar o treino**. O Colab pode rodar
enquanto o app é desenvolvido.

---

## Fase 0 — Commit inicial

Registrar o estado atual (entrega A1) antes de qualquer mudança, para poder
voltar a ele.

- [ ] Commit com os arquivos atuais e com `docs/`.
- [ ] Tag `a1` nesse commit (`git tag a1`).
- [ ] Criar o repositório no GitHub e enviar (`git push -u origin main --tags`).

**Pronto quando:** `git log` mostra o commit e o GitHub tem o código da A1.

## Fase 1 — Reorganizar em `backend/`

- [ ] Mover com `git mv` (para manter o histórico): `app.py`,
  `predictor.py`, `requirements.txt`, `database/` e `static/` → `backend/`.
- [ ] Remover o front-end web: `templates/`, `static/css/` e `static/js/`.
  O app Expo substitui a página. O código antigo continua acessível na tag
  `a1`.
- [ ] Atualizar o `.gitignore`:
  ```
  backend/database/banco.db
  backend/static/uploads/*
  !backend/static/uploads/.gitkeep
  __pycache__/
  *.pyc
  .venv/
  .pytest_cache/

  mobile/node_modules/
  mobile/.expo/
  mobile/.env
  ```
- [ ] Criar um ambiente virtual em `backend/.venv` e instalar as dependências.

> Decisão: o front-end web é removido. Se o professor exigir a versão web
> também, ela pode ser mantida chamando as mesmas rotas `/api/...`, mas isso
> dobra o trabalho de manutenção.

**Pronto quando:** `cd backend; python app.py` sobe sem erro.

## Fase 2 — Transformar o Flask numa API JSON

Junta a mudança para API com as correções da avaliação da A1.

### 2.1 Rotas

| Método | Rota | Entrada | Resposta 200 |
|---|---|---|---|
| GET | `/api/status` | — | `{"status": "ok", "modelo": "onnx" \| "simulado"}` |
| POST | `/api/prever` | multipart `imagem` + header `X-Device-Id` | `{"id", "raca", "confianca", "reconhecido", "imagem_url", "data_hora"}` |
| GET | `/api/historico?limite=20` | header `X-Device-Id` | lista no mesmo formato do `/api/prever` |
| GET | `/static/uploads/<arquivo>` | — | a imagem (rota padrão do Flask) |

Todos os erros saem em JSON, no formato `{"erro": "mensagem para o usuário"}`:

| Situação | Código |
|---|---|
| Sem arquivo, extensão inválida, arquivo que não é imagem, sem `X-Device-Id` | 400 |
| Rota inexistente | 404 |
| Arquivo maior que 5 MB | 413 |
| Erro inesperado (inclui falha do modelo) | 500 |

### 2.2 Mudanças no `app.py`

- [ ] **Inicializar o banco no carregamento do módulo**, logo depois de
  criar o `app`, e não só dentro do `if __name__ == "__main__"` (bug 1 da avaliação).
- [ ] **Handlers de erro** `@app.errorhandler(400/404/413/500)` devolvendo
  JSON (bug 2).
- [ ] **Nome do arquivo:** `uuid4().hex + extensão original`, sem usar o
  nome enviado (bug 3).
- [ ] **Confirmar que é imagem de verdade** com `Image.open(...).verify()` do
  Pillow, apagando o arquivo salvo se falhar (bug 4).
- [ ] **`imagem_url` absoluta**, com `url_for("static", filename=..., _external=True)`.
  Como o celular acessa a API pelo IP do PC, a URL já sai com esse IP.
- [ ] **`X-Device-Id` obrigatório** em `/api/prever` e `/api/historico`, validado
  como UUID. Sem ele, a API responde 400.
- [ ] **Conexões com o banco fechadas sempre**, com `with closing(...)`.
- [ ] **Configuração por variável de ambiente**, com valores padrão:
  `FLASK_DEBUG` (padrão `1` em dev), `PORTA` (5000) e `DATABASE_PATH`
  (permite usar um banco temporário nos testes).
- [ ] `app.run(host="0.0.0.0", port=PORTA)`. Sem o `0.0.0.0`, o celular não
  consegue acessar a API.
- [ ] Datas em formato ISO (`2026-10-09T14:30:00`) na resposta. Quem formata
  para exibição é o app (bug 6).
- [ ] Atualizar o docstring do topo (como rodar, requisitos RF/RNF).

### 2.3 Banco de dados

Novo `schema.sql`:

- [ ] `predicoes.device_id TEXT NOT NULL`, com índice em `(device_id, id)`.
- [ ] Ligar `predicoes` a `racas`: `raca_id INTEGER REFERENCES racas(id)`,
  onde `NULL` significa "Não reconhecido". Isso resolve a tabela `racas` que
  hoje não é usada, e deixa o banco normalizado.
- [ ] Manter a `confianca` em `predicoes`.
- [ ] O histórico passa a ser um `LEFT JOIN racas`, filtrado por `device_id`.
- [ ] Como só existe banco de desenvolvimento, **não precisa de migração**:
  basta apagar o `banco.db` antigo, e ele é recriado na próxima execução.

### 2.4 Dependências

- [ ] `requirements.txt`: `Flask`, `Werkzeug`, `Pillow`, `numpy`,
  `onnxruntime>=1.18` e `pytest`.

**Pronto quando:**
```powershell
curl.exe http://127.0.0.1:5000/api/status
curl.exe -X POST -H "X-Device-Id: 3f2b..." -F "imagem=@foto.jpg" http://127.0.0.1:5000/api/prever
curl.exe -H "X-Device-Id: 3f2b..." http://127.0.0.1:5000/api/historico
```
respondem JSON, e um arquivo de 6 MB devolve **413 em JSON**.

## Fase 3 — Integrar o modelo treinado

Segue o **[guia 02](02-implantacao-modelo.md)**.

- [ ] Treinar no Colab ([guia 01](01-treinamento-modelo.md)).
- [ ] Copiar `modelo_racas.onnx` e `classes.json` para `backend/modelo/`.
- [ ] Novo `predictor.py` (com fallback simulado e limiar de confiança).
- [ ] O `app.py` usa `predictor.RACA_NAO_RECONHECIDA` para gravar `raca_id = NULL`
  e `reconhecido = false`.
- [ ] O `/api/status` mostra `"modelo": "onnx"`.
- [ ] Ajustar o `LIMIAR_CONFIANCA` com ~10 fotos reais (as 5 raças, outra
  raça e um gato).

**Pronto quando:** `/api/status` mostra `onnx` e as fotos de teste das 5 raças
são identificadas corretamente.

## Fase 4 — Rede: fazer o celular enxergar o PC

Faça esta fase **antes** do app, para separar problema de rede de problema de
código.

- [ ] Descobrir o IP do PC: `ipconfig`, linha "Endereço IPv4" do adaptador
  Wi-Fi (algo como `192.168.0.15`).
- [ ] Confirmar que a rede Wi-Fi está como **Privada**. Em PowerShell como
  administrador:
  ```powershell
  Get-NetConnectionProfile
  Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private   # se estiver Public
  ```
- [ ] Liberar as portas da API e do Metro no firewall (PowerShell como administrador):
  ```powershell
  New-NetFirewallRule -DisplayName "pets_identificator API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Private
  New-NetFirewallRule -DisplayName "Expo Metro" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private
  ```
- [ ] Com a API rodando, abrir `http://SEU_IP:5000/api/status` **no
  navegador do celular**.

**Pronto quando:** o navegador do celular mostra `{"status": "ok", ...}`.

> **Se não abrir** (Wi-Fi de faculdade ou corporativo costuma isolar os
> aparelhos):
> - Use o **hotspot do celular** e conecte o PC a ele. O IP do PC muda; rode
>   o `ipconfig` de novo.
> - Ou exponha a API com o **ngrok** (`ngrok http 5000`) e o Metro com
>   `npx expo start --tunnel`. A `API_URL` passa a ser a URL `https://...` do ngrok.

## Fase 5 — App Expo

### 5.1 Criar o projeto

```powershell
npx create-expo-app@latest mobile
cd mobile
npm run reset-project        # remove as telas de exemplo do template
npx expo install expo-image-picker expo-image-manipulator @react-native-async-storage/async-storage expo-crypto
```

- O template padrão usa **TypeScript + expo-router** (navegação por pastas),
  que encaixa direto nas duas abas do app.
- `npx expo install`, em vez de `npm install`, escolhe as versões compatíveis
  com o SDK do projeto.
- O `create-expo-app@latest` usa o SDK mais recente, que é o que o Expo Go da
  loja suporta. Se o Expo Go reclamar de SDK incompatível, **atualize o Expo
  Go no celular**.

### 5.2 Estrutura

```
mobile/
├── app/
│   ├── _layout.tsx           -> layout raiz
│   └── (tabs)/
│       ├── _layout.tsx       -> abas "Identificar" e "Histórico"
│       ├── index.tsx         -> tela Identificar
│       └── historico.tsx     -> tela Histórico
├── src/
│   ├── config.ts             -> lê EXPO_PUBLIC_API_URL
│   ├── api.ts                -> status(), prever(), historico(), com timeout e X-Device-Id
│   ├── dispositivo.ts        -> UUID do aparelho (gera uma vez e guarda no AsyncStorage)
│   └── imagem.ts             -> reduz para 1024px de largura, JPEG com qualidade 0.8
├── .env                      -> EXPO_PUBLIC_API_URL=http://192.168.0.15:5000 (não versionado)
└── .env.example              -> modelo do .env (versionado)
```

### 5.3 Tela "Identificar"

- [ ] Ao abrir o app, chamar `GET /api/status` em segundo plano. Se falhar,
  mostrar um aviso como "Servidor indisponível: confira o Wi-Fi e se a API
  está rodando".
- [ ] Botões **"Tirar foto"** (câmera) e **"Escolher da galeria"**, cada um
  pedindo a permissão correspondente.
- [ ] Depois da escolha: reduzir para 1024px em JPEG e mostrar a prévia.
  Isso evita o limite de 5 MB e converte o HEIC do iPhone.
- [ ] Botão **"Identificar raça"**:
  - estado de carregando, com o botão desabilitado;
  - `POST /api/prever` usando `FormData`, com
    `{ uri, name: "foto.jpg", type: "image/jpeg" }`;
  - **sem** definir o `Content-Type` à mão, porque o `fetch` precisa gerar o
    *boundary* do multipart;
  - timeout de 30 s com `AbortController`.
- [ ] Resultado: a foto, o nome da raça, uma barra de confiança e uma
  mensagem diferente quando `reconhecido = false`.
- [ ] Mostrar o `erro` que a API devolveu (por exemplo, "Formato inválido").
  Mensagem genérica só para falha de rede ou timeout.

### 5.4 Tela "Histórico"

- [ ] `GET /api/historico` ao abrir a aba e ao puxar para atualizar.
- [ ] `FlatList` com miniatura (`imagem_url`), raça, confiança e data
  formatada no padrão brasileiro.
- [ ] Estado vazio: "Nenhuma consulta ainda".

### 5.5 Rodar no celular

```powershell
# terminal 1
cd backend; .venv\Scripts\Activate.ps1; python app.py

# terminal 2
cd mobile; npx expo start
```

Escaneie o QR code: no Android, pelo próprio Expo Go; no iPhone, pela câmera.

> Depois de mudar o `.env`, reinicie o Metro com `npx expo start -c`. As
> variáveis `EXPO_PUBLIC_*` são lidas quando o código é empacotado.

**Pronto quando:** dá para tirar uma foto no celular, ver a raça e encontrá-la
na aba Histórico.

## Fase 6 — Testes e validação

### 6.1 Testes automáticos da API (`backend/tests/test_api.py`, com pytest)

Usam `app.test_client()` e um banco temporário (via `DATABASE_PATH`). As
imagens de teste são geradas em memória com o Pillow.

- [ ] `/api/status` responde 200.
- [ ] `/api/prever` sem arquivo → 400 em JSON.
- [ ] Extensão inválida (`.txt`) → 400.
- [ ] Arquivo `.jpg` que não é imagem → 400.
- [ ] Arquivo maior que 5 MB → 413 **em JSON**.
- [ ] Sem `X-Device-Id` → 400.
- [ ] Imagem válida → 200, com todos os campos e a confiança entre 0 e 100.
- [ ] O histórico de um aparelho **não mostra** as consultas de outro.

Rodar com `cd backend; pytest`.

### 6.2 Roteiro manual no celular

- [ ] Foto de cada uma das 5 raças, pela câmera e pela galeria.
- [ ] Foto na vertical (rotação EXIF).
- [ ] Foto de gato ou de outra raça → "Não reconhecido", ou confiança baixa.
- [ ] API desligada → mensagem de servidor indisponível, sem travar o app.
- [ ] Recusar a permissão da câmera → mensagem clara.
- [ ] Fechar e reabrir o app → o histórico continua lá (o UUID ficou salvo).

## Fase 7 — Documentação final

- [ ] Reescrever o `README.md`: visão geral, arquitetura, como rodar a API,
  como rodar o app, links para os guias 01 a 03 e resultados do modelo
  (acurácia e matriz de confusão).
- [ ] Salvar `notebooks/treinamento.ipynb`, `docs/img/grafico_treino.png` e
  `docs/img/matriz_confusao.png`.
- [ ] Gravar um vídeo curto do app funcionando e colocar o link no README.
- [ ] Tag `a2` no commit final.

---

## Riscos e pontos de atenção

| Risco | Impacto | Mitigação |
|---|---|---|
| Rede da faculdade isola os aparelhos | App não acessa a API na apresentação | Hotspot do celular ou ngrok (Fase 4); testar no local antes |
| IP do PC muda (DHCP) | App para de conectar | Conferir o `ipconfig` antes de usar, atualizar o `.env` e rodar `npx expo start -c` |
| Expo Go atualizado e SDK do projeto antigo | App não abre | `npx expo install expo@latest --fix`, ou criar o projeto no SDK atual |
| Modelo confiante e errado fora das 5 raças | Resposta errada na demonstração | Limiar de confiança; classe "Outro" (guia 01, opcional) |
| Exportação ONNX falha no Colab | Fase 3 atrasa | Fallback para `.keras` + TensorFlow (guia 02) |
| Pasta `uploads/` cresce | Disco do PC | Irrelevante em uso local; apagar manualmente quando quiser |

## Resumo das decisões

| Tema | Decisão |
|---|---|
| Front-end | Só o app Expo; o web sai, mas continua na tag `a1` |
| App | TypeScript + expo-router, com 2 abas |
| Identificação do usuário | UUID por aparelho no header `X-Device-Id` (sem login) |
| Banco | SQLite, `raca_id` com FK para `racas` (`NULL` = não reconhecido) |
| Modelo | MobileNetV2 → ONNX → `onnxruntime`, com fallback simulado |
| Fora do escopo | Produção, systemd, gunicorn e nginx |
