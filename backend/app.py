"""
API - Sistema de Reconhecimento de Raças de Cachorro.

Recebe a foto enviada pelo app mobile (Expo), identifica a raça com o modelo
treinado (predictor.py) e devolve o resultado em JSON.

Como rodar localmente (dentro de backend/):
    1. python -m venv .venv  e  .venv\\Scripts\\Activate.ps1
    2. pip install -r requirements.txt
    3. python app.py
    4. Testar: http://127.0.0.1:5000/api/status

Em produção roda com gunicorn atrás do nginx — ver docs/04-deploy.md.

Variáveis de ambiente (opcionais):
    PORTA          porta da API (padrão 5000)
    FLASK_DEBUG    1 liga o modo debug com recarga automática (padrão 1)
    DATABASE_PATH  caminho do banco SQLite (padrão database/banco.db)

Rotas:
    GET  /api/status     situação da API, do modelo e quantas raças ele reconhece
    POST /api/prever     multipart "imagem" + header X-Device-Id
                         ?salvar=0: só analisa (câmera ao vivo), sem guardar foto nem histórico
    GET  /api/historico  header X-Device-Id, ?limite=20

RF01: upload de imagem.
RF02: processamento e retorno da raça predita.
RF03: retorno do percentual de confiança.
RF04: histórico de consultas salvo no banco de dados (por aparelho).
RNF04: aceita apenas JPG/PNG, até 5 MB.
"""

import os
import sqlite3
import uuid
from contextlib import closing

from flask import Flask, jsonify, request, url_for
from flask_cors import CORS
from PIL import Image
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

import predictor

# --- Configuração básica ---

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(BASE_DIR, "database", "schema.sql")

EXTENSOES_PERMITIDAS = {"jpg", "jpeg", "png"}
FORMATOS_PERMITIDOS = {"JPEG", "PNG"}  # formato real do arquivo, lido pelo Pillow
TAMANHO_MAXIMO_MB = 5
LIMITE_HISTORICO_PADRAO = 20
LIMITE_HISTORICO_MAXIMO = 100

app = Flask(__name__)
# Libera chamadas do app rodando no navegador (localhost:8081 -> API), incluindo o X-Device-Id
CORS(app)
# Em produção a API fica atrás do nginx: usa os cabeçalhos X-Forwarded-* para
# gerar a imagem_url com https://pets.mirtilo.dev.br em vez de http://127.0.0.1
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config["MAX_CONTENT_LENGTH"] = TAMANHO_MAXIMO_MB * 1024 * 1024  # RNF04
app.config["DATABASE_PATH"] = os.environ.get(
    "DATABASE_PATH", os.path.join(BASE_DIR, "database", "banco.db")
)
app.config["UPLOAD_FOLDER"] = os.path.join(BASE_DIR, "static", "uploads")
app.json.ensure_ascii = False  # "Não reconhecido" em vez de "Não reconhecido"


# --- Banco de dados (RF04) ---

def conectar_banco():
    conexao = sqlite3.connect(app.config["DATABASE_PATH"])
    conexao.row_factory = sqlite3.Row
    conexao.execute("PRAGMA foreign_keys = ON")
    return conexao


def inicializar_banco():
    """Cria as tabelas (se ainda não existirem) e a pasta de uploads."""
    os.makedirs(os.path.dirname(app.config["DATABASE_PATH"]), exist_ok=True)
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    with closing(conectar_banco()) as conexao:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as arquivo_schema:
            conexao.executescript(arquivo_schema.read())
        conexao.commit()


def salvar_predicao(device_id, nome_arquivo, raca_predita, confianca):
    """Grava a consulta e devolve o id dela. Raça não reconhecida fica com raca_id NULL."""
    with closing(conectar_banco()) as conexao:
        raca_id = None
        if raca_predita != predictor.RACA_NAO_RECONHECIDA:
            # Garante que a raça exista na tabela, mesmo que o modelo ganhe classes novas
            conexao.execute("INSERT OR IGNORE INTO racas (nome) VALUES (?)", (raca_predita,))
            raca_id = conexao.execute(
                "SELECT id FROM racas WHERE nome = ?", (raca_predita,)
            ).fetchone()["id"]

        cursor = conexao.execute(
            "INSERT INTO predicoes (device_id, nome_arquivo, raca_id, confianca) "
            "VALUES (?, ?, ?, ?)",
            (device_id, nome_arquivo, raca_id, confianca),
        )
        conexao.commit()
        return cursor.lastrowid


CONSULTA_PREDICOES = (
    "SELECT p.id, p.nome_arquivo, r.nome AS raca, p.confianca, p.data_hora "
    "FROM predicoes p LEFT JOIN racas r ON r.id = p.raca_id "
)


def buscar_predicao(predicao_id):
    with closing(conectar_banco()) as conexao:
        linha = conexao.execute(
            CONSULTA_PREDICOES + "WHERE p.id = ?", (predicao_id,)
        ).fetchone()
    return formatar_predicao(linha)


def buscar_historico(device_id, limite):
    with closing(conectar_banco()) as conexao:
        linhas = conexao.execute(
            CONSULTA_PREDICOES + "WHERE p.device_id = ? ORDER BY p.id DESC LIMIT ?",
            (device_id, limite),
        ).fetchall()
    return [formatar_predicao(linha) for linha in linhas]


