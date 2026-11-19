# =============================================================================
# PetMatch — treino do classificador de raças no Google Colab (código único)
#
# Como usar:
#   1. Colab: Ambiente de execução -> Alterar o tipo de ambiente -> GPU T4
#   2. Cole este arquivo inteiro numa célula e execute (Ctrl+Enter)
#   3. Autorize o Google Drive quando pedir
#
# Leva ~1h a 1h30 (download dos dois datasets ~10 min + treino). No fim são baixados
# os arquivos que vão para backend/modelo/ (substituindo os atuais):
#   modelo_racas.onnx    classificador de raças
#   classes.json         ordem das raças (não edite à mão)
#   modelo_info.json     limiar sugerido e métricas (a API lê o limiar daqui)
#   modelo_cachorro.onnx detector "tem cachorro na foto?" (opcional)
#
# Baseado no notebooks/treinamento_v3_mais_dados.ipynb: Stanford Dogs + Tsinghua Dogs,
# EfficientNetV2 em precisão mista, detector de cachorro. Diferenças: padrão de 120 raças,
# EfficientNetV2-B0 (mais leve para o servidor), modelo_info.json e retomada após queda.
#
# Se o Colab desconectar: rode de novo. Com RETOMAR = True ele carrega o último
# checkpoint salvo no Drive e continua do ajuste fino em vez de treinar do zero.
# =============================================================================

# ----------------------------- Configuração ---------------------------------
INCLUIR_RACAS_NOVAS = False  # True: +7 raças só do Tsinghua (Shiba Inu, Fila...) = 127
USAR_TSINGHUA = True         # mais fotos por raça (~2,7 GB a mais de download)
MAX_TSINGHUA = 300           # fotos do Tsinghua por raça no treino
REDE = "B0"                  # "B0": 224 px, leve (recomendado p/ o servidor) | "B3": 300 px, mais precisa e pesada
                             # (com B3, suba o MemoryMax do deploy/pets-api.service de 400M para ~700M)
EPOCAS_FASE1 = 5             # só a camada nova
EPOCAS_FASE2 = 8             # ajuste fino (para antes se a validação parar de melhorar)
CAMADAS_LIBERADAS = 80       # camadas finais da base liberadas no ajuste fino
TREINAR_DETECTOR = True      # gera o modelo_cachorro.onnx
RETOMAR = False              # True: continua do checkpoint no Drive (depois de uma queda)
PASTA_DRIVE = "/content/drive/MyDrive/pets_identificator_treino"
SEMENTE = 42                 # mesma divisão de teste do v1 (comparável com os 81,8%)

import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
import keras

# ----------------------------- 1. GPU e Drive -------------------------------
print("TensorFlow:", tf.__version__, "| Keras:", keras.__version__)
assert tf.config.list_physical_devices("GPU"), "Sem GPU: Ambiente de execução -> Alterar o tipo -> GPU T4"
# Contas em float16 na GPU (~2x mais rápido na T4). Antes de exportar o modelo é refeito em float32.
keras.mixed_precision.set_global_policy("mixed_float16")

from google.colab import drive, files

drive.mount("/content/drive")
os.makedirs(PASTA_DRIVE, exist_ok=True)
print("Arquivos serão salvos em:", PASTA_DRIVE)

IMG = {"B0": 224, "B3": 300}[REDE]
LOTE = 32 if REDE == "B3" else 64


def sh(comando):
    """Roda um comando de terminal e mostra a saída (equivale ao "!" do Colab)."""
    resultado = subprocess.run(comando, shell=True, capture_output=True, text=True)
    if resultado.stdout.strip():
        print(resultado.stdout.strip()[-2000:])
    if resultado.returncode != 0:
        print(resultado.stderr.strip()[-2000:])
    return resultado.returncode == 0


