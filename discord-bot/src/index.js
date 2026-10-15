// Knox Knows Discord bot — /ask in #study-help.
import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import { loadConfig } from './config.js';
import { Limits } from './limits.js';
import { askKnox } from './knox.js';
import { createAskHandler, noPings } from './ask.js';

const config = loadConfig();
const handleAsk = createAskHandler({ config, limits: new Limits(config), askKnox });

// Slash commands only: no message content intent needed.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async c => {
  console.log(`Knox bot online as ${c.user.tag}`);
  // Keep /ask registered with Discord, so nobody has to run a setup step.
  try {
    const route = config.guildId ? Routes.applicationGuildCommands(config.appId, config.guildId) : Routes.applicationCommands(config.appId);
    await new REST().setToken(config.token).put(route, { body: commands });
    console.log(`/ask registered ${config.guildId ? 'to the server' : 'globally (can take up to an hour to appear)'}`);
  } catch (err) {
    console.error('Could not register /ask:', err.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'ask') return;
  try {
    await handleAsk(interaction);
  } catch (err) {
    console.error('Unexpected /ask error:', err);
    const message = { content: 'Something went wrong on my end. Please try again.', allowedMentions: noPings };
    if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ ...message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
await client.login(config.token);
