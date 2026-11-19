#!/usr/bin/env bash
# Instala (ou atualiza) a API no servidor Ubuntu 22.04. Rodar como root, de dentro do repositório:
#   bash deploy/instalar.sh
# Pode ser executado de novo depois de um "git pull" para aplicar as mudanças.
set -euo pipefail

DOMINIO="pets.mirtilo.dev.br"
PORTA_SOCKET=5101   # porta "sempre aberta" do systemd; é para ela que o nginx aponta
PORTA_API=5102      # porta interna do gunicorn (só existe enquanto a API está ligada)

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO/backend"
WEB="$REPO/web"   # site (versão web do app), gerado no PC com "npm run build:web" e versionado
DEPLOY="$REPO/deploy"
SITE_NGINX="/etc/nginx/sites-available/pets_identificator"
SNIPPET_NGINX="/etc/nginx/snippets/pets_identificator.conf"

passo() { echo; echo "==> $*"; }
falhar() { echo "ERRO: $*" >&2; exit 1; }
porta_ocupada() { ss -ltn "sport = :$1" | grep -q LISTEN; }
renderizar() {
  sed -e "s|__BACKEND__|$BACKEND|g" \
      -e "s|__WEB__|$WEB|g" \
      -e "s|__PORTA_SOCKET__|$PORTA_SOCKET|g" \
      -e "s|__PORTA_API__|$PORTA_API|g" \
      -e "s|__DOMINIO__|$DOMINIO|g" "$1"
}

[[ $EUID -eq 0 ]] || falhar "rode como root: bash deploy/instalar.sh"

passo "Pacotes do sistema"
apt-get update -qq
apt-get install -y -qq python3-venv curl >/dev/null
if ! command -v certbot >/dev/null; then
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
fi

passo "Conferindo se as portas $PORTA_SOCKET e $PORTA_API estão livres"
if ! systemctl is-active -q pets-proxy.socket && porta_ocupada "$PORTA_SOCKET"; then
  falhar "a porta $PORTA_SOCKET já é usada por outro serviço. Troque PORTA_SOCKET no topo deste script."
fi
if ! systemctl is-active -q pets-api.service && porta_ocupada "$PORTA_API"; then
  falhar "a porta $PORTA_API já é usada por outro serviço. Troque PORTA_API no topo deste script."
fi

passo "Ambiente Python (backend/.venv)"
python3 -m venv "$BACKEND/.venv"
"$BACKEND/.venv/bin/pip" install -q --upgrade pip
"$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"

passo "Testes automáticos da API"
(cd "$BACKEND" && .venv/bin/python -m pytest -q -p no:cacheprovider)

passo "Permissões (a API roda como www-data e precisa gravar o banco e as fotos)"
mkdir -p "$BACKEND/database" "$BACKEND/static/uploads"
chown -R www-data:www-data "$BACKEND/database" "$BACKEND/static/uploads"

passo "Serviços do systemd (ativação sob demanda, desliga após 15 min sem uso)"
for unidade in pets-proxy.socket pets-proxy.service pets-api.service; do
  renderizar "$DEPLOY/$unidade" > "/etc/systemd/system/$unidade"
done
systemctl daemon-reload
# Para a API (se estiver ligada) para a próxima requisição já usar o código novo
systemctl stop pets-proxy.service pets-api.service 2>/dev/null || true
systemctl enable -q pets-proxy.socket
systemctl restart pets-proxy.socket

passo "Testando pela porta sob demanda (a primeira chamada liga a API, pode levar alguns segundos)"
curl -sf --max-time 90 "http://127.0.0.1:$PORTA_SOCKET/api/status" || falhar "a API não respondeu. Veja: journalctl -u pets-api -n 50"
echo

passo "Nginx"
# Regras (limite de upload, proxy, fotos): sempre atualizadas
renderizar "$DEPLOY/nginx-pets-regras.conf" > "$SNIPPET_NGINX"

# Site (domínio + HTTPS do certbot): criado uma vez só. Um site de versão antiga,
# sem o include do snippet, é guardado como .bak e recriado.
SITE_NOVO=0
if [[ -f "$SITE_NGINX" ]] && ! grep -q "snippets/pets_identificator.conf" "$SITE_NGINX"; then
  BACKUP="$SITE_NGINX.bak-$(date +%Y%m%d%H%M%S)"
  mv "$SITE_NGINX" "$BACKUP"
  echo "Site antigo (sem o snippet) guardado em $BACKUP"
fi
if [[ ! -f "$SITE_NGINX" ]]; then
  renderizar "$DEPLOY/nginx-pets.conf" > "$SITE_NGINX"
  SITE_NOVO=1
fi
ln -sf "$SITE_NGINX" /etc/nginx/sites-enabled/pets_identificator
nginx -t
systemctl reload nginx

if [[ ! -d "/etc/letsencrypt/live/$DOMINIO" ]]; then
  passo "Certificado HTTPS (certbot) — pode pedir e-mail e aceite dos termos na primeira vez"
  certbot --nginx -d "$DOMINIO" --redirect
elif [[ $SITE_NOVO -eq 1 ]]; then
  passo "Reaplicando o certificado HTTPS existente no site recriado"
  certbot --nginx -d "$DOMINIO" --redirect --reinstall --non-interactive
fi

passo "Teste final pela internet"
curl -sf --max-time 90 "https://$DOMINIO/api/status" || falhar "https://$DOMINIO não respondeu. Confira o nginx: nginx -t e journalctl -u nginx"
echo
if [[ -f "$WEB/index.html" ]]; then
  curl -sf --max-time 30 -o /dev/null "https://$DOMINIO/" && echo "Site respondendo em https://$DOMINIO/" \
    || falhar "o site não respondeu em https://$DOMINIO/. Confira: nginx -t"
else
  echo "AVISO: $WEB/index.html não existe, então o site ainda não foi publicado."
  echo "No PC: cd Front && npm run build:web, faça commit da pasta web/ e rode este script de novo."
fi
echo
echo
echo "Pronto! Site em https://$DOMINIO/  |  API em https://$DOMINIO/api/status"
echo "Logs da API:   journalctl -u pets-api -f"
echo "Situação:      systemctl status pets-proxy.socket pets-api"
