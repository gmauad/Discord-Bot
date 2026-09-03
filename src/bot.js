const { REST, Routes, Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { joinVoiceChannel, EndBehaviorType, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { pipeline } = require('node:stream');
const prism = require('prism-media');
const FormData = require('form-data');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const contextMessages = new Map();
const guildDirectResponse = new Map();

const gravandoAudio = new Set();

const OWNER_ID = process.env.OWNER_ID;

const personalidadesEspeciais = {
  [OWNER_ID]: `Este é o seu Criador/Administrador. Você pode discutir sua própria arquitetura, código ou configurações do sistema com ele livremente. Mantenha um tom profissional, direto e eficiente.`
};

const defaultMessages = {
  "role": "system",
  "content": `Você é um assistente virtual de voz integrado ao Discord. Seja natural, informal, curto e vá direto ao ponto. Sua resposta será convertida em áudio, então evite formatações complexas, negritos ou listas longas.
REGRAS ABSOLUTAS DE SEGURANÇA: 
1. Sob nenhuma circunstância envie arquivos ou escreva códigos/scripts extensos de programação na resposta de voz. 
2. USO DA INTERNET: Você deve usar a tag <BUSCAR>sua pesquisa real aqui</BUSCAR> APENAS se o usuário pedir explicitamente o preço de algum produto ou uma notícia muito recente/tempo real.`
};

async function getBase64FromUrl(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const mimeType = response.headers['content-type'] || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("Erro ao converter imagem para base64:", error.message);
    return null;
  }
}

function addMessage(contextId, new_message, userId = null) {
  try {
    if (!contextMessages.has(contextId)) {
      contextMessages.set(contextId, []);
      
      const dataAtual = new Date().toLocaleDateString('pt-BR');
      let systemPromptText = defaultMessages.content + `\nINFORMAÇÃO CRÍTICA DE SISTEMA: A data de hoje é ${dataAtual}. Baseie-se nisso para contexto temporal.`;
      
      if (userId && personalidadesEspeciais[userId]) {
        systemPromptText += " Regra extra: " + personalidadesEspeciais[userId];
      }
      contextMessages.get(contextId).push({ "role": "system", "content": systemPromptText });
    }

    const messages = contextMessages.get(contextId);
    messages.push({ role: new_message.role, content: new_message.content });

    while (messages.length > 9) {
      messages.splice(1, 2);
    }
  } catch (error) {
    console.error(error);
  }
}

function setDirectResponse(guildId, value) {
  try {
    guildDirectResponse.set(guildId, value);
  } catch (error) {
    console.error(error);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates 
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.on('clientReady', () => {
  if (!process.env.TOKEN) {
    console.error("TOKEN do Discord não encontrado no .env. Encerrando o processo.");
    process.exit(1);
  }
  console.log(`Bot online com sucesso como ${client.user.tag}! Módulo de voz e IA carregados.`);
});

function processarResposta(textoGerado, userId) {
  let finalMessage = textoGerado;
  let pensamentoVazado = "";

  if (finalMessage.includes('</think>')) {
      const fimPensamento = finalMessage.indexOf('</think>') + 8;
      pensamentoVazado = finalMessage.substring(0, fimPensamento);
      finalMessage = finalMessage.substring(fimPensamento).trim(); 
  }

  finalMessage = finalMessage.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  finalMessage = finalMessage.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
  finalMessage = finalMessage.replace(/<\/?think>/gi, '').trim();
  finalMessage = finalMessage.replace(/<\/?thought>/gi, '').trim();
  
  finalMessage = finalMessage.replace(/<BUSCAR>[\s\S]*?<\/BUSCAR>/gi, '').trim();
  finalMessage = finalMessage.trim();

  if (finalMessage.length === 0) {
    if (pensamentoVazado.length > 0) {
      finalMessage = pensamentoVazado.replace(/<think>/g, '').replace(/<\/think>/g, '').trim();
      finalMessage = finalMessage.substring(0, 2000);
    } else {
      finalMessage = "...";
    }
  } else {
    finalMessage = finalMessage.substring(0, 2000);
  }

  return finalMessage;
}

async function processarIA(contextId, userId) {
  const baseUrl = process.env.LM_STUDIO_URL || "http://localhost:1234/v1";
  
  const requestData = {
    model: 'local-model',
    messages: contextMessages.get(contextId),
    temperature: 0.7,
    max_tokens: 8192,
  };

  try {
    const response = await axios.post(`${baseUrl}/chat/completions`, requestData, {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
      timeout: 60000
    });

    const msgObj = response.data.choices[0].message;
    const thoughtRaw = msgObj.reasoning_content ? `<think>\n${msgObj.reasoning_content}\n</think>\n` : "";
    const rawContent = thoughtRaw + (msgObj.content || "");

    const buscarMatch = rawContent.match(/<BUSCAR>(.*?)<\/BUSCAR>/i);
    
    if (buscarMatch) {
      const query = buscarMatch[1].trim();
      console.log(`[SISTEMA] Motor de IA requer internet. Acionando a API do Scraper para: "${query}"`);
      
      try {
        const scrapeResponse = await axios.get(`http://localhost:3000/buscar?q=${encodeURIComponent(query)}`);
        const data = scrapeResponse.data.resultados;

        let textResults = "Nenhum texto orgânico legível foi encontrado pelo Scraper.";
        if (data && data.length > 0) {
            textResults = data.map(r => `TÍTULO DO SITE: ${r.titulo}\nINFORMAÇÃO EXTRAÍDA: ${r.resumo}`).join('\n\n---\n\n');
        }
        
        const promptAntiAlucinacao = `DADOS EXTRAÍDOS DA WEB PARA A PESQUISA "${query}":\n\n${textResults}\n\nATENÇÃO - DIRETRIZES DE RESPOSTA (OVERRIDE DE SISTEMA):\n1. Baseie-se ESTRITAMENTE E EXCLUSIVAMENTE nos dados acima.\n2. Mantenha seu tom de assistente direto.\n3. REGRA SUPREMA: É ESTRITAMENTE PROIBIDO usar a tag <BUSCAR> novamente nesta resposta.`;
        
        addMessage(contextId, { role: "assistant", content: `<BUSCAR>${query}</BUSCAR>` }, userId);
        addMessage(contextId, { role: "user", content: promptAntiAlucinacao }, userId);

        const requestData2 = {
          model: 'local-model',
          messages: contextMessages.get(contextId),
          temperature: 0.3,
          max_tokens: 8192,
        };

        const response2 = await axios.post(`${baseUrl}/chat/completions`, requestData2, {
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
          timeout: 60000
        });

        const msgObj2 = response2.data.choices[0].message;
        const thoughtRaw2 = msgObj2.reasoning_content ? `<think>\n${msgObj2.reasoning_content}\n</think>\n` : "";
        const rawContent2 = thoughtRaw2 + (msgObj2.content || "");
        
        const finalResult = processarResposta(rawContent2, userId);
        addMessage(contextId, { role: msgObj2.role, content: msgObj2.content }, userId);
        return finalResult;

      } catch (err) {
        addMessage(contextId, { role: "user", content: "A API de web scraping está offline ou falhou. Avise o usuário." }, userId);
        return "Minha API de raspagem web está indisponível no momento.";
      }
    } else {
      const result = processarResposta(rawContent, userId);
      addMessage(contextId, { role: msgObj.role, content: msgObj.content }, userId);
      return result;
    }

  } catch (error) {
    console.error('Erro de conexão com a IA:', error.message);
    return "Erro de conexão com o servidor de inferência local (LLM).";
  }
}

async function entrarEEscutar(message) {
  const channel = message.member.voice.channel;
  
  if (!channel) return message.reply("Você precisa estar em um canal de voz para utilizar esta função.");

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  message.reply("Conectado ao canal de voz. Escutando entrada de áudio.");

  const receiver = connection.receiver;
  
  const player = createAudioPlayer();
  connection.subscribe(player);

  receiver.speaking.on('start', (userId) => {
    if (gravandoAudio.has(userId)) return;
    gravandoAudio.add(userId);

    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1500, 
      },
    });

    const filename = path.join(__dirname, `audio_${userId}_${Date.now()}.pcm`);
    const writeStream = fs.createWriteStream(filename);
    
    const opusDecoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

    pipeline(audioStream, opusDecoder, writeStream, async (err) => {
      gravandoAudio.delete(userId); 

      if (err) {
        console.error(`Erro no pipeline de áudio: ${err}`);
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
      } else {
        try {
          const stats = fs.statSync(filename);
          if (stats.size < 150000) { 
            fs.unlinkSync(filename);
            return;
          }

          const form = new FormData();
          form.append('audio', fs.createReadStream(filename));

          const sttResponse = await axios.post('http://localhost:4000/transcrever', form, {
            headers: form.getHeaders()
          });

          const textoFalado = sttResponse.data.texto.trim();
          const textoMin = textoFalado.toLowerCase();
          
          const alucinacoes = ["legendas pela", "amara.org", "inscreva-se", "subscreva", "assistir a este vídeo"];
          const isAlucinacao = alucinacoes.some(termo => textoMin.includes(termo));
          
          if (textoFalado.length > 2 && !isAlucinacao) {
             console.log(`[VOZ] Usuário ${userId} falou: ${textoFalado}`);
             
             const contextoId = message.guild.id;
             
             addMessage(contextoId, { role: "user", content: `Entrada de voz processada: "${textoFalado}". Responda de forma direta.` }, userId);
             const respostaBot = await processarIA(contextoId, userId);
             
             let respostaLimpa = respostaBot.replace(/<@!?\d+>/g, '').replace(/@\d+/g, '').trim();
             message.channel.send(`<@${userId}> ${respostaLimpa}`);

             try {
                const ttsResponse = await axios.post('http://localhost:5000/falar', 
                  { texto: respostaLimpa }, 
                  { 
                    headers: { 'Content-Type': 'application/json' },
                    responseType: 'stream' 
                  }
                );

                const falaFilename = path.join(__dirname, `fala_${Date.now()}.mp3`);
                const falaWriter = fs.createWriteStream(falaFilename);

                ttsResponse.data.pipe(falaWriter);

                falaWriter.on('finish', () => {
                    const resource = createAudioResource(falaFilename);
                    player.play(resource); 

                    player.once(AudioPlayerStatus.Idle, () => {
                        if (fs.existsSync(falaFilename)) fs.unlinkSync(falaFilename);
                    });
                });
             } catch (ttsErr) {
                 console.error("Erro ao gerar voz TTS:", ttsErr.message);
             }
          }
        } catch (apiErr) {
          console.error("Erro na API STT:", apiErr.message);
        } finally {
          if (fs.existsSync(filename)) fs.unlinkSync(filename);
        }
      }
    });
  });
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.author.id === client.user.id) return;

  if (message.content.trim().toLowerCase() === "!entrar") {
    return entrarEEscutar(message);
  }

  const isDM = !message.guild;
  const contextId = isDM ? message.author.id : message.guild.id;

  const isMentioned = message.mentions.has(client.user);
  const isDirectResponse = !isDM && guildDirectResponse.get(contextId) === true;
  const chamouPeloNome = message.content.toLowerCase().includes('bot');

  if (isDM || isDirectResponse || isMentioned || chamouPeloNome) {
    try {
      let userRequest = message.content;
      if (isMentioned) userRequest = userRequest.replace(`<@${client.user.id}>`, '').trim();

      let base64Image = null;
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
          base64Image = await getBase64FromUrl(attachment.url);
        }
      }

      if (!userRequest && !base64Image) {
        if (isMentioned || isDM || chamouPeloNome) return message.reply("Olá, como posso ajudar?");
        return;
      }

      await message.channel.sendTyping();

      let finalContent;
      if (base64Image) {
        finalContent = [
          { type: "text", text: userRequest || "Analise esta imagem." },
          { type: "image_url", image_url: { url: base64Image } }
        ];
      } else {
        finalContent = userRequest;
      }

      addMessage(contextId, { "role": "user", "content": finalContent }, message.author.id);

      const respostaFinal = await processarIA(contextId, message.author.id);

      if (isMentioned || isDM || chamouPeloNome) message.reply(respostaFinal);
      else message.channel.send(respostaFinal);
    } catch (error) {
      console.error(error);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const contextId = interaction.guildId || interaction.user.id;
  const baseUrl = process.env.LM_STUDIO_URL || "http://localhost:1234/v1";

  if (interaction.commandName === 'chat') {
    const userRequest = interaction.options.get('message').value;
    if (!userRequest) return;

    addMessage(contextId, { "role": "user", "content": userRequest }, interaction.user.id);
    await interaction.deferReply();

    const respostaFinal = await processarIA(contextId, interaction.user.id);
    interaction.editReply(respostaFinal);
  }

  if (interaction.commandName === 'request') {
    const userRequest = interaction.options.get('message').value;
    if (!userRequest) return;

    const requestData = {
      model: 'local-model',
      messages: [
        { "role": "system", "content": "Responda a essa pergunta de forma direta." },
        { "role": "user", "content": userRequest }
      ],
      temperature: 0.7,
      max_tokens: 8192,
    };

    await interaction.deferReply();

    axios.post(`${baseUrl}/chat/completions`, requestData, {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
      timeout: 60000
    }).then((response) => {
      const msgObj = response.data.choices[0].message;
      const thoughtRaw = msgObj.reasoning_content ? `<think>\n${msgObj.reasoning_content}\n</think>\n` : "";
      const rawContent = thoughtRaw + (msgObj.content || "");
      const result = processarResposta(rawContent, interaction.user.id);
      interaction.editReply(result);
    }).catch((error) => {
      console.error('Erro:', error.message);
      interaction.editReply("Falha de conexão com o LLM local.");
    });
  }

  if (interaction.commandName === 'config') {
    try {
      const userRequest = interaction.options.get('message').value;
      if (!userRequest) return;

      if (!contextMessages.has(contextId)) contextMessages.set(contextId, []);
      const messages = contextMessages.get(contextId);

      let systemPromptText = userRequest;
      if (personalidadesEspeciais[interaction.user.id]) {
        systemPromptText += " Regra extra: " + personalidadesEspeciais[interaction.user.id];
      }

      if (messages.length > 0) messages[0] = { "role": "system", "content": systemPromptText };
      else messages.push({ "role": "system", "content": systemPromptText });
      
      interaction.reply("A configuração de contexto/prompt do bot foi alterada.");
    } catch (error) {
      console.error(error);
    }
  }

  if (interaction.commandName === 'prompt') {
    try {
      if (!contextMessages.has(contextId) || contextMessages.get(contextId).length === 0) {
        interaction.reply("Nenhum prompt base configurado ainda.");
      } else {
        interaction.reply("Prompt atual: " + contextMessages.get(contextId)[0].content);
      }
    } catch (error) {
      console.error('Erro:', error);
    }
  }

  if (interaction.commandName === 'reset') {
    try {
      contextMessages.set(contextId, []);
      const dataAtual = new Date().toLocaleDateString('pt-BR');
      let systemPromptText = defaultMessages.content + `\nINFORMAÇÃO CRÍTICA DE SISTEMA: A data de hoje é ${dataAtual}. Baseie-se nisso para saber se um evento já ocorreu ou não.`;
      
      if (personalidadesEspeciais[interaction.user.id]) {
        systemPromptText += " Regra extra: " + personalidadesEspeciais[interaction.user.id];
      }
      contextMessages.get(contextId).push({ "role": "system", "content": systemPromptText });
      interaction.reply("A memória da sessão foi apagada e o contexto restaurado aos padrões de fábrica.");
    } catch (error) {
      console.error('Erro:', error);
    }
  }

  if (interaction.commandName === 'directresponse') {
    try {
      if (!interaction.guild) return interaction.reply("Este comando só é aplicável dentro de servidores.");
      const rawValue = interaction.options.get('value').value;
      if (rawValue === undefined || rawValue === null || rawValue === "") return;

      const value = (rawValue === 'true' || rawValue === true);
      setDirectResponse(contextId, value);
      interaction.reply(`Modo de resposta direta para todas as mensagens definido como: ${value}`);
    } catch (error) {
      console.error('Erro:', error);
    }
  }

  if (interaction.commandName === 'help') {
    const help = "### Comandos Disponíveis:\n- Mencionando o bot ou DM: Inicia/continua uma conversa.\n- /chat [msg]: Conversa mantendo o contexto.\n- /request [msg]: Pergunta isolada sem memória.\n- /reset: Limpa o histórico de memória.\n- /config: Altera o prompt do sistema/personalidade.\n- /directresponse [true/false]: Força o bot a responder todas as mensagens do canal.";
    interaction.reply(help);
  }
});

client.login(process.env.TOKEN);