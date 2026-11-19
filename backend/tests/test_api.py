"""
Testes da API. Rodar dentro de backend/:  pytest

Cada teste usa um banco e uma pasta de uploads temporários, então o banco.db
de desenvolvimento não é tocado.
"""

import io
import uuid

import pytest
from PIL import Image

import predictor
from app import app, inicializar_banco

DEVICE_A = str(uuid.uuid4())
DEVICE_B = str(uuid.uuid4())


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setitem(app.config, "DATABASE_PATH", str(tmp_path / "teste.db"))
    monkeypatch.setitem(app.config, "UPLOAD_FOLDER", str(tmp_path / "uploads"))
    monkeypatch.setitem(app.config, "TESTING", True)
    inicializar_banco()
    return app.test_client()


@pytest.fixture
def predicao_fixa(monkeypatch):
    """Troca o modelo por uma resposta fixa, para os testes não dependerem dele."""
    def definir(raca, confianca):
        alternativas = [{"raca": "Beagle", "confianca": confianca}, {"raca": "Basset Hound", "confianca": 5.0}]
        monkeypatch.setattr(
            predictor,
            "prever_com_alternativas",
            lambda caminho: (raca, confianca, alternativas, None),
        )
    definir("Beagle", 91.5)
    return definir


def gerar_imagem(formato="JPEG", tamanho=(64, 64)):
    buffer = io.BytesIO()
    Image.new("RGB", tamanho, (200, 150, 100)).save(buffer, format=formato)
    buffer.seek(0)
    return buffer


def enviar(cliente, arquivo, nome="foto.jpg", device_id=DEVICE_A):
    headers = {"X-Device-Id": device_id} if device_id else {}
    dados = {"imagem": (arquivo, nome)} if arquivo is not None else {}
    return cliente.post(
        "/api/prever", data=dados, headers=headers, content_type="multipart/form-data"
    )


# --- Status ---

def test_status(cliente):
    resposta = cliente.get("/api/status")
    assert resposta.status_code == 200
    assert resposta.get_json()["status"] == "ok"
    assert resposta.get_json()["modelo"] in ("onnx", "simulado")
    assert resposta.get_json()["racas"] == predictor.TOTAL_RACAS
    assert resposta.get_json()["limiar"] == predictor.LIMIAR_CONFIANCA
    if predictor.MODO == "onnx":
        assert resposta.get_json()["info_modelo"] == predictor.INFO_MODELO


# --- Envio válido ---

def test_prever_imagem_valida(cliente, predicao_fixa):
    resposta = enviar(cliente, gerar_imagem())
    assert resposta.status_code == 200

    dados = resposta.get_json()
    assert dados["raca"] == "Beagle"
    assert dados["confianca"] == 91.5
    assert dados["reconhecido"] is True
    assert dados["imagem_url"].startswith("http://localhost/static/uploads/")
    assert dados["imagem_url"].endswith(".jpg")
    assert "T" in dados["data_hora"]  # formato ISO
    assert [a["raca"] for a in dados["alternativas"]] == ["Beagle", "Basset Hound"]


def test_imagem_url_atras_do_nginx(cliente, predicao_fixa):
    """Em produção o nginx repassa o domínio e o https; a URL da imagem precisa usá-los."""
    resposta = cliente.post(
        "/api/prever",
        data={"imagem": (gerar_imagem(), "foto.jpg")},
        headers={
            "X-Device-Id": DEVICE_A,
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "pets.mirtilo.dev.br",
        },
        content_type="multipart/form-data",
    )
    assert resposta.get_json()["imagem_url"].startswith(
        "https://pets.mirtilo.dev.br/static/uploads/"
    )


def test_prever_png(cliente, predicao_fixa):
    resposta = enviar(cliente, gerar_imagem("PNG"), nome="foto.png")
    assert resposta.status_code == 200


def test_prever_nao_cachorro(cliente, monkeypatch):
    monkeypatch.setattr(
        predictor,
        "prever_com_alternativas",
        lambda caminho: (predictor.RACA_NAO_RECONHECIDA, 72.0, [], predictor.MOTIVO_NAO_CACHORRO),
    )
    dados = enviar(cliente, gerar_imagem()).get_json()
    assert dados["reconhecido"] is False
    assert dados["motivo"] == "nao_cachorro"
    assert dados["alternativas"] == []


def test_prever_nao_reconhecido(cliente, predicao_fixa):
    predicao_fixa(predictor.RACA_NAO_RECONHECIDA, 41.2)
    dados = enviar(cliente, gerar_imagem()).get_json()
    assert dados["raca"] == predictor.RACA_NAO_RECONHECIDA
    assert dados["reconhecido"] is False


def test_prever_sem_salvar_nao_entra_no_historico(cliente, predicao_fixa, tmp_path):
    resposta = cliente.post(
        "/api/prever?salvar=0",
        data={"imagem": (gerar_imagem(), "quadro.jpg")},
        headers={"X-Device-Id": DEVICE_A},
        content_type="multipart/form-data",
    )
    assert resposta.status_code == 200
    dados = resposta.get_json()
    assert (dados["raca"], dados["confianca"], dados["reconhecido"]) == ("Beagle", 91.5, True)
    assert dados["alternativas"][1]["raca"] == "Basset Hound"

    historico = cliente.get("/api/historico", headers={"X-Device-Id": DEVICE_A}).get_json()
    assert historico == []
    assert list((tmp_path / "uploads").iterdir()) == []


