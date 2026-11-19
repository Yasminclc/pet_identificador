# 01 — Treinamento do modelo no Google Colab

Este guia treina o classificador das 5 raças do projeto (**Labrador, Golden
Retriever, Beagle, Pug e Chihuahua**) usando o **Stanford Dogs Dataset** e
*transfer learning* com a **MobileNetV2**. No final você terá três arquivos:

| Arquivo | Para que serve | Vai para o projeto? |
|---|---|---|
| `modelo_racas.onnx` | Modelo usado pela API (leve, roda com `onnxruntime`) | Sim |
| `classes.json` | Ordem exata das raças que o modelo devolve | Sim |
| `modelo_racas.keras` | Modelo original do Keras, para retreinar ou reexportar | Não (fica no Drive) |

Tempo estimado: ~20–30 min no total (download ~3 min, treino ~5–10 min na GPU T4).

> Como usar este guia: crie um notebook novo no Colab e cole cada bloco de
> código numa célula, na ordem. Depois de tudo funcionando, salve o notebook
> em `notebooks/treinamento.ipynb` no repositório (*Arquivo → Fazer download → .ipynb*).

---

## Decisões que o resto do projeto depende

Essas três coisas precisam ser **idênticas** no treino e na API. Se alguma
mudar, o modelo erra mesmo estando bem treinado:

1. **Tamanho da imagem:** 224×224, RGB, sem corte (a imagem inteira é
   redimensionada).
2. **Formato da entrada:** `float32` com valores de **0 a 255**, formato
   `[lote, 224, 224, 3]`. A normalização para -1…1 que a MobileNetV2 exige
   fica **dentro do modelo** (camada `Rescaling`), então a API não precisa
   fazer conta nenhuma além de redimensionar.
3. **Ordem das classes:** é a ordem salva em `classes.json` (alfabética, pelo
   nome das pastas). A API lê esse arquivo em vez de ter a lista fixa no código.

---

## Passo 1 — Ativar a GPU

No Colab: **Ambiente de execução → Alterar o tipo de ambiente de execução →
GPU T4 → Salvar**.

```python
import tensorflow as tf
import keras

print("TensorFlow:", tf.__version__)
print("Keras:", keras.__version__)
print("GPU:", tf.config.list_physical_devices("GPU"))
```

A última linha precisa mostrar uma GPU. Se vier `[]`, refaça a configuração acima.

## Passo 2 — Conectar o Google Drive

O Colab gratuito desconecta depois de algum tempo e **apaga tudo** que está em
`/content`. Por isso os arquivos finais vão para o Drive.

```python
import os
from google.colab import drive

drive.mount("/content/drive")

PASTA_DRIVE = "/content/drive/MyDrive/pets_identificator"
os.makedirs(PASTA_DRIVE, exist_ok=True)
print("Arquivos finais serão salvos em:", PASTA_DRIVE)
```

## Passo 3 — Baixar o Stanford Dogs Dataset

O dataset tem ~20 mil fotos de 120 raças (~750 MB). Vamos usar só 5 delas.

```python
!wget -q --show-progress http://vision.stanford.edu/aditya86/ImageNetDogs/images.tar -O /content/images.tar
!tar -xf /content/images.tar -C /content/
!ls /content/Images | head -5
!ls /content/Images | wc -l
```

O resultado deve listar pastas como `n02085620-Chihuahua` e um total de **120**.

<details>
<summary>Se o site de Stanford estiver fora do ar: baixar pelo Kaggle</summary>

```python
import kagglehub

caminho = kagglehub.dataset_download("jessicali9530/stanford-dogs-dataset")
print(caminho)
!ls "{caminho}"
```

Procure a pasta que contém as 120 subpastas de raças (normalmente
`<caminho>/images/Images`) e use esse caminho no lugar de `/content/Images`
no Passo 4.
</details>

## Passo 4 — Separar as 5 raças em treino, validação e teste

