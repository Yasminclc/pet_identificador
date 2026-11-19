# 02 — Baixar o modelo treinado e implantar no projeto

Este guia parte do ponto em que o [guia 01](01-treinamento-modelo.md) terminou:
o modelo está treinado e salvo no Google Drive. Aqui você vai:

1. baixar os arquivos do modelo;
2. colocá-los na pasta certa do projeto;
3. trocar a predição simulada do `predictor.py` pela predição real;
4. testar o modelo sozinho e depois pela API.

O resto do sistema (rotas, banco, app) **não muda**: `prever_raca(caminho)`
continua devolvendo `(raça, confiança)`, exatamente como na versão simulada.

---

## Onde cada coisa fica

O modelo fica numa pasta `modelo/` **ao lado do `predictor.py`**:

```
backend/                      <- depois da reorganização (ver guia 03)
├── app.py
├── predictor.py              <- você vai substituir este arquivo
├── requirements.txt          <- e adicionar 3 dependências aqui
└── modelo/
    ├── modelo_racas.onnx     <- baixado do Drive
    └── classes.json          <- baixado do Drive
```

> Se você fizer este guia **antes** da reorganização do guia 03, use
> `modelo/` na raiz do repositório, ao lado do `predictor.py` atual. O código
> abaixo procura a pasta a partir do próprio `predictor.py`, então funciona
> nos dois lugares. Quando o `predictor.py` for movido para `backend/`, a
> pasta `modelo/` vai junto.

---

## Passo 1 — Baixar os arquivos

Opção A, **pelo Google Drive** (recomendado, é onde os arquivos ficam
guardados): abra `drive.google.com → Meu Drive → pets_identificator` e baixe:

- `modelo_racas.onnx`
- `classes.json`

Opção B: se você rodou o Passo 16 do guia 01, os dois arquivos já foram
baixados pelo navegador para a sua pasta de Downloads.

Não precisa baixar o `modelo_racas.keras`. Ele só serve para retreinar ou
reexportar, e pode ficar no Drive.

## Passo 2 — Colocar os arquivos no projeto

```powershell
New-Item -ItemType Directory -Force backend\modelo
Move-Item "$env:USERPROFILE\Downloads\modelo_racas.onnx" backend\modelo\
Move-Item "$env:USERPROFILE\Downloads\classes.json" backend\modelo\
```

Abra o `classes.json` e confira se ele tem as 5 raças, em ordem alfabética:

```json
[
  "Beagle",
  "Chihuahua",
  "Golden Retriever",
  "Labrador",
  "Pug"
]
```

**Não edite nem reordene esse arquivo.** A posição de cada nome é o número
que o modelo devolve. Trocar a ordem faz o sistema mostrar a raça errada sem
dar nenhum erro.

## Passo 3 — Instalar as dependências

Adicione ao `requirements.txt`:

```
onnxruntime>=1.18
numpy
Pillow
```

E instale (com o ambiente virtual ativado, se usar um):

```powershell
pip install -r requirements.txt
```

O que cada uma faz:

- **`onnxruntime`**: executa o modelo `.onnx`, só na CPU, sem precisar de GPU.
- **`numpy`**: monta o array de números que o modelo recebe.
- **`Pillow`**: abre a imagem, corrige a rotação da foto do celular e
  redimensiona para 224×224.

## Passo 4 — Substituir o `predictor.py`

O código abaixo:

- carrega o modelo **uma vez**, quando a API inicia, e não a cada foto;
- aplica **exatamente** o mesmo pré-processamento do treino (Passo 12 do guia 01);
- devolve **"Não reconhecido"** quando a confiança fica abaixo do limiar;
- **volta para a predição simulada** se a pasta `modelo/` não existir. Assim
  dá para desenvolver o app antes de o modelo ficar pronto, e o projeto não
  quebra num clone novo.