# ----------------------------- 2. Nomes das raças ---------------------------
# Final do nome da pasta do Stanford -> nome no app (na ordem dos códigos n02085620, n02085782...)
NOMES_PT = {
    "Chihuahua": "Chihuahua",
    "Japanese_spaniel": "Chin Japonês",
    "Maltese_dog": "Maltês",
    "Pekinese": "Pequinês",
    "Shih-Tzu": "Shih Tzu",
    "Blenheim_spaniel": "Cavalier King Charles Spaniel",
    "papillon": "Papillon",
    "toy_terrier": "Toy Terrier",
    "Rhodesian_ridgeback": "Rhodesian Ridgeback",
    "Afghan_hound": "Galgo Afegão",
    "basset": "Basset Hound",
    "beagle": "Beagle",
    "bloodhound": "Bloodhound",
    "bluetick": "Bluetick Coonhound",
    "black-and-tan_coonhound": "Black and Tan Coonhound",
    "Walker_hound": "Treeing Walker Coonhound",
    "English_foxhound": "Foxhound Inglês",
    "redbone": "Redbone Coonhound",
    "borzoi": "Borzói",
    "Irish_wolfhound": "Lébrel Irlandês",
    "Italian_greyhound": "Galguinho Italiano",
    "whippet": "Whippet",
    "Ibizan_hound": "Podengo Ibicenco",
    "Norwegian_elkhound": "Elkhound Norueguês",
    "otterhound": "Otterhound",
    "Saluki": "Saluki",
    "Scottish_deerhound": "Deerhound",
    "Weimaraner": "Weimaraner",
    "Staffordshire_bullterrier": "Staffordshire Bull Terrier",
    "American_Staffordshire_terrier": "American Staffordshire Terrier",
    "Bedlington_terrier": "Bedlington Terrier",
    "Border_terrier": "Border Terrier",
    "Kerry_blue_terrier": "Kerry Blue Terrier",
    "Irish_terrier": "Terrier Irlandês",
    "Norfolk_terrier": "Norfolk Terrier",
    "Norwich_terrier": "Norwich Terrier",
    "Yorkshire_terrier": "Yorkshire",
    "wire-haired_fox_terrier": "Fox Terrier de Pelo Duro",
    "Lakeland_terrier": "Lakeland Terrier",
    "Sealyham_terrier": "Sealyham Terrier",
    "Airedale": "Airedale Terrier",
    "cairn": "Cairn Terrier",
    "Australian_terrier": "Terrier Australiano",
    "Dandie_Dinmont": "Dandie Dinmont Terrier",
    "Boston_bull": "Boston Terrier",
    "miniature_schnauzer": "Schnauzer Miniatura",
    "giant_schnauzer": "Schnauzer Gigante",
    "standard_schnauzer": "Schnauzer Médio",
    "Scotch_terrier": "Terrier Escocês",
    "Tibetan_terrier": "Terrier Tibetano",
    "silky_terrier": "Silky Terrier",
    "soft-coated_wheaten_terrier": "Soft-Coated Wheaten Terrier",
    "West_Highland_white_terrier": "West Highland White Terrier",
    "Lhasa": "Lhasa Apso",
    "flat-coated_retriever": "Flat-Coated Retriever",
    "curly-coated_retriever": "Curly-Coated Retriever",
    "golden_retriever": "Golden Retriever",
    "Labrador_retriever": "Labrador",
    "Chesapeake_Bay_retriever": "Chesapeake Bay Retriever",
    "German_short-haired_pointer": "Braco Alemão de Pelo Curto",
    "vizsla": "Vizsla",
    "English_setter": "Setter Inglês",
    "Irish_setter": "Setter Irlandês",
    "Gordon_setter": "Gordon Setter",
    "Brittany_spaniel": "Spaniel Bretão",
    "clumber": "Clumber Spaniel",
    "English_springer": "Springer Spaniel Inglês",
    "Welsh_springer_spaniel": "Springer Spaniel Galês",
    "cocker_spaniel": "Cocker Spaniel",
    "Sussex_spaniel": "Sussex Spaniel",
    "Irish_water_spaniel": "Spaniel de Água Irlandês",
    "kuvasz": "Kuvasz",
    "schipperke": "Schipperke",
    "groenendael": "Pastor Belga Groenendael",
    "malinois": "Pastor Belga Malinois",
    "briard": "Briard",
    "kelpie": "Kelpie Australiano",
    "komondor": "Komondor",
    "Old_English_sheepdog": "Old English Sheepdog",
    "Shetland_sheepdog": "Pastor de Shetland",
    "collie": "Collie",
    "Border_collie": "Border Collie",
    "Bouvier_des_Flandres": "Bouvier de Flandres",
    "Rottweiler": "Rottweiler",
    "German_shepherd": "Pastor Alemão",
    "Doberman": "Dobermann",
    "miniature_pinscher": "Pinscher Miniatura",
    "Greater_Swiss_Mountain_dog": "Grande Boiadeiro Suíço",
    "Bernese_mountain_dog": "Boiadeiro Bernês",
    "Appenzeller": "Boiadeiro de Appenzell",
    "EntleBucher": "Boiadeiro de Entlebuch",
    "boxer": "Boxer",
    "bull_mastiff": "Bulmastife",
    "Tibetan_mastiff": "Mastim Tibetano",
    "French_bulldog": "Buldogue Francês",
    "Great_Dane": "Dogue Alemão",
    "Saint_Bernard": "São Bernardo",
    "Eskimo_dog": "Cão Esquimó",
    "malamute": "Malamute do Alasca",
    "Siberian_husky": "Husky Siberiano",
    "affenpinscher": "Affenpinscher",
    "basenji": "Basenji",
    "pug": "Pug",
    "Leonberg": "Leonberger",
    "Newfoundland": "Terra-Nova",
    "Great_Pyrenees": "Cão dos Pirineus",
    "Samoyed": "Samoieda",
    "Pomeranian": "Lulu da Pomerânia",
    "chow": "Chow Chow",
    "keeshond": "Keeshond",
    "Brabancon_griffon": "Petit Brabançon",
    "Pembroke": "Welsh Corgi Pembroke",
    "Cardigan": "Welsh Corgi Cardigan",
    "toy_poodle": "Poodle Toy",
    "miniature_poodle": "Poodle Miniatura",
    "standard_poodle": "Poodle Standard",
    "Mexican_hairless": "Pelado Mexicano",
    "dingo": "Dingo",
    "dhole": "Dhole",
    "African_hunting_dog": "Cão Selvagem Africano",
}