Cada raça é dividida em **70% treino / 15% validação / 15% teste**, com
semente fixa (`42`) para a divisão ser sempre a mesma.

- **Treino:** fotos que o modelo usa para aprender.
- **Validação:** fotos usadas durante o treino para saber quando parar.
- **Teste:** fotos que o modelo **nunca viu**, usadas só no final para medir
  a acurácia de verdade. É esse número que vai no relatório.

```python
import random
import shutil
from pathlib import Path

ORIGEM = Path("/content/Images")
DESTINO = Path("/content/dataset")

# Nome usado no projeto  ->  final do nome da pasta no Stanford Dogs
RACAS = {
    "Labrador": "Labrador_retriever",
    "Golden Retriever": "golden_retriever",
    "Beagle": "beagle",
    "Pug": "pug",
    "Chihuahua": "Chihuahua",
}

random.seed(42)
if DESTINO.exists():
    shutil.rmtree(DESTINO)

for nome, sufixo in RACAS.items():
    pastas = list(ORIGEM.glob(f"*-{sufixo}"))
    assert len(pastas) == 1, f"Pasta de '{nome}' não encontrada (procurei *-{sufixo})"

    imagens = sorted(pastas[0].glob("*.jpg"))
    random.shuffle(imagens)

    total = len(imagens)
    n_treino = int(total * 0.70)
    n_val = int(total * 0.15)
    partes = {
        "train": imagens[:n_treino],
        "val": imagens[n_treino:n_treino + n_val],
        "test": imagens[n_treino + n_val:],
    }

    for parte, arquivos in partes.items():
        pasta = DESTINO / parte / nome
        pasta.mkdir(parents=True, exist_ok=True)
        for arquivo in arquivos:
            shutil.copy(arquivo, pasta / arquivo.name)

    print(f"{nome:17s} total={total:3d}  treino={len(partes['train']):3d}  "
          f"val={len(partes['val']):3d}  teste={len(partes['test']):3d}")
```

Você deve ver entre ~150 e ~200 imagens por raça (~870 no total).

## Passo 5 — Carregar as imagens

```python
IMG = 224
LOTE = 32
AUTOTUNE = tf.data.AUTOTUNE

def carregar(parte, embaralhar):
    return keras.utils.image_dataset_from_directory(
        DESTINO / parte,
        image_size=(IMG, IMG),
        batch_size=LOTE,
        label_mode="int",
        shuffle=embaralhar,
        seed=42,
    )

treino_ds = carregar("train", embaralhar=True)
val_ds = carregar("val", embaralhar=False)
teste_ds = carregar("test", embaralhar=False)

CLASSES = treino_ds.class_names
print("Ordem das classes:", CLASSES)
```

A ordem impressa deve ser alfabética:
`['Beagle', 'Chihuahua', 'Golden Retriever', 'Labrador', 'Pug']`.
O índice 0 do modelo é Beagle, o 1 é Chihuahua, e assim por diante.

## Passo 6 — Aumento de dados (*data augmentation*)

Com poucas fotos por raça, o modelo decora as imagens de treino. Para evitar
isso, cada foto de treino é levemente alterada (espelhada, girada, com zoom)
a cada época, como se fossem fotos novas.

O aumento é aplicado **só no conjunto de treino** e **fora do modelo**. Assim
o modelo exportado fica limpo, sem camadas que só servem para o treino.

```python
aumento = keras.Sequential([
    keras.layers.RandomFlip("horizontal"),
    keras.layers.RandomRotation(0.08),
    keras.layers.RandomZoom(0.15),
    keras.layers.RandomContrast(0.15),
], name="aumento")

treino_aug = (
    treino_ds
    .map(lambda x, y: (aumento(x, training=True), y), num_parallel_calls=AUTOTUNE)
    .prefetch(AUTOTUNE)
)
val_ds = val_ds.prefetch(AUTOTUNE)
teste_ds = teste_ds.prefetch(AUTOTUNE)
```