def test_nomes_de_arquivo_unicos(cliente, predicao_fixa):
    url1 = enviar(cliente, gerar_imagem()).get_json()["imagem_url"]
    url2 = enviar(cliente, gerar_imagem()).get_json()["imagem_url"]
    assert url1 != url2


# --- Erros (sempre em JSON) ---

def test_sem_device_id(cliente):
    resposta = enviar(cliente, gerar_imagem(), device_id=None)
    assert resposta.status_code == 400
    assert "X-Device-Id" in resposta.get_json()["erro"]


def test_device_id_invalido(cliente):
    resposta = enviar(cliente, gerar_imagem(), device_id="nao-e-um-uuid")
    assert resposta.status_code == 400


def test_sem_arquivo(cliente):
    resposta = enviar(cliente, None)
    assert resposta.status_code == 400
    assert "erro" in resposta.get_json()


def test_extensao_invalida(cliente):
    resposta = enviar(cliente, io.BytesIO(b"texto qualquer"), nome="arquivo.txt")
    assert resposta.status_code == 400
    assert "Formato inválido" in resposta.get_json()["erro"]


def test_arquivo_falso_com_extensao_jpg(cliente):
    resposta = enviar(cliente, io.BytesIO(b"MZ isto nao e uma imagem"), nome="virus.jpg")
    assert resposta.status_code == 400
    assert "não é uma imagem" in resposta.get_json()["erro"]


def test_arquivo_maior_que_5mb(cliente):
    resposta = enviar(cliente, io.BytesIO(b"0" * (6 * 1024 * 1024)), nome="grande.jpg")
    assert resposta.status_code == 413
    assert "5 MB" in resposta.get_json()["erro"]


def test_rota_inexistente(cliente):
    resposta = cliente.get("/api/nao-existe")
    assert resposta.status_code == 404
    assert "erro" in resposta.get_json()


def test_erro_no_modelo_vira_500_json(cliente, monkeypatch):
    def falhar(caminho):
        raise RuntimeError("falha simulada")
    monkeypatch.setattr(predictor, "prever_com_alternativas", falhar)
    monkeypatch.setitem(app.config, "PROPAGATE_EXCEPTIONS", False)

    resposta = enviar(cliente, gerar_imagem())
    assert resposta.status_code == 500
    assert "erro" in resposta.get_json()


# --- Histórico (RF04) ---

def test_historico_separado_por_aparelho(cliente, predicao_fixa):
    enviar(cliente, gerar_imagem(), device_id=DEVICE_A)
    enviar(cliente, gerar_imagem(), device_id=DEVICE_A)
    enviar(cliente, gerar_imagem(), device_id=DEVICE_B)

    historico_a = cliente.get("/api/historico", headers={"X-Device-Id": DEVICE_A}).get_json()
    historico_b = cliente.get("/api/historico", headers={"X-Device-Id": DEVICE_B}).get_json()

    assert len(historico_a) == 2
    assert len(historico_b) == 1


def test_historico_mais_recente_primeiro_e_limite(cliente, predicao_fixa):
    for _ in range(3):
        enviar(cliente, gerar_imagem())

    historico = cliente.get(
        "/api/historico?limite=2", headers={"X-Device-Id": DEVICE_A}
    ).get_json()

    assert len(historico) == 2
    assert historico[0]["id"] > historico[1]["id"]


def test_historico_sem_device_id(cliente):
    assert cliente.get("/api/historico").status_code == 400


# --- Modelo real ---

@pytest.mark.skipif(predictor.MODO != "onnx", reason="modelo ONNX não encontrado")
def test_modelo_real_responde(cliente):
    """Imagem lisa não é cachorro: só confere que o modelo roda e devolve algo coerente."""
    dados = enviar(cliente, gerar_imagem(tamanho=(400, 300))).get_json()
    assert 0 <= dados["confianca"] <= 100
    assert dados["raca"] in predictor.CLASSES + [predictor.RACA_NAO_RECONHECIDA]
    if predictor._detector is not None:
        # Com o detector, a imagem lisa é barrada antes e não mostra raças
        assert dados["motivo"] == "nao_cachorro"
        assert dados["alternativas"] == []
    else:
        assert len(dados["alternativas"]) == 3
        assert dados["alternativas"][0]["confianca"] == dados["confianca"]


# --- Limiar vindo do modelo_info.json ---

def test_limiar_lido_do_modelo_info(tmp_path, monkeypatch):
    """O treino grava o limiar sugerido no modelo_info.json; a API usa esse valor."""
    info = tmp_path / "modelo_info.json"
    info.write_text('{"limiar_sugerido": 55, "racas": 120}', encoding="utf-8")
    monkeypatch.setattr(predictor, "CAMINHO_INFO", str(info))
    assert predictor._ler_info_modelo()["limiar_sugerido"] == 55


def test_sem_modelo_info_devolve_vazio(tmp_path, monkeypatch):
    monkeypatch.setattr(predictor, "CAMINHO_INFO", str(tmp_path / "nao_existe.json"))
    assert predictor._ler_info_modelo() == {}
