-- Schema do banco de dados - Reconhecimento de Raças de Cachorro
-- RF04: O sistema deve armazenar o histórico de consultas no banco de dados.

CREATE TABLE IF NOT EXISTS racas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE
);

-- Cada consulta pertence a um aparelho (device_id gerado pelo app mobile).
-- raca_id NULL significa que o modelo não reconheceu a raça com confiança suficiente.
CREATE TABLE IF NOT EXISTS predicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    nome_arquivo TEXT NOT NULL,
    raca_id INTEGER REFERENCES racas(id),
    confianca REAL NOT NULL,
    data_hora TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_predicoes_device ON predicoes (device_id, id);

-- Pré-carga das 5 raças definidas no escopo do MVP
-- (os nomes precisam ser iguais aos de backend/modelo/classes.json)
INSERT OR IGNORE INTO racas (nome) VALUES
    ('Labrador'),
    ('Golden Retriever'),
    ('Beagle'),
    ('Pug'),
    ('Chihuahua');