## Passo 7 — Montar o modelo

A MobileNetV2 já foi treinada no ImageNet (1,4 milhão de imagens) e sabe
reconhecer formas, texturas e partes de animais. Aproveitamos essa "base" e
treinamos só uma camada final nova, com 5 saídas.

```python
base = keras.applications.MobileNetV2(
    input_shape=(IMG, IMG, 3),
    include_top=False,
    weights="imagenet",
)
base.trainable = False  # fase 1: a base fica congelada

entrada = keras.Input(shape=(IMG, IMG, 3), name="imagem")
x = keras.layers.Rescaling(1 / 127.5, offset=-1, name="normalizacao")(entrada)  # 0..255 -> -1..1
x = base(x, training=False)
x = keras.layers.GlobalAveragePooling2D()(x)
x = keras.layers.Dropout(0.3)(x)
saida = keras.layers.Dense(len(CLASSES), activation="softmax", name="probabilidades")(x)

modelo = keras.Model(entrada, saida, name="classificador_racas")
modelo.summary()
```

> `training=False` na base mantém as camadas de *BatchNormalization* em modo
> de inferência, inclusive na fase 2. Isso evita que o ajuste fino estrague
> o que a base já sabia.

## Passo 8 — Treino, fase 1 (só a camada nova)

```python
modelo.compile(
    optimizer=keras.optimizers.Adam(1e-3),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

parada = keras.callbacks.EarlyStopping(
    monitor="val_loss", patience=3, restore_best_weights=True
)

hist1 = modelo.fit(treino_aug, validation_data=val_ds, epochs=15, callbacks=[parada])
```

O `EarlyStopping` interrompe o treino quando a validação para de melhorar e
volta para os melhores pesos. É normal parar antes da época 15. Espere
acurácia de validação acima de ~90%.

## Passo 9 — Treino, fase 2 (ajuste fino)

Agora liberamos as últimas 30 camadas da base para se ajustarem às 5 raças,
com uma taxa de aprendizado bem menor para não destruir o pré-treino.

```python
base.trainable = True
for camada in base.layers[:-30]:
    camada.trainable = False

modelo.compile(
    optimizer=keras.optimizers.Adam(1e-5),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

hist2 = modelo.fit(treino_aug, validation_data=val_ds, epochs=15, callbacks=[parada])
```

## Passo 10 — Gráfico do treino (para o relatório)

```python
import matplotlib.pyplot as plt

acc = hist1.history["accuracy"] + hist2.history["accuracy"]
val_acc = hist1.history["val_accuracy"] + hist2.history["val_accuracy"]
loss = hist1.history["loss"] + hist2.history["loss"]
val_loss = hist1.history["val_loss"] + hist2.history["val_loss"]
inicio_fase2 = len(hist1.history["accuracy"])

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
ax1.plot(acc, label="treino"); ax1.plot(val_acc, label="validação")
ax1.set_title("Acurácia"); ax1.axvline(inicio_fase2 - 0.5, ls="--", c="gray")
ax2.plot(loss, label="treino"); ax2.plot(val_loss, label="validação")
ax2.set_title("Perda (loss)"); ax2.axvline(inicio_fase2 - 0.5, ls="--", c="gray")
for ax in (ax1, ax2):
    ax.set_xlabel("época"); ax.legend()
plt.savefig(f"{PASTA_DRIVE}/grafico_treino.png", dpi=120, bbox_inches="tight")
plt.show()
```

A linha tracejada marca o início do ajuste fino. Se a curva de treino subir
muito e a de validação cair, o modelo está decorando (*overfitting*).

## Passo 11 — Avaliação no conjunto de teste