# Raças que só existem no Tsinghua Dogs
NOMES_NOVOS = {
    "Shiba_Dog": "Shiba Inu",
    "Fila_Braziliero": "Fila Brasileiro",
    "Chinese_Crested_Dog": "Cão de Crista Chinês",
    "Australian_Shepherd": "Pastor Australiano",
    "Cane_Carso": "Cane Corso",
    "Japanese_Spitzes": "Spitz Japonês",
    "Bichon_Frise": "Bichon Frisé",
}


def chave(nome):
    """'curly-coated_retriever' e 'curly_coated_retriever' viram 'curlycoatedretriever'."""
    return re.sub(r"[^a-z]", "", nome.lower())


APELIDOS = {"brabancongriffo": "brabancongriffon"}  # o Tsinghua escreve sem o "n" final
PT_POR_CHAVE = {chave(k): v for k, v in NOMES_PT.items()}
if INCLUIR_RACAS_NOVAS:
    PT_POR_CHAVE.update({chave(k): v for k, v in NOMES_NOVOS.items()})
assert len(set(PT_POR_CHAVE.values())) == len(PT_POR_CHAVE), "Dois nomes de raça iguais"
print(len(PT_POR_CHAVE), "raças no total")

# ----------------------------- 3. Stanford Dogs -----------------------------
STANFORD = Path("/content/stanford/Images")
if not STANFORD.exists():
    ok = sh(
        "mkdir -p /content/stanford && wget -q --timeout=30 --tries=2 "
        "http://vision.stanford.edu/aditya86/ImageNetDogs/images.tar -O /content/images.tar "
        "&& tar -xf /content/images.tar -C /content/stanford"
    )
    if not ok:
        print("Site de Stanford fora do ar, baixando a cópia do Hugging Face…")
        from huggingface_hub import hf_hub_download

        arquivo = hf_hub_download("Alanox/stanford-dogs", "images.tar.gz", repo_type="dataset")
        assert sh(f"mkdir -p /content/stanford_plano && tar -xzf {arquivo} -C /content/stanford_plano")
        fotos = sorted(Path("/content/stanford_plano").rglob("*.jpg"))
        codigos = sorted({f.name.split("_")[0] for f in fotos})
        assert len(codigos) == 120, f"Esperava 120 códigos de raça, achei {len(codigos)}"
        # NOMES_PT está na ordem dos códigos (n02085620, n02085782, ...)
        pasta_do_codigo = {c: STANFORD / f"{c}-{s}" for c, s in zip(codigos, NOMES_PT)}
        for pasta in pasta_do_codigo.values():
            pasta.mkdir(parents=True, exist_ok=True)
        for foto in fotos:
            foto.rename(pasta_do_codigo[foto.name.split("_")[0]] / foto.name)

