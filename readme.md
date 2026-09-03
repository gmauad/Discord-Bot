# DiscordBot — Assistente Virtual Modular

O **DiscordBot** é um assistente avançado e totalmente integrado com Inteligência Artificial generativa local. Ele não apenas lê e escreve mensagens de texto, mas também escuta canais de voz, transcreve áudio em tempo real via aceleração de hardware (CUDA), processa o contexto usando LLMs locais e responde de volta em áudio com voz neural sintética.

Tudo isso rodando **100% na máquina local**, sem depender de APIs pagas de linguagem.

## Arquitetura de Microsserviços

O projeto utiliza uma arquitetura distribuída, isolando responsabilidades para garantir tolerância a falhas e alto desempenho, evitando gargalos no Event Loop do Node.js durante o processamento de tensores pesados.

1. **Gateway Discord (`bot.js`)**
   Escrito em Node.js. Gerencia WebSockets, captura o fluxo de voz contínuo (PCM bruto) nativo do Discord e aplica VAD (Voice Activity Detection) primário.

2. **Motor de Audição STT (`voz_api.py` — Porta 4000)**
   Escrito em Python. Recebe a onda sonora na memória RAM e utiliza **Faster-Whisper** acelerado via GPU para transcrição imediata.

3. **Motor de Fala TTS (`falar_api.py` — Porta 5000)**
   Escrito em Python. Converte a resposta textual do LLM em áudio usando a API Edge-TTS (vozes neurais).

4. **Scraper API (`scrapper_api.js` — Porta 3000)**
   Módulo sob demanda acionado via *Function Calling* pela IA para buscar dados (Google/Serper) em tempo real na internet.

5. **I.A. Local**
   Integração agnóstica via API compatível com OpenAI, otimizada para servidores locais como **LM Studio**.

## Tecnologias Utilizadas

* **Node.js & Discord.js:** Gerenciamento do bot e fluxos de áudio em tempo real.
* **Python & Flask:** APIs REST internas de baixíssima latência.
* **Faster-Whisper:** Transcrição *Speech-to-Text* (STT) ultrarrápida.
* **Edge-TTS:** Geração de *Text-to-Speech* (TTS) de alta qualidade.
* **SciPy & NumPy:** Tratamento matemático de decimação de áudio e *anti-aliasing* (48 kHz → 16 kHz) diretamente na memória RAM.

## Pré-requisitos e Hardware

* **Node.js** (v18+) e **Python** (v3.10+).
* **FFmpeg:** Obrigatório estar instalado e adicionado ao `PATH` do sistema operacional.
* **Placa de vídeo (opcional, mas recomendada):** O projeto foi arquitetado e testado para aceleração nativa em placas NVIDIA utilizando **CUDA 12.1** para executar inferências acústicas sem gargalos na CPU.

## Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/SeuUsuario/Discord-Voice-Bot.git
cd bot
```

### 2. Instale as dependências do Node.js

```bash
npm install
```

### 3. Instale as dependências do Python

```bash
pip install flask faster-whisper edge-tts numpy scipy
```

## Configuração

Renomeie o arquivo `.env.example` para `.env` e preencha com as suas credenciais:

```env
# Gateway Discord
TOKEN=seu_token_do_discord_aqui
CLIENT_ID=seu_client_id_aqui
OWNER_ID=seu_id_de_usuario_do_discord_aqui

# Conexão com LLM Local
LM_STUDIO_URL=http://localhost:1234/v1

# Motores de Busca (Scraper API)
MOTOR_DE_BUSCA=SERPER
SERPER_API_KEY=sua_chave_serper
```

> **Nota:** Acesse `serper.dev` para conseguir sua API Serper para web scraping (2.500 requisições gratuitas sem necessidade de cartão de crédito).

### Configuração da GPU

**Nota para usuários de GPU:** Caso seu Toolkit do CUDA esteja em um diretório não padrão, atualize a variável `cublas_path` dentro dos arquivos `voz_api.py` e `falar_api.py`.

## Uso

O ecossistema é gerenciado de forma automatizada por um orquestrador em lote.

1. Abra o seu servidor de LLM local (ex.: **LM Studio**).
2. Carregue seu modelo de preferência.
3. Inicie o **Local Server** na porta `1234`.

> **Nota:** Para melhor desempenho, use modelos de **4B a 8B parâmetros**.

4. Execute o arquivo `start_bot.bat`.

O script inicializará automaticamente as APIs do **Scraper, STT e TTS**, aguardará o aquecimento dos modelos neurais e conectará o bot ao Discord.

## Comandos Principais no Discord

### `!entrar`

O bot entrará no seu canal de voz atual e começará a ouvir e responder ativamente por áudio.

### `/chat [mensagem]`

Conversa por texto mantendo o histórico da sessão.

### `/reset`

Apaga o histórico de memória de curto prazo do bot.

### `/config`

Permite reescrever o *System Prompt* de comportamento dinamicamente.