```python
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay

perda, acuracia = modelo.evaluate(teste_ds)
print(f"\nAcurácia no teste: {acuracia:.2%}\n")

y_real = np.concatenate([y.numpy() for _, y in teste_ds])
y_prev = np.argmax(modelo.predict(teste_ds), axis=1)

print(classification_report(y_real, y_prev, target_names=CLASSES, digits=3))

ConfusionMatrixDisplay(confusion_matrix(y_real, y_prev), display_labels=CLASSES).plot(
    xticks_rotation=45, cmap="Blues"
)
plt.title("Matriz de confusão (teste)")
plt.savefig(f"{PASTA_DRIVE}/matriz_confusao.png", dpi=120, bbox_inches="tight")
plt.show()
```

> **Para o relatório:** o Stanford Dogs foi montado a partir do ImageNet, o
> mesmo conjunto usado no pré-treino da MobileNetV2. Por isso a acurácia no
> teste tende a ser **otimista**. Teste também com fotos tiradas por você
> (próximo passo) e cite essa limitação.

## Passo 12 — Testar com fotos suas

Este teste usa **o mesmo pré-processamento que a API vai usar** (Pillow), então
também confirma que treino e API estão compatíveis.

```python
from google.colab import files
from PIL import Image, ImageOps

def preprocessar(caminho):
    """Igual ao predictor.py da API: RGB, 224x224, float32 de 0 a 255."""
    with Image.open(caminho) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img = img.resize((IMG, IMG), Image.Resampling.BILINEAR)
        return np.asarray(img, dtype=np.float32)[np.newaxis, ...]

for nome_arquivo in files.upload():
    prob = modelo.predict(preprocessar(nome_arquivo), verbose=0)[0]
    ordem = np.argsort(prob)[::-1]
    print(f"\n{nome_arquivo}")
    for i in ordem:
        print(f"  {CLASSES[i]:17s} {prob[i]:6.1%}")
```

Experimente também uma foto que **não** é de nenhuma das 5 raças (um gato,
outra raça). O modelo sempre escolhe uma das 5, às vezes com confiança alta.
É por isso que a API usa um limiar de confiança (ver o guia 02).

## Passo 13 — Salvar o modelo Keras e as classes no Drive

Faça isto **antes** de exportar. Se algo der errado na exportação, você não
precisa treinar de novo.

```python
import json

modelo.save(f"{PASTA_DRIVE}/modelo_racas.keras")
with open(f"{PASTA_DRIVE}/classes.json", "w", encoding="utf-8") as f:
    json.dump(CLASSES, f, ensure_ascii=False, indent=2)

print(open(f"{PASTA_DRIVE}/classes.json", encoding="utf-8").read())
```

## Passo 14 — Exportar para ONNX

O ONNX é um formato aberto que roda com o `onnxruntime`: ~20 MB de instalação
e ~100 MB de RAM, contra ~500 MB a 1 GB do TensorFlow completo.

Primeiro exportamos como *SavedModel* e depois convertemos com o `tf2onnx`
num processo separado (o `!python -m ...`). Isso evita conflitos de versão
entre o `tf2onnx` e o TensorFlow já carregado no notebook.

```python
modelo.export("/content/modelo_savedmodel")

!pip install -q tf2onnx onnxruntime
!python -m tf2onnx.convert --saved-model /content/modelo_savedmodel --output /content/modelo_racas.onnx --opset 13

!ls -lh /content/modelo_racas.onnx
```

O arquivo deve ter ~9 MB.

<details>
<summary>Se a conversão falhar</summary>

1. **Tente a conversão direta pela função**, ainda no notebook:

   ```python
   import tf2onnx

   assinatura = [tf.TensorSpec([None, IMG, IMG, 3], tf.float32, name="imagem")]

   @tf.function(input_signature=assinatura)
   def inferir(imagem):
       return {"probabilidades": modelo(imagem, training=False)}

   tf2onnx.convert.from_function(
       inferir, input_signature=assinatura, opset=13,
       output_path="/content/modelo_racas.onnx",
   )
   ```