def formatar_predicao(linha):
    """Converte uma linha do banco no JSON devolvido ao app."""
    return {
        "id": linha["id"],
        "raca": linha["raca"] or predictor.RACA_NAO_RECONHECIDA,
        "confianca": linha["confianca"],
        "reconhecido": linha["raca"] is not None,
        # URL completa: o app não sabe em qual endereço a API está
        "imagem_url": url_for(
            "static", filename=f"uploads/{linha['nome_arquivo']}", _external=True
        ),
        "data_hora": linha["data_hora"],
    }


# --- Validações ---

def obter_device_id():
    """Lê o header X-Device-Id (UUID gerado pelo app). Devolve None se ausente ou inválido."""
    try:
        return str(uuid.UUID(request.headers.get("X-Device-Id", "")))
    except ValueError:
        return None


def extensao_do_arquivo(nome_arquivo):
    return nome_arquivo.rsplit(".", 1)[1].lower() if "." in nome_arquivo else ""


def imagem_valida(arquivo):
    """Confere pelo conteúdo (e não só pela extensão) se o arquivo é um JPG ou PNG de verdade."""
    try:
        with Image.open(arquivo.stream) as imagem:
            imagem.verify()
            return imagem.format in FORMATOS_PERMITIDOS
    except Exception:
        return False
    finally:
        arquivo.stream.seek(0)


def resposta_erro(mensagem, status):
    return jsonify({"erro": mensagem}), status


# --- Rotas ---

@app.get("/")
@app.get("/api/status")
def status():
    return jsonify({
        "status": "ok",
        "modelo": predictor.MODO,
        "racas": predictor.TOTAL_RACAS,
        "limiar": predictor.LIMIAR_CONFIANCA,
        "detector_cachorro": predictor._detector is not None,
        # Dados do treino (rede, datasets, acerto no teste) para a tela "Sobre" do app
        "info_modelo": predictor.INFO_MODELO if predictor.MODO == "onnx" else None,
    })


@app.post("/api/prever")
def prever():
    device_id = obter_device_id()
    if device_id is None:
        return resposta_erro("Cabeçalho X-Device-Id ausente ou inválido.", 400)

    if "imagem" not in request.files:
        return resposta_erro("Nenhuma imagem foi enviada.", 400)

    arquivo = request.files["imagem"]

    if arquivo.filename == "":
        return resposta_erro("Nenhuma imagem foi selecionada.", 400)

    extensao = extensao_do_arquivo(arquivo.filename)
    if extensao not in EXTENSOES_PERMITIDAS:
        return resposta_erro("Formato inválido. Envie apenas JPG ou PNG.", 400)

    if not imagem_valida(arquivo):
        return resposta_erro("O arquivo enviado não é uma imagem JPG ou PNG válida.", 400)

    # Câmera ao vivo: o app manda vários quadros por segundo só para ver a raça.
    # Nenhum deles vai para o histórico; a foto final é enviada de novo, sem o parâmetro.
    salvar = request.args.get("salvar", "1") != "0"

    # Nome gerado pelo servidor: único e sem depender do nome enviado pelo usuário
    nome_arquivo = f"{uuid.uuid4().hex}.{extensao}"
    caminho_salvo = os.path.join(app.config["UPLOAD_FOLDER"], nome_arquivo)
    arquivo.save(caminho_salvo)

    # RF02 e RF03: raça predita e confiança (ver predictor.py)
    try:
        raca_predita, confianca, alternativas, motivo = predictor.prever_com_alternativas(
            caminho_salvo
        )
    except Exception:
        os.remove(caminho_salvo)
        raise

    if not salvar:
        os.remove(caminho_salvo)
        return jsonify({
            "raca": raca_predita,
            "confianca": confianca,
            "reconhecido": raca_predita != predictor.RACA_NAO_RECONHECIDA,
            "alternativas": alternativas,
            "motivo": motivo,
        })

    # RF04: salva o histórico no banco
    predicao_id = salvar_predicao(device_id, nome_arquivo, raca_predita, confianca)

    # Alternativas e motivo não ficam no banco: só aparecem na resposta da análise
    return jsonify({**buscar_predicao(predicao_id), "alternativas": alternativas, "motivo": motivo})


@app.get("/api/historico")
def historico():
    device_id = obter_device_id()
    if device_id is None:
        return resposta_erro("Cabeçalho X-Device-Id ausente ou inválido.", 400)

    limite = request.args.get("limite", default=LIMITE_HISTORICO_PADRAO, type=int)
    limite = max(1, min(limite, LIMITE_HISTORICO_MAXIMO))

    return jsonify(buscar_historico(device_id, limite))


# --- Erros sempre em JSON (o app mobile não sabe ler páginas HTML de erro) ---

MENSAGENS_ERRO_HTTP = {
    404: "Rota não encontrada.",
    405: "Método não permitido nesta rota.",
    413: f"Arquivo muito grande. O limite é {TAMANHO_MAXIMO_MB} MB.",
}


@app.errorhandler(HTTPException)
def erro_http(erro):
    return resposta_erro(MENSAGENS_ERRO_HTTP.get(erro.code, erro.description), erro.code)


@app.errorhandler(Exception)
def erro_interno(erro):
    app.logger.exception("Erro inesperado ao processar a requisição")
    return resposta_erro("Erro interno no servidor. Tente novamente.", 500)


# Executado ao importar o módulo, para funcionar também com "flask run" e nos testes
inicializar_banco()


if __name__ == "__main__":
    # host 0.0.0.0: aceita conexões de outros aparelhos da rede (o celular)
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORTA", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
