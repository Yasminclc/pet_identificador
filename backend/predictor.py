"""
Módulo de predição de raça.

Usa o modelo treinado no Google Colab (Stanford Dogs, 120 raças), exportado para
ONNX — ver notebooks/. Se os arquivos do modelo não existirem, cai para uma
predição simulada, para o sistema continuar rodando.

Opcional: modelo/modelo_cachorro.onnx (detector de cachorro, notebook v2). Quando
existe, fotos sem cachorro respondem "Não reconhecido" com motivo "nao_cachorro",
em vez de o modelo de raças chutar uma raça para um gato ou uma vaca.

Interface usada pelo resto do sistema:
    prever_com_alternativas(caminho) -> (raça, confiança, alternativas, motivo)
    prever_raca(caminho) -> (raça, confiança)
"""

import json
import os
import random

import numpy as np
from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAMINHO_MODELO = os.path.join(BASE_DIR, "modelo", "modelo_racas.onnx")
CAMINHO_CLASSES = os.path.join(BASE_DIR, "modelo", "classes.json")
CAMINHO_DETECTOR = os.path.join(BASE_DIR, "modelo", "modelo_cachorro.onnx")

# Usado só se o ONNX não informar o tamanho da entrada (notebook v1 usa 224, v2 usa 300)
TAMANHO_PADRAO = 224

CAMINHO_INFO = os.path.join(BASE_DIR, "modelo", "modelo_info.json")


