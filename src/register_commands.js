const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'chat',
    description: 'Conversar com a IA mantendo o contexto da sessão.',
    options: [
      {
        name: 'message',
        description: 'Sua mensagem',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ]
  },
  {
    name: 'request',
    description: 'Fazer uma pergunta isolada à IA sem gerar histórico.',
    options: [
      {
        name: 'message',
        description: 'Sua pergunta',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ]
  },
  {
    name: 'config',
    description: 'Configurar o System Prompt base da IA.',
    options: [
      {
        name: 'message',
        description: 'Novo comportamento ou personalidade',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ]
  },
  {
    name: 'prompt',
    description: 'Visualizar o prompt base atual.',
  },
  {
    name: 'reset',
    description: 'Apagar a memória da conversa atual e restaurar as regras.',
  },
  {
    name: 'help',
    description: 'Exibir a lista de comandos e utilidades.',
  },
  {
    name: 'directresponse',
    description: 'Ativar resposta automática para TODAS as mensagens do canal.',
    options: [
      {
        name: 'value',
        description: 'True (ligado) / False (desligado)',
        type: ApplicationCommandOptionType.Boolean,
        required: true,
      },
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registrando comandos (/) da aplicação...');

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });

    console.log('Comandos registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar os comandos:', error);
  }
})();