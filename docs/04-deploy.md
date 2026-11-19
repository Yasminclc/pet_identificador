# 04 — Deploy do site e da API no servidor (pets.mirtilo.dev.br)

Servidor: Ubuntu 22.04 (systemd 249) com nginx, na Vultr. Os comandos abaixo
são feitos como **root** pelo terminal web da Vultr (ou SSH).

## Como funciona no servidor

O mesmo domínio serve o **site** (versão web do app) e a **API**:

| Endereço | Quem responde |
|---|---|
| `https://pets.mirtilo.dev.br/` (e `/historico`, `/sobre`) | Site: arquivos da pasta `web/` do repositório |
| `https://pets.mirtilo.dev.br/api/...` | API (ligada sob demanda) |
| `https://pets.mirtilo.dev.br/static/uploads/...` | Fotos do histórico (direto do disco) |

```
Site / APK ──HTTPS──► nginx :443 ─┬─ /            → web/ (arquivos estáticos, sempre disponível)
                                  ├─ /static/uploads/ → fotos (direto do disco)
                                  └─ /api/  → 127.0.0.1:5101  (porta do systemd, sem processo ocupando RAM)
                                                  │ primeira conexão
                                                  ▼
                                           pets-proxy.service ──► pets-api.service (gunicorn :5102 + modelo)
                                                  │ 15 min sem nenhuma conexão
                                                  ▼
                                           os dois param → RAM liberada
```

O site não precisa de Node.js no servidor: ele é gerado no PC
(`npm run build:web`) e a pasta `web/` vai junto no `git pull`.

- **Primeira requisição depois de um tempo parado:** leva alguns segundos
  (a API sobe e carrega o modelo). As seguintes são rápidas.
- **Limites:** a API usa no máximo 400 MB de RAM e 50% de um núcleo
  (`MemoryMax`/`CPUQuota`). Se passar disso, só ela é afetada, e não os outros
  projetos do servidor.
- **Dados:** `backend/database/banco.db` e `backend/static/uploads/` ficam no
  servidor e não são versionados.

Arquivos envolvidos (pasta [`deploy/`](../deploy/)):

| Arquivo | Vai para | Função |
|---|---|---|
| `pets-proxy.socket` | `/etc/systemd/system/` | Porta 5101 sempre aberta pelo systemd |
| `pets-proxy.service` | `/etc/systemd/system/` | Repassa para a API e desliga após 15 min ocioso |
| `pets-api.service` | `/etc/systemd/system/` | gunicorn com a API, limites de RAM e CPU |
| `nginx-pets.conf` | `/etc/nginx/sites-available/pets_identificator` | Domínio; o certbot acrescenta o HTTPS aqui (criado uma vez só) |
| `nginx-pets-regras.conf` | `/etc/nginx/snippets/pets_identificator.conf` | Site, proxy da API, fotos e limite de upload de 5 MB (413 em JSON); atualizado a cada execução |
| `instalar.sh` | — | Faz tudo acima, roda os testes e emite o HTTPS |

## Primeira instalação

1. O DNS de `pets.mirtilo.dev.br` precisa apontar para o servidor (registro A
   para `108.61.219.169`, já configurado).
2. No servidor:

```bash
cd /var/www
git clone git@github.com:Mirtilo122/pets_identificator.git
cd pets_identificator
bash deploy/instalar.sh
```

O script:

1. instala `python3-venv` e `curl` (e o `certbot`, se ainda não houver);
2. confere se as portas 5101 e 5102 estão livres;
3. cria o `backend/.venv` e instala as dependências;
4. **roda os testes automáticos** com o Python do servidor;
5. ajusta as permissões das pastas do banco e das fotos para o `www-data`;
6. instala e ativa os serviços do systemd e testa a API localmente;
7. cria o site do nginx e recarrega o nginx;
8. emite o certificado HTTPS com o certbot (na primeira vez ele pode pedir um
   e-mail e o aceite dos termos);
9. testa `https://pets.mirtilo.dev.br/api/status` e o site em `https://pets.mirtilo.dev.br/`.

Se a porta 5101 ou 5102 já estiver em uso por outro projeto, o script para e
avisa. Troque `PORTA_SOCKET`/`PORTA_API` no topo do `instalar.sh` e rode de novo.

## Atualizar depois de um commit novo

**Se mudou algo no app (`Front/`)**, gere o site de novo no PC **antes** do commit,
senão o site continua com a versão antiga:

```powershell
cd Front
npm run build:web     # gera ../web/ apontando para https://pets.mirtilo.dev.br (Front/.env.production)
```