```python
"""
Módulo de predição de raça.

Usa o modelo treinado no Google Colab (MobileNetV2 + Stanford Dogs), exportado
para ONNX — ver docs/01-treinamento-modelo.md. Se os arquivos do modelo não
existirem, cai para uma predição simulada, para o sistema continuar rodando.

Interface usada pelo resto do sistema: prever_raca(caminho) -> (raça, confiança).
"""

import json
import os
import random

import numpy as np
from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAMINHO_MODELO = os.path.join(BASE_DIR, "modelo", "modelo_racas.onnx")
CAMINHO_CLASSES = os.path.join(BASE_DIR, "modelo", "classes.json")

# Precisa ser igual ao usado no treino (IMG no notebook)
TAMANHO_IMAGEM = 224

# Abaixo deste percentual, a resposta é "Não reconhecido" em vez de chutar uma raça
LIMIAR_CONFIANCA = 60.0
RACA_NAO_RECONHECIDA = "Não reconhecido"

# Usadas apenas na predição simulada
RACAS_SIMULADAS = ["Labrador", "Golden Retriever", "Beagle", "Pug", "Chihuahua"]


def _carregar_modelo():
    """Carrega o modelo e as classes uma única vez, quando a API inicia."""
    if not os.path.exists(CAMINHO_MODELO):
        print(f"[predictor] Modelo não encontrado em {CAMINHO_MODELO} — usando predição SIMULADA.")
        return None, None

    import onnxruntime as ort

    sessao = ort.InferenceSession(CAMINHO_MODELO, providers=["CPUExecutionProvider"])
    with open(CAMINHO_CLASSES, "r", encoding="utf-8") as arquivo:
        classes = json.load(arquivo)

    print(f"[predictor] Modelo carregado: {len(classes)} classes -> {classes}")
    return sessao, classes


_sessao, CLASSES = _carregar_modelo()
MODO = "onnx" if _sessao is not None else "simulado"


def _preprocessar(caminho_imagem):
    """RGB, 224x224, float32 de 0 a 255, formato [1, 224, 224, 3] (igual ao treino)."""
    with Image.open(caminho_imagem) as imagem:
        imagem = ImageOps.exif_transpose(imagem)  # corrige fotos de celular "deitadas"
        imagem = imagem.convert("RGB")
        imagem = imagem.resize((TAMANHO_IMAGEM, TAMANHO_IMAGEM), Image.Resampling.BILINEAR)
        return np.asarray(imagem, dtype=np.float32)[np.newaxis, ...]


def prever_raca(caminho_imagem: str):
    """
    Prediz a raça do cachorro na imagem.

    Retorno:
        tuple(str, float): raça predita (ou "Não reconhecido") e confiança de 0 a 100.
    """
    if _sessao is None:
        return random.choice(RACAS_SIMULADAS), round(random.uniform(60.0, 98.0), 2)

    entrada = _preprocessar(caminho_imagem)
    nome_entrada = _sessao.get_inputs()[0].name
    probabilidades = _sessao.run(None, {nome_entrada: entrada})[0][0]

    indice = int(np.argmax(probabilidades))
    confianca = round(float(probabilidades[indice]) * 100, 2)

    if confianca < LIMIAR_CONFIANCA:
        return RACA_NAO_RECONHECIDA, confianca
    return CLASSES[indice], confianca
```

### Sobre o limiar de confiança

O modelo foi treinado com 5 raças e **sempre** escolhe uma delas, mesmo para a
foto de um gato. O limiar transforma respostas inseguras em "Não reconhecido".

- **60%** é um ponto de partida. Ajuste com fotos reais: se fotos certas
  aparecem como "Não reconhecido", baixe o limiar; se gatos e outras raças
  passam como uma das 5, suba.
- O limiar **reduz** o problema, mas não resolve tudo: o modelo às vezes está
  muito confiante e errado. A solução de verdade é a classe "Outro" (seção
  final do guia 01).

## Passo 5 — Testar o modelo sozinho (sem a API)

Na pasta onde está o `predictor.py`:

```powershell
python -c "from predictor import prever_raca, MODO; print(MODO); print(prever_raca(r'C:\caminho\para\um\cachorro.jpg'))"
```

Saída esperada:

```
[predictor] Modelo carregado: 5 classes -> ['Beagle', 'Chihuahua', 'Golden Retriever', 'Labrador', 'Pug']
onnx
('Beagle', 97.31)
```