pastas_stanford = sorted(p for p in STANFORD.iterdir() if p.is_dir())
assert len(pastas_stanford) == 120, f"Esperava 120 pastas do Stanford, achei {len(pastas_stanford)}"
print("Stanford: 120 raças")

# ----------------------------- 4. Tsinghua Dogs -----------------------------
TSINGHUA = Path("/content/tsinghua")
racas_tsinghua = []
if USAR_TSINGHUA:
    if not (TSINGHUA / "train").exists():
        import pyarrow.parquet as pq
        from huggingface_hub import snapshot_download
        from PIL import Image

        pasta_hf = Path(snapshot_download(
            "giacomov/tsinghua_dogs", repo_type="dataset", allow_patterns="data/*.parquet"
        ))
        arquivos = sorted(pasta_hf.glob("data/*.parquet"))
        meta = json.loads(pq.read_schema(arquivos[0]).metadata[b"huggingface"])
        nomes_tsinghua = meta["info"]["features"]["label"]["names"]

        def raca_pt(nome_tsinghua):
            """'420-n000124-Chihuahua' -> 'Chihuahua' (None se a categoria fica de fora)."""
            k = chave(nome_tsinghua.split("-", 2)[2])
            return PT_POR_CHAVE.get(APELIDOS.get(k, k))

        contagem = {"train": 0, "validation": 0, "descartadas": 0}
        for arquivo in arquivos:
            parte = "validation" if "validation" in arquivo.name else "train"
            for lote in pq.ParquetFile(arquivo).iter_batches(batch_size=256, columns=["image", "label"]):
                for imagem, rotulo in zip(lote.column("image").to_pylist(), lote.column("label").to_pylist()):
                    raca = raca_pt(nomes_tsinghua[rotulo])
                    if raca is None:
                        continue
                    try:
                        Image.open(io.BytesIO(imagem["bytes"])).verify()
                    except Exception:
                        contagem["descartadas"] += 1
                        continue
                    destino = TSINGHUA / parte / raca
                    destino.mkdir(parents=True, exist_ok=True)
                    (destino / f"t{contagem[parte]:06d}.jpg").write_bytes(imagem["bytes"])
                    contagem[parte] += 1
            print(arquivo.name, contagem)
    racas_tsinghua = sorted(p.name for p in (TSINGHUA / "train").iterdir())
    print(len(racas_tsinghua), "raças do Tsinghua aproveitadas")