Faça commit da pasta `web/` junto com o resto. No servidor:

```bash
cd /var/www/pets_identificator
git pull
bash deploy/instalar.sh
```

**Trocou o modelo?** Coloque `modelo_racas.onnx`, `classes.json`, `modelo_info.json`
(e `modelo_cachorro.onnx`, se tiver) em `backend/modelo/`, faça commit e rode os
mesmos dois comandos. A API lê o limiar de confiança do `modelo_info.json`.

O script pode ser executado quantas vezes for preciso. Ele atualiza as regras
do nginx (snippet), mas **não** sobrescreve o site, que o certbot alterou para
incluir o HTTPS. Se encontrar um site de versão antiga, sem o snippet, ele guarda
uma cópia `.bak-<data>` e recria o site, reaplicando o certificado existente.

## Comandos úteis

| Para | Comando |
|---|---|
| Ver se a API está ligada ou desligada | `systemctl status pets-proxy.socket pets-api` |
| Acompanhar os logs da API | `journalctl -u pets-api -f` |
| Logs das últimas inicializações | `journalctl -u pets-api -n 100` |
| Forçar desligar agora (a próxima requisição religa) | `systemctl stop pets-proxy.service pets-api.service` |
| Ver o uso de RAM enquanto ligada | `systemctl status pets-api` (linha `Memory:`) |
| Testar pelo servidor | `curl http://127.0.0.1:5101/api/status` |

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `502 Bad Gateway` | API não subiu | `journalctl -u pets-api -n 50` |
| `413` em HTML ou `502` ao enviar foto grande | Site do nginx sem o snippet | `bash deploy/instalar.sh` (recria o site com o snippet) |
| Miniaturas do histórico não carregam no app | `imagem_url` com `http://` | Conferir `proxy_set_header X-Forwarded-Proto` no nginx |
| API nunca desliga | Alguma conexão continua aberta | Não ativar `keepalive` no upstream do nginx |
| Erro de permissão ao gravar o banco ou as fotos | Pastas sem dono `www-data` | Rodar `bash deploy/instalar.sh` de novo |

## Gerar o APK do app (EAS Build)

O APK é compilado na nuvem da Expo (plano gratuito), sem Android Studio. A
configuração está em [`Front/eas.json`](../Front/eas.json): o perfil `preview`
gera um **APK** e embute `EXPO_PUBLIC_API_URL=https://pets.mirtilo.dev.br`.
O `Front/.env`, com o IP do PC, só vale para o desenvolvimento no Expo Go e não
vai para o build.

No PC, dentro de `Front/`:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

Na primeira vez, o EAS pergunta:

- **criar o projeto no EAS?** Responda sim. Ele grava o `projectId` no `app.json`;
  faça commit dessa alteração.
- **gerar uma nova keystore Android?** Responda sim. A keystore fica guardada
  na conta Expo e é reutilizada nos próximos builds.

O build leva de ~10 a 30 min (fila do plano gratuito). No fim aparecem um link
e um QR code para baixar o APK. No celular, permita "instalar apps de fontes
desconhecidas" para o navegador ao abrir o arquivo.

> O APK de produção só aceita HTTPS. Por isso a API precisa estar em
> `https://pets.mirtilo.dev.br`, e não em `http://IP:5000`.

Para gerar uma versão nova depois de mudar o app: faça commit e rode o mesmo
comando `build`.

> **Se o build falhar em "Install dependencies" com `npm ci ... not in sync`:**
> o EAS instala com o npm 10 (Node 22), e o npm 11 do PC às vezes gera um
> `package-lock.json` que o npm 10 não aceita. Para corrigir, dentro de `Front/`:
> `npx npm@10 install --package-lock-only`, depois faça commit do lock e rode o
> build de novo.

## Desligar no fim do semestre

```bash
systemctl disable --now pets-proxy.socket
systemctl stop pets-proxy.service pets-api.service
rm /etc/systemd/system/pets-proxy.socket /etc/systemd/system/pets-proxy.service /etc/systemd/system/pets-api.service
systemctl daemon-reload
rm /etc/nginx/sites-enabled/pets_identificator /etc/nginx/sites-available/pets_identificator*
rm /etc/nginx/snippets/pets_identificator.conf
systemctl reload nginx
certbot delete --cert-name pets.mirtilo.dev.br
rm -rf /var/www/pets_identificator
```

Antes do último comando, faça backup de `backend/database/banco.db` e de
`backend/static/uploads/` se quiser guardar o histórico.