Se aparecer `simulado`, a pasta `modelo/` não está ao lado do `predictor.py`.
Confira o caminho impresso na mensagem.

Teste com pelo menos:

- uma foto de cada raça, tirada da internet ou de um cachorro de verdade;
- uma foto de celular **na vertical**, para testar a correção de rotação;
- uma foto que não seja de nenhuma das 5 raças, para testar o limiar.

## Passo 6 — Testar pela API

Com a API rodando (`python app.py`), em outro terminal:

```powershell
curl.exe -X POST -F "imagem=@C:\caminho\para\um\cachorro.jpg" -H "X-Device-Id: teste-local" http://127.0.0.1:5000/api/prever
```

> Antes da reorganização do guia 03, a rota ainda é `/prever` e o header
> `X-Device-Id` é ignorado.

O tempo da **primeira** requisição inclui o carregamento do modelo, que
acontece quando a API inicia (~1–3 s). As seguintes levam ~50–300 ms.

## Passo 7 — Versionar no Git

O `.onnx` (~9 MB) e o `classes.json` **devem ser versionados**, porque sem
eles quem clonar o repositório só tem a predição simulada. O tamanho está bem
abaixo do limite de 100 MB por arquivo do GitHub, então não precisa de Git LFS.

```powershell
git add backend/modelo/modelo_racas.onnx backend/modelo/classes.json backend/predictor.py backend/requirements.txt
git commit -m "Integra modelo ONNX treinado no Stanford Dogs"
```

Também vale versionar o notebook do Colab em `notebooks/treinamento.ipynb` e
as imagens `grafico_treino.png` e `matriz_confusao.png` em `docs/img/`, para
usar no relatório e no README.

---

## Variação: usar o `.keras` com TensorFlow (se a exportação ONNX falhar)

Só use esta variação se o Passo 14 do guia 01 não funcionou. O resultado é o
mesmo, mas a API passa a usar ~500 MB a 1 GB de RAM em vez de ~100 MB.

1. Baixe `modelo_racas.keras` do Drive para `backend/modelo/`.
2. No `requirements.txt`, troque `onnxruntime>=1.18` por `tensorflow-cpu`.
   Se o pip não encontrar um pacote compatível com a sua versão do Python,
   use `tensorflow`.
3. No `predictor.py`, troque três trechos:

```python
CAMINHO_MODELO = os.path.join(BASE_DIR, "modelo", "modelo_racas.keras")

# dentro de _carregar_modelo(), no lugar das linhas do onnxruntime:
    import keras
    sessao = keras.models.load_model(CAMINHO_MODELO)

# dentro de prever_raca(), no lugar das duas linhas do _sessao.run:
    probabilidades = _sessao.predict(entrada, verbose=0)[0]
```

E mude `MODO = "onnx"` para `"keras"`.

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `MODO` aparece como `simulado` | Arquivo fora do lugar | O `.onnx` precisa estar em `modelo/`, na mesma pasta do `predictor.py` |
| `FileNotFoundError: classes.json` | Só o `.onnx` foi copiado | Baixe o `classes.json` do Drive para a mesma pasta |
| `DLL load failed` ao importar `onnxruntime` | Falta o Visual C++ Redistributable no Windows | Instale o "Microsoft Visual C++ Redistributable x64" mais recente |
| `INVALID_ARGUMENT: ... Expected: 3` ou erro de *shape* | Imagem PNG com transparência ou em tons de cinza | Confira se o `.convert("RGB")` está no `_preprocessar` |
| Raças trocadas (todo Beagle vira Chihuahua etc.) | `classes.json` editado ou de outro treino | Baixe de novo o `classes.json` gerado **no mesmo treino** do `.onnx` |
| Tudo vira "Não reconhecido" | Limiar alto ou pré-processamento errado | Rode o Passo 5 e veja a confiança. Se o valor for baixo até para fotos claras, compare o `_preprocessar` com o Passo 12 do guia 01 |
| Foto de celular dá resultado ruim e a mesma foto girada dá certo | Rotação EXIF ignorada | Confira o `ImageOps.exif_transpose` |