# ----------------------------- 5. Treino / validação / teste ----------------
# Stanford: 70/15/15 com a semente 42 (o teste é o mesmo do v1).
# Tsinghua: até MAX_TSINGHUA fotos por raça no treino; a validação oficial vira um 2º teste.
DESTINO = Path("/content/dataset")
if DESTINO.exists():
    shutil.rmtree(DESTINO)


def ligar(arquivos, parte, raca, prefixo=""):
    pasta = DESTINO / parte / raca
    pasta.mkdir(parents=True, exist_ok=True)
    for arquivo in arquivos:
        os.link(arquivo, pasta / f"{prefixo}{arquivo.name}")  # link: não ocupa espaço extra


random.seed(SEMENTE)
for pasta in pastas_stanford:
    raca = NOMES_PT[pasta.name.split("-", 1)[1]]
    imagens = sorted(pasta.glob("*.jpg"))
    random.shuffle(imagens)
    n_treino, n_val = int(len(imagens) * 0.70), int(len(imagens) * 0.15)
    ligar(imagens[:n_treino], "train", raca, "s_")
    ligar(imagens[n_treino:n_treino + n_val], "val", raca, "s_")
    ligar(imagens[n_treino + n_val:], "test", raca, "s_")

sorteio = random.Random(7)
for raca in racas_tsinghua:
    imagens = sorted((TSINGHUA / "train" / raca).glob("*.jpg"))
    sorteio.shuffle(imagens)
    ligar(imagens[:MAX_TSINGHUA], "train", raca, "t_")
    validacao = TSINGHUA / "validation" / raca
    if validacao.exists():
        ligar(sorted(validacao.glob("*.jpg")), "test_tsinghua", raca)

for parte in ("train", "val", "test", "test_tsinghua"):
    if (DESTINO / parte).exists():
        fotos = [len(list(r.iterdir())) for r in (DESTINO / parte).iterdir()]
        print(f"{parte:14s} {len(fotos):3d} raças, {sum(fotos):6d} fotos (mín {min(fotos)} / máx {max(fotos)} por raça)")

# ----------------------------- 6. Carregar as imagens -----------------------
# A ordem das classes é a alfabética das pastas e vai para o classes.json.
AUTOTUNE = tf.data.AUTOTUNE


def carregar(parte, embaralhar, classes=None):
    return keras.utils.image_dataset_from_directory(
        DESTINO / parte, image_size=(IMG, IMG), batch_size=LOTE, label_mode="int",
        class_names=classes, shuffle=embaralhar, seed=SEMENTE,
    )


treino_ds = carregar("train", embaralhar=True)
CLASSES = treino_ds.class_names
NUM_CLASSES = len(CLASSES)
val_ds = carregar("val", embaralhar=False, classes=CLASSES)
teste_ds = carregar("test", embaralhar=False, classes=CLASSES)
teste_t_ds = None
if (DESTINO / "test_tsinghua").exists():
    racas_teste_t = sorted(p.name for p in (DESTINO / "test_tsinghua").iterdir())
    teste_t_ds = carregar("test_tsinghua", embaralhar=False, classes=racas_teste_t)
print(NUM_CLASSES, "classes. Primeiras:", CLASSES[:5])

# Aumento de dados só no treino e fora do modelo (o ONNX fica limpo)
aumento = keras.Sequential([
    keras.layers.RandomFlip("horizontal"),
    keras.layers.RandomRotation(0.08),
    keras.layers.RandomZoom(height_factor=(-0.2, 0.3), fill_mode="reflect"),
    keras.layers.RandomTranslation(0.1, 0.1, fill_mode="reflect"),
    keras.layers.RandomContrast(0.2),
    keras.layers.RandomBrightness(0.15, value_range=(0, 255)),
], name="aumento")

treino_aug = treino_ds.map(lambda x, y: (aumento(x, training=True), y), num_parallel_calls=AUTOTUNE).prefetch(AUTOTUNE)
val_ds = val_ds.cache().prefetch(AUTOTUNE)
teste_ds = teste_ds.prefetch(AUTOTUNE)


