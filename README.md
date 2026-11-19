# Identificador de Raças de Cachorro

**PetMatch**: app (Android/iOS) e site que recebem a foto de um cachorro, enviam
para uma API e mostram **as 3 raças mais prováveis** segundo um modelo de Machine
Learning, cada uma com sua probabilidade, além do histórico de consultas.

- **Site:** https://pets.mirtilo.dev.br (mesmo domínio da API, em `/api`)
- **Raças:** as **120** do Stanford Dogs, com nomes em português.
- **Modelo:** EfficientNetV2-B0 treinado com Stanford Dogs + Tsinghua Dogs —
  89,4% de acerto (98,3% no top-3) no teste do Stanford e 89,3% no do Tsinghua.
- Se a raça mais provável fica abaixo do limiar de confiança (lido do
  `backend/modelo/modelo_info.json`), a resposta é **"Não reconhecido"**, mas os
  3 palpites mais próximos continuam aparecendo. Com o detector de cachorro
  (`modelo_cachorro.onnx`), fotos sem cachorro respondem "Não parece um cachorro".

> **Quer rodar no seu computador e usar pelo celular?**
> Siga o guia [docs/05-rodar-localmente.md](docs/05-rodar-localmente.md).

## Como funciona

```
 App (Expo / React Native)             API (Flask)                      Modelo
┌───────────────────────────┐  HTTPS  ┌──────────────────────────┐   ┌──────────────────────────┐
│ tira/escolhe a foto       │────────►│ POST /api/prever         │──►│ detector de cachorro +   │
│ reduz para 1024px (JPEG)  │         │ valida JPG/PNG até 5 MB  │   │ EfficientNetV2-B0 (ONNX) │
│ mostra raça + confiança   │◄────────│ salva no SQLite          │   └──────────────────────────┘
│ lista o histórico         │  JSON   │ GET /api/historico       │
└───────────────────────────┘         └──────────────────────────┘
```

- Cada celular tem um identificador próprio (`X-Device-Id`), então o histórico
  é separado por aparelho, sem precisar de login.
- Em produção, a API roda em `https://pets.mirtilo.dev.br` e **desliga sozinha
  após 15 minutos sem uso** para não ocupar memória no servidor.

## Requisitos atendidos

- RF01 — envio de imagem (câmera ou galeria)
- RF02 — processamento e retorno da raça predita (modelo real)
- RF03 — exibição do percentual de confiança
- RF04 — histórico de consultas salvo em banco SQLite
- RNF02 — interface mobile (Android e iOS via Expo)
- RNF04 — aceita apenas JPG/PNG, até 5 MB

## Estrutura do repositório

```
pets_identificator/
├── backend/                 API Flask
│   ├── app.py               rotas, banco, validações
│   ├── predictor.py         carrega o modelo e faz a predição
│   ├── modelo/              modelo_racas.onnx, modelo_cachorro.onnx, classes.json,
│   │                        modelo_info.json (limiar e acerto medidos no treino)
│   ├── database/schema.sql  tabelas (o banco.db é gerado sozinho)
│   └── tests/               testes automáticos (pytest)
├── Front/                   app Expo (React Native + TypeScript)
│   └── src/
│       ├── app/             telas: Identificar e Histórico
│       ├── components/      botões, barra de confiança, cartões
│       └── services/        comunicação com a API, foto, ID do aparelho
├── deploy/                  systemd + nginx + script de instalação no servidor
└── docs/                    guias (abaixo)
```

## Documentação

| Guia | Conteúdo |
|---|---|
| [01 — Treinamento do modelo](docs/01-treinamento-modelo.md) | Notebook do Google Colab: Stanford Dogs, MobileNetV2, exportação para ONNX |
| [02 — Implantação do modelo](docs/02-implantacao-modelo.md) | Como o modelo treinado entra na API |
| [03 — Plano de execução local](docs/03-plano-execucao-local.md) | Planejamento por fases usado no desenvolvimento |
| [04 — Deploy](docs/04-deploy.md) | Servidor, site, HTTPS, desligamento automático e geração do APK |
| [05 — Rodar localmente](docs/05-rodar-localmente.md) | **Comece por aqui:** instalar, configurar e usar pelo celular |
| [**Script de treino (Colab)**](notebooks/treinamento_colab.py) | **Gerou o modelo atual.** Código único para colar no Colab. 120 raças, Stanford + Tsinghua Dogs, EfficientNetV2-B0, detector de cachorro; gera `modelo_info.json` com o limiar |
| [Notebook 120 raças (v1)](notebooks/treinamento_120_racas.ipynb) | Modelo anterior: MobileNetV2, só Stanford Dogs (81,8% no teste) |
| [Notebook v2](notebooks/treinamento_v2_efficientnet.ipynb) | EfficientNetV2-B3 + detector de cachorro (só Stanford Dogs) |
| [Notebook v3](notebooks/treinamento_v3_mais_dados.ipynb) | Base do script de treino: Stanford + Tsinghua, 127 raças, EfficientNetV2-B3 |

## Início rápido

Com Git, Node.js 22 e Python 3.12 instalados, e o Expo Go no celular (detalhes
e problemas comuns no [guia 05](docs/05-rodar-localmente.md)):

```powershell
git clone https://github.com/Mirtilo122/pets_identificator.git
cd pets_identificator

# terminal 1 — API
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1   # no cmd: .venv\Scripts\activate.bat
pip install -r requirements.txt
python app.py

# terminal 2 — app
cd Front
npm ci
copy .env.example .env    # edite: EXPO_PUBLIC_API_URL=http://IP_DO_SEU_PC:5000
npx expo start            # escaneie o QR code com o Expo Go
```

Para usar só o app, apontando para a API de produção, coloque
`EXPO_PUBLIC_API_URL=https://pets.mirtilo.dev.br` no `Front/.env` e pule o
terminal 1.
