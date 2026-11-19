# 05 — Rodar o projeto no seu computador e usar pelo celular

Este guia é para quem acabou de clonar o repositório e quer usar o app no
próprio celular, pelo **Expo Go**.

Há dois jeitos. Escolha um:

| | **Opção A: só o app** | **Opção B: app + API local** |
|---|---|---|
| O que roda no seu PC | Só o app (Metro/Expo) | O app e a API Flask com o modelo |
| Qual API o app usa | A de produção: `https://pets.mirtilo.dev.br` | A do seu PC: `http://SEU_IP:5000` |
| Precisa de Python | Não | Sim |
| Precisa mexer no firewall | Só se o Expo Go não abrir o app | Sim (porta 5000) |
| Bom para | Mexer na interface do app | Mexer na API, no banco ou no modelo |

Nenhuma das opções precisa de conta Expo, Google Colab nem acesso ao servidor.
O modelo treinado já está no repositório, em `backend/modelo/`.

---

## 1. O que instalar

| Programa | Versão | Para quê | Onde baixar |
|---|---|---|---|
| **Git** | qualquer recente | Clonar o repositório | git-scm.com |
| **Node.js** | **22 LTS** | Rodar o app (Expo) | nodejs.org |
| **Python** | **3.10 a 3.12** (só na Opção B) | Rodar a API | python.org |
| **Expo Go** (no celular) | a mais recente da loja | Abrir o app no celular | Play Store / App Store |
| VS Code | opcional | Editar o código | code.visualstudio.com |

Cuidados na instalação:

- **Python no Windows:** na primeira tela do instalador, marque
  **"Add python.exe to PATH"**.
- **Não use Python 3.13 ou mais novo.** A biblioteca do modelo
  (`onnxruntime`) pode não ter versão para ele. O projeto foi testado com o 3.12.
- **Expo Go:** o projeto usa o **Expo SDK 58**. Se o Expo Go reclamar de SDK
  incompatível, atualize o Expo Go pela loja.