# ----------------------------- 7. Modelo ------------------------------------
def montar_modelo():
    """EfficientNetV2 já normaliza por dentro: entrada float32 de 0 a 255, igual à API."""
    classe_base = {"B0": keras.applications.EfficientNetV2B0, "B3": keras.applications.EfficientNetV2B3}[REDE]
    # Nomes fixos: o passo 10 monta o modelo de novo e carrega os pesos pelo nome das camadas
    base = classe_base(
        input_shape=(IMG, IMG, 3), include_top=False, weights="imagenet",
        include_preprocessing=True, name="base_efficientnet",
    )
    entrada = keras.Input(shape=(IMG, IMG, 3), name="imagem")
    x = base(entrada, training=False)
    x = keras.layers.GlobalAveragePooling2D(name="media_global")(x)
    x = keras.layers.Dropout(0.4, name="dropout")(x)
    saida = keras.layers.Dense(NUM_CLASSES, activation="softmax", dtype="float32", name="probabilidades")(x)
    return keras.Model(entrada, saida, name="classificador_racas"), base


def liberar_ajuste_fino(base):
    base.trainable = True
    for camada in base.layers[:-CAMADAS_LIBERADAS]:
        camada.trainable = False
    for camada in base.layers:
        if isinstance(camada, keras.layers.BatchNormalization):
            camada.trainable = False  # normalização fica como no ImageNet


modelo, base = montar_modelo()
CHECKPOINT = f"{PASTA_DRIVE}/checkpoint_{REDE}_{NUM_CLASSES}.weights.h5"
metricas = ["accuracy", keras.metrics.SparseTopKCategoricalAccuracy(k=3, name="top3")]
parada = keras.callbacks.EarlyStopping(monitor="val_loss", patience=2, restore_best_weights=True)
checkpoint = keras.callbacks.ModelCheckpoint(
    CHECKPOINT, monitor="val_loss", save_best_only=True, save_weights_only=True
)
historicos = []

# ----------------------------- 8. Treino ------------------------------------
if RETOMAR and os.path.exists(CHECKPOINT):
    print("Retomando do checkpoint:", CHECKPOINT)
    liberar_ajuste_fino(base)
    modelo.load_weights(CHECKPOINT)
else:
    print("\n=== Fase 1: só a camada nova ===")
    base.trainable = False
    modelo.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=metricas)
    historicos.append(modelo.fit(treino_aug, validation_data=val_ds, epochs=EPOCAS_FASE1, callbacks=[parada, checkpoint]))
    liberar_ajuste_fino(base)

print("\n=== Fase 2: ajuste fino ===")
modelo.compile(optimizer=keras.optimizers.Adam(2e-5), loss="sparse_categorical_crossentropy", metrics=metricas)
historicos.append(modelo.fit(treino_aug, validation_data=val_ds, epochs=EPOCAS_FASE2, callbacks=[parada, checkpoint]))

# Gráfico para o relatório
import matplotlib.pyplot as plt


def juntar(chave_hist):
    return [v for h in historicos for v in h.history[chave_hist]]


fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
ax1.plot(juntar("accuracy"), label="treino"); ax1.plot(juntar("val_accuracy"), label="validação"); ax1.set_title("Acurácia")
ax2.plot(juntar("loss"), label="treino"); ax2.plot(juntar("val_loss"), label="validação"); ax2.set_title("Perda (loss)")
if len(historicos) == 2:
    for ax in (ax1, ax2):
        ax.axvline(len(historicos[0].history["accuracy"]) - 0.5, ls="--", c="gray")
for ax in (ax1, ax2):
    ax.set_xlabel("época"); ax.legend()
plt.savefig(f"{PASTA_DRIVE}/grafico_treino.png", dpi=120, bbox_inches="tight")
plt.show()

# ----------------------------- 9. Avaliação ---------------------------------
from sklearn.metrics import classification_report