def _ler_info_modelo():
    """modelo_info.json é gerado pelo notebooks/treinamento_colab.py junto com o modelo."""
    try:
        with open(CAMINHO_INFO, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except FileNotFoundError:
        return {}


INFO_MODELO = _ler_info_modelo()

# Abaixo deste percentual, a resposta é "Não reconhecido" em vez de chutar uma raça.
# Vem do modelo_info.json (limiar sugerido pelo treino, o primeiro com >= 90% de acerto
# nas fotos de teste). Sem o arquivo, vale o do modelo v1 (MobileNetV2, 120 raças):
#   50% -> 92% das fotos passam, 85,7% de acerto entre elas
#   60% -> 86% das fotos passam, 88,4% de acerto
#   65% -> 82% das fotos passam, 90,0% de acerto   <- escolhido: prioriza respostas certas
#   70% -> 78% das fotos passam, 91,3% de acerto
LIMIAR_CONFIANCA = float(INFO_MODELO.get("limiar_sugerido") or 65.0)
RACA_NAO_RECONHECIDA = "Não reconhecido"

# Probabilidade mínima de "tem cachorro na foto" (detector). Baixa de propósito: só
# bloqueia fotos em que o detector quase não vê cachorro. Ver passo 18 do notebook v2.
LIMIAR_CACHORRO = 0.30

# Motivos de "Não reconhecido", devolvidos ao app para mostrar a mensagem certa
MOTIVO_BAIXA_CONFIANCA = "baixa_confianca"
MOTIVO_NAO_CACHORRO = "nao_cachorro"

# Usadas apenas na predição simulada
RACAS_SIMULADAS = ["Labrador", "Golden Retriever", "Beagle", "Pug", "Chihuahua"]


def _tamanho_entrada(sessao):
    """Lado da imagem esperado pelo ONNX (formato [lote, lado, lado, 3])."""
    lado = sessao.get_inputs()[0].shape[1]
    return lado if isinstance(lado, int) else TAMANHO_PADRAO


def _carregar_modelo():
    """Carrega o modelo e as classes uma única vez, quando a API inicia."""
    if not os.path.exists(CAMINHO_MODELO):
        print(f"[predictor] Modelo não encontrado em {CAMINHO_MODELO} — usando predição SIMULADA.")
        return None, None

    import onnxruntime as ort

    sessao = ort.InferenceSession(CAMINHO_MODELO, providers=["CPUExecutionProvider"])
    with open(CAMINHO_CLASSES, "r", encoding="utf-8") as arquivo:
        classes = json.load(arquivo)

    lado = _tamanho_entrada(sessao)
    print(f"[predictor] Modelo carregado: {len(classes)} classes, entrada {lado}x{lado}")
    return sessao, classes


def _carregar_detector():
    """Detector de cachorro: opcional, só é usado se o arquivo existir."""
    if not os.path.exists(CAMINHO_DETECTOR):
        return None

    import onnxruntime as ort

    print("[predictor] Detector de cachorro carregado")
    return ort.InferenceSession(CAMINHO_DETECTOR, providers=["CPUExecutionProvider"])


_sessao, CLASSES = _carregar_modelo()
_detector = _carregar_detector() if _sessao is not None else None
MODO = "onnx" if _sessao is not None else "simulado"
# Quantas raças o sistema reconhece (o app mostra esse número ao usuário)
TOTAL_RACAS = len(CLASSES) if CLASSES else len(RACAS_SIMULADAS)


def _abrir(caminho_imagem):
    """Abre a foto em RGB, já corrigindo fotos de celular "deitadas" (EXIF)."""
    with Image.open(caminho_imagem) as imagem:
        return ImageOps.exif_transpose(imagem).convert("RGB")


def _preprocessar(imagem, lado):
    """lado x lado, float32 de 0 a 255, formato [1, lado, lado, 3] (igual ao treino)."""
    imagem = imagem.resize((lado, lado), Image.Resampling.BILINEAR)
    return np.asarray(imagem, dtype=np.float32)[np.newaxis, ...]


def _rodar(sessao, imagem):
    entrada = _preprocessar(imagem, _tamanho_entrada(sessao))
    return sessao.run(None, {sessao.get_inputs()[0].name: entrada})[0][0]


def prever_com_alternativas(caminho_imagem: str, quantidade: int = 3):
    """
    Prediz a raça e devolve também as raças mais prováveis.

    Retorno:
        tuple(str, float, list, str | None): raça predita (ou "Não reconhecido"),
        confiança de 0 a 100, as `quantidade` raças mais prováveis como
        [{"raca", "confianca"}] (mesmo abaixo do limiar; o app mostra como "raças
        semelhantes") e o motivo do "Não reconhecido" (None quando reconheceu).
    """
    if _sessao is None:
        sorteio = random.sample(RACAS_SIMULADAS, quantidade)
        confiancas = sorted((round(random.uniform(1.0, 30.0), 2) for _ in sorteio), reverse=True)
        confiancas[0] = round(random.uniform(60.0, 98.0), 2)
        alternativas = [{"raca": r, "confianca": c} for r, c in zip(sorteio, confiancas)]
        return sorteio[0], confiancas[0], alternativas, None

    imagem = _abrir(caminho_imagem)
    probabilidades = _rodar(_sessao, imagem)

    ordem = np.argsort(probabilidades)[::-1][:quantidade]
    alternativas = [
        {"raca": CLASSES[int(i)], "confianca": round(float(probabilidades[i]) * 100, 2)}
        for i in ordem
    ]
    confianca = alternativas[0]["confianca"]

    # Sem cachorro na foto: não mostra raças, que seriam só um chute
    if _detector is not None and float(_rodar(_detector, imagem)[0]) < LIMIAR_CACHORRO:
        return RACA_NAO_RECONHECIDA, confianca, [], MOTIVO_NAO_CACHORRO

    if confianca < LIMIAR_CONFIANCA:
        return RACA_NAO_RECONHECIDA, confianca, alternativas, MOTIVO_BAIXA_CONFIANCA
    return alternativas[0]["raca"], confianca, alternativas, None


def prever_raca(caminho_imagem: str):
    """
    Prediz a raça do cachorro na imagem.

    Retorno:
        tuple(str, float): raça predita (ou "Não reconhecido") e confiança de 0 a 100.
    """
    raca, confianca, _, _ = prever_com_alternativas(caminho_imagem)
    return raca, confianca