2. **Se o `pip install` quebrou o TensorFlow** (erros de `protobuf` ao
   importar): *Ambiente de execução → Reiniciar sessão*, rode só os Passos 1
   e 2, carregue o modelo salvo e tente de novo:

   ```python
   modelo = keras.models.load_model(f"{PASTA_DRIVE}/modelo_racas.keras")
   IMG = 224
   ```

3. **Último recurso:** use o próprio `modelo_racas.keras` na API, com o
   TensorFlow instalado no PC. Funciona igual, só é mais pesado. O guia 02
   mostra a variação de código.
</details>

## Passo 15 — Conferir se o ONNX dá o mesmo resultado que o Keras

Este é o passo que garante que a conversão não mudou nada.

```python
import onnxruntime as ort

sessao = ort.InferenceSession("/content/modelo_racas.onnx", providers=["CPUExecutionProvider"])
nome_entrada = sessao.get_inputs()[0].name
print("Entrada:", nome_entrada, sessao.get_inputs()[0].shape)
print("Saída:  ", sessao.get_outputs()[0].name, sessao.get_outputs()[0].shape)

imagens, rotulos = next(iter(teste_ds))
imagens = imagens.numpy().astype(np.float32)

prob_keras = modelo.predict(imagens, verbose=0)
prob_onnx = sessao.run(None, {nome_entrada: imagens})[0]

diferenca = np.abs(prob_keras - prob_onnx).max()
iguais = (prob_keras.argmax(1) == prob_onnx.argmax(1)).mean()
print(f"Maior diferença entre probabilidades: {diferenca:.6f}")
print(f"Previsões iguais: {iguais:.0%}")
assert diferenca < 1e-3 and iguais == 1.0, "ONNX diferente do Keras!"
print("OK: o modelo ONNX é equivalente ao Keras.")
```

## Passo 16 — Copiar o ONNX para o Drive e baixar

```python
shutil.copy("/content/modelo_racas.onnx", f"{PASTA_DRIVE}/modelo_racas.onnx")
!ls -lh "{PASTA_DRIVE}"

files.download("/content/modelo_racas.onnx")
files.download(f"{PASTA_DRIVE}/classes.json")
```

No Drive, a pasta `MyDrive/pets_identificator/` deve conter:

```
classes.json
grafico_treino.png
matriz_confusao.png
modelo_racas.keras
modelo_racas.onnx
```

Próximo passo: **[02 — Implantar o modelo no projeto](02-implantacao-modelo.md)**.

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `GPU: []` | Ambiente sem GPU | Passo 1; se a cota de GPU acabou, dá para treinar na CPU (~30–60 min) |
| `Pasta de 'X' não encontrada` | Caminho do dataset diferente | `!ls /content/Images \| grep -i labrador` e ajuste `ORIGEM` |
| Acurácia de validação travada em ~20% | Modelo chutando uma classe só | Confira se a camada `Rescaling` está no modelo e se a taxa da fase 1 é `1e-3` |
| Validação piora muito na fase 2 | Ajuste fino agressivo demais | Libere menos camadas (`[:-20]`) ou use `Adam(5e-6)` |
| Colab desconectou no meio | Inatividade ou limite de tempo | Rode de novo a partir do Passo 1; se o `.keras` já está no Drive, carregue-o e pule para o Passo 14 |
| API erra muito com fotos reais, mas o teste deu ~95% | Pré-processamento diferente | Compare o `predictor.py` com o Passo 12: RGB, 224×224, 0–255, sem normalizar fora do modelo |

## Melhoria opcional: classe "Outro"

O limiar de confiança da API filtra parte das fotos fora do escopo, mas não
todas. Uma solução mais forte é treinar uma **6ª classe "Outro"**, com ~200
fotos de outras raças do próprio Stanford Dogs (e, se quiser, fotos de gatos
ou objetos). Basta criar a pasta `DESTINO/<parte>/Outro` no Passo 4 com essas
fotos. O resto do código funciona sem mudanças, porque a quantidade de
classes vem de `CLASSES`.