def avaliar(ds, nome, racas_do_ds):
    y_real = np.concatenate([y.numpy() for _, y in ds])
    y_real = np.array([CLASSES.index(racas_do_ds[i]) for i in y_real])  # posição em CLASSES
    prob = modelo.predict(ds, verbose=0)
    y_prev = prob.argmax(1)
    acerto = float((y_prev == y_real).mean())
    top3 = float(np.mean([r in p for r, p in zip(y_real, np.argsort(prob, 1)[:, -3:])]))
    print(f"[{nome}] acerto: {acerto:.1%}   top-3: {top3:.1%}   fotos: {len(y_real)}")
    return y_real, y_prev, prob, acerto, top3


y_real, y_prev, prob_teste, acerto_s, top3_s = avaliar(teste_ds, "teste Stanford (v1: 81,8%)", CLASSES)
metricas_t = None
if teste_t_ds is not None:
    _, _, _, acerto_t, top3_t = avaliar(teste_t_ds.prefetch(AUTOTUNE), "teste Tsinghua", racas_teste_t)
    metricas_t = {"acerto": round(acerto_t, 4), "top3": round(top3_t, 4)}

presentes = sorted(set(y_real))
nomes_presentes = [CLASSES[i] for i in presentes]
with open(f"{PASTA_DRIVE}/relatorio_teste.txt", "w", encoding="utf-8") as f:
    f.write(classification_report(y_real, y_prev, labels=presentes, target_names=nomes_presentes, digits=3, zero_division=0))
relatorio = classification_report(
    y_real, y_prev, labels=presentes, target_names=nomes_presentes, digits=3, output_dict=True, zero_division=0
)
print("\n10 raças com pior acerto:")
for c in sorted(nomes_presentes, key=lambda c: relatorio[c]["recall"])[:10]:
    print(f"  {c:32s} {relatorio[c]['recall']:.0%}")

# Limiar da API: o primeiro com >= 90% de acerto entre as fotos que passam
confianca = prob_teste.max(1) * 100
acertou = y_prev == y_real
print(f"\n{'limiar':>7} {'cobertura':>10} {'acerto':>8}")
limiar_sugerido = None
tabela_limiar = []
for limiar in range(20, 85, 5):
    passa = confianca >= limiar
    precisao = float(acertou[passa].mean()) if passa.any() else 0.0
    tabela_limiar.append({"limiar": limiar, "cobertura": round(float(passa.mean()), 4), "acerto": round(precisao, 4)})
    print(f"{limiar:>6}% {passa.mean():>10.1%} {precisao:>8.1%}")
    if limiar_sugerido is None and precisao >= 0.90:
        limiar_sugerido = limiar
limiar_sugerido = limiar_sugerido or 65
print(f"Limiar sugerido: {limiar_sugerido}%")

# ----------------------------- 10. Exportar para ONNX (float32) -------------
modelo.save_weights(f"{PASTA_DRIVE}/modelo_racas.weights.h5")
with open(f"{PASTA_DRIVE}/classes.json", "w", encoding="utf-8") as f:
    json.dump(CLASSES, f, ensure_ascii=False, indent=2)

keras.mixed_precision.set_global_policy("float32")
modelo_final, _ = montar_modelo()
modelo_final.load_weights(f"{PASTA_DRIVE}/modelo_racas.weights.h5")
lote_teste = next(iter(teste_ds))[0].numpy().astype(np.float32)

modelo_final.export("/content/modelo_savedmodel")
assert sh(f"{sys.executable} -m pip install -q tf2onnx onnxruntime")
assert sh(
    f"{sys.executable} -m tf2onnx.convert --saved-model /content/modelo_savedmodel "
    "--output /content/modelo_racas.onnx --opset 13"
), "Falha na conversão para ONNX (veja a mensagem acima)"

import onnxruntime as ort