- **PC e celular na mesma rede Wi-Fi.** Redes de faculdade costumam bloquear a
  comunicação entre aparelhos; veja os [problemas comuns](#problemas-comuns).

Para conferir as versões instaladas, abra um terminal novo:

```powershell
git --version
node --version     # v22.x
python --version   # 3.10, 3.11 ou 3.12
```

## 2. Clonar o repositório

```powershell
git clone https://github.com/Mirtilo122/pets_identificator.git
cd pets_identificator
```

> Se o repositório for privado, peça para ser adicionado como colaborador no GitHub.

---

## Opção A — Só o app, usando a API de produção

```powershell
cd Front
npm ci
```

Crie o arquivo `Front/.env` com este conteúdo:

```
EXPO_PUBLIC_API_URL=https://pets.mirtilo.dev.br
```

Inicie o app:

```powershell
npx expo start
```

Pule para o passo [6. Abrir no celular](#6-abrir-no-celular).

Bom saber:

- A API de produção **desliga sozinha** depois de 15 minutos sem uso. A
  primeira análise depois disso demora alguns segundos a mais, enquanto ela liga.
- O histórico fica salvo no servidor, separado por aparelho. Cada celular vê só
  as próprias consultas.

---

## Opção B — App + API rodando no seu PC

### 3. API (pasta `backend/`)

No **terminal 1**:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> **O comando de ativação muda conforme o terminal:**
>
> | Terminal | Comando |
> |---|---|
> | PowerShell (o padrão do VS Code e do Windows Terminal) | `.venv\Scripts\Activate.ps1` |
> | Prompt de Comando (cmd) | `.venv\Scripts\activate.bat` |
> | Git Bash | `source .venv/Scripts/activate` |
> | macOS/Linux | `source .venv/bin/activate` (e use `python3` no lugar de `python`) |
>
> Se o `Activate.ps1` **abrir no Bloco de Notas**, o terminal é o cmd: use o
> `activate.bat`. Se ele for **bloqueado** ("execução de scripts foi
> desabilitada"), rode uma vez
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` e tente de novo.
>
> Com o venv ativado, o terminal mostra `(.venv)` no início da linha.

Opcional, mas recomendado: rode os testes automáticos (devem passar 18).

```powershell
python -m pytest
```

Inicie a API:

```powershell
python app.py
```

No navegador do PC, abra **http://127.0.0.1:5000/api/status**. Deve aparecer:

```json
{"modelo": "onnx", "status": "ok"}
```

- Se aparecer `"modelo": "simulado"`, os arquivos de `backend/modelo/` não
  foram baixados. Confira se o `git clone` terminou sem erro.
- O banco (`backend/database/banco.db`) é criado sozinho na primeira execução.
  Não há nada para configurar. Cada pessoa tem o próprio banco local.
- **Windows:** na primeira vez, o Firewall do Windows pergunta se o Python
  pode acessar a rede. **Permita em "Redes privadas".**

### 4. Deixar o celular acessar a API

1. **Descubra o IP do PC na rede:** rode `ipconfig` e procure o
   "Endereço IPv4" do adaptador Wi-Fi ou Ethernet. Vai ser algo como
   `192.168.0.25`.
   - macOS: `ipconfig getifaddr en0`
   - Linux: `hostname -I`
2. **Teste pelo celular:** no navegador do celular, abra
   `http://SEU_IP:5000/api/status`. Precisa aparecer o mesmo JSON do passo 3.
3. **Se não abrir**, libere a porta no firewall do Windows. Abra o
   **PowerShell como administrador** e rode:
   ```powershell
   # A rede precisa estar como "Private" (privada)
   Get-NetConnectionProfile
   Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private   # só se estiver "Public"

   New-NetFirewallRule -DisplayName "pets_identificator API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "Expo Metro" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private
   ```
   Troque `"Wi-Fi"` pelo nome do adaptador que aparece no `Get-NetConnectionProfile`.

**Só siga para o app quando o passo 2 funcionar.** Se o navegador do celular
não alcança a API, o app também não vai alcançar.

### 5. App (pasta `Front/`)

No **terminal 2**:

```powershell
cd Front
npm ci
copy .env.example .env
```

Abra o `Front/.env` e coloque o IP do seu PC:

```
EXPO_PUBLIC_API_URL=http://192.168.0.25:5000
```

Inicie o app:

```powershell
npx expo start
```

---

## 6. Abrir no celular

O `npx expo start` mostra um **QR code** no terminal.

- **Android:** abra o **Expo Go** e toque em "Scan QR code".
- **iPhone:** aponte a **câmera** do celular para o QR code e toque no aviso
  que aparece.

O app abre com duas abas:

- **Identificar:** no topo deve aparecer **"Servidor online"**. Tire ou
  escolha uma foto e toque em "Identificar raça".
- **Histórico:** mostra as suas consultas.

Ao salvar um arquivo do app no editor, o celular atualiza sozinho.

---

## No dia a dia

**Opção A:** um terminal, `cd Front` e `npx expo start`.

**Opção B:** dois terminais:

```powershell
# terminal 1
cd backend
.venv\Scripts\Activate.ps1   # no cmd: .venv\Scripts\activate.bat
python app.py

# terminal 2
cd Front
npx expo start
```

O IP do PC pode mudar de um dia para o outro (ou ao trocar de rede). Se o app
mostrar "Servidor indisponível", confira o IP com `ipconfig`, atualize o
`Front/.env` e reinicie o Expo **limpando o cache**: `npx expo start -c`.

Depois de um `git pull`, rode `npm ci` (no `Front/`) e
`pip install -r requirements.txt` (no `backend/`, com o venv ativado) caso
alguma dependência tenha mudado.

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Expo Go diz que o SDK é incompatível | Expo Go desatualizado | Atualize o Expo Go pela loja (o projeto usa SDK 58) |
| QR code escaneado, mas o app não carrega | O celular não alcança o PC na porta 8081 | Regra de firewall da porta 8081 (passo 4) ou `npx expo start --tunnel` |
| App mostra **"Servidor indisponível"** | API desligada, IP errado no `.env` ou firewall | Confira o passo 4.2 no navegador do celular; depois de mudar o `.env`, use `npx expo start -c` |
| Mudei o `.env` e nada mudou | O Expo guardou o valor antigo em cache | `npx expo start -c` |
| Funciona em casa, mas não na faculdade | A rede isola os aparelhos | Use o **hotspot do celular** (o IP do PC muda, atualize o `.env`) ou a **Opção A** |
| `pip install` falha no `onnxruntime` | Python muito novo (3.13+) | Instale o Python 3.12 e recrie o `.venv` |
| `Activate.ps1` abre no Bloco de Notas | O terminal é o Prompt de Comando (cmd), não o PowerShell | Use `.venv\Scripts\activate.bat` |
| `Activate.ps1` bloqueado | Política de execução do PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm ci` falha | Versão do Node | Use o Node 22 LTS |
| Toda foto vira "Não reconhecido" | A raça não está no modelo, o cachorro aparece pequeno ou o limiar está alto | Confira quantas raças o modelo tem (`/api/status`, campo `racas`). Com o modelo de 120 raças, use o limiar sugerido pelo notebook |

## Onde mexer no código

| Quero mudar... | Arquivo |
|---|---|
| Telas do app | `Front/src/app/index.tsx` (Identificar) e `Front/src/app/historico.tsx` |
| Comunicação com a API | `Front/src/services/api.ts` |
| Rotas e banco da API | `backend/app.py` e `backend/database/schema.sql` |
| Uso do modelo e limiar de confiança | `backend/predictor.py` |
| Treinar o modelo de novo | [docs/01-treinamento-modelo.md](01-treinamento-modelo.md) |