sessao = ort.InferenceSession("/content/modelo_racas.onnx", providers=["CPUExecutionProvider"])
prob_keras = modelo_final.predict(lote_teste, verbose=0)
prob_onnx = sessao.run(None, {sessao.get_inputs()[0].name: lote_teste})[0]
diferenca = float(np.abs(prob_keras - prob_onnx).max())
iguais = float((prob_keras.argmax(1) == prob_onnx.argmax(1)).mean())
print(f"ONNX x Keras: maior diferença {diferenca:.6f}, previsões iguais {iguais:.0%}")
assert prob_onnx.shape[1] == NUM_CLASSES and diferenca < 1e-3 and iguais == 1.0, "ONNX diferente do Keras!"

# ----------------------------- 11. Detector de cachorro ---------------------
# MobileNetV2 original do ImageNet: as categorias 151 a 268 são cachorros; a soma delas
# é a probabilidade de ter um cachorro na foto. A API usa 30% (LIMIAR_CACHORRO).
if TREINAR_DETECTOR:
    detector_base = keras.applications.MobileNetV2(weights="imagenet", include_top=True)
    entrada_det = keras.Input(shape=(224, 224, 3), name="imagem")
    x = keras.layers.Rescaling(1 / 127.5, offset=-1)(entrada_det)  # 0..255 -> -1..1
    prob_cachorro = keras.layers.Lambda(
        lambda p: keras.ops.sum(p[:, 151:269], axis=1, keepdims=True), name="prob_cachorro"
    )(detector_base(x, training=False))
    detector = keras.Model(entrada_det, prob_cachorro, name="detector_cachorro")

    pc = np.concatenate([
        detector.predict(tf.image.resize(x_lote, (224, 224)), verbose=0)[:, 0] for x_lote, _ in teste_ds
    ])
    print(f"Detector: {(pc >= 0.3).mean():.1%} dos cachorros do teste passam no limiar de 30%")

    detector.export("/content/detector_savedmodel")
    assert sh(
        f"{sys.executable} -m tf2onnx.convert --saved-model /content/detector_savedmodel "
        "--output /content/modelo_cachorro.onnx --opset 13"
    ), "Falha na conversão do detector"
    sessao_det = ort.InferenceSession("/content/modelo_cachorro.onnx", providers=["CPUExecutionProvider"])
    lote_det = tf.image.resize(lote_teste, (224, 224)).numpy().astype(np.float32)
    dif_det = np.abs(detector.predict(lote_det, verbose=0) - sessao_det.run(None, {sessao_det.get_inputs()[0].name: lote_det})[0]).max()
    assert dif_det < 1e-3, "Detector ONNX diferente do Keras!"

# ----------------------------- 12. Salvar e baixar --------------------------
info = {
    "rede": f"EfficientNetV2-{REDE}",
    "tamanho_imagem": IMG,
    "racas": NUM_CLASSES,
    "datasets": ["Stanford Dogs"] + (["Tsinghua Dogs"] if USAR_TSINGHUA else []),
    "limiar_sugerido": limiar_sugerido,
    "teste_stanford": {"acerto": round(acerto_s, 4), "top3": round(top3_s, 4)},
    "teste_tsinghua": metricas_t,
    "tabela_limiar": tabela_limiar,
}
with open("/content/modelo_info.json", "w", encoding="utf-8") as f:
    json.dump(info, f, ensure_ascii=False, indent=2)

finais = ["modelo_racas.onnx", "modelo_info.json"] + (["modelo_cachorro.onnx"] if TREINAR_DETECTOR else [])
for nome in finais:
    shutil.copy(f"/content/{nome}", f"{PASTA_DRIVE}/{nome}")
print(json.dumps({k: v for k, v in info.items() if k != "tabela_limiar"}, ensure_ascii=False, indent=2))
sh(f'ls -lh "{PASTA_DRIVE}"')

for nome in finais:
    files.download(f"/content/{nome}")
files.download(f"{PASTA_DRIVE}/classes.json")
print("\nPronto! Coloque os arquivos baixados em backend/modelo/ (substituindo os atuais).")
