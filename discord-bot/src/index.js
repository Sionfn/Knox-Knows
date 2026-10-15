// Knox Knows Discord bot — /ask in #study-help.
import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import { loadConfig } from './config.js';
import { Limits } from './limits.js';
import { askKnox } from './knox.js';
import { Lessons } from './lessons.js';
import { Plus } from './plus.js';
import { createHandlers, noPings } from './ask.js';

const config = loadConfig();
const plus = new Plus({ config });
const handlers = createHandlers({ config, limits: new Limits(config), lessons: new Lessons(config), askKnox, plus });

// Slash commands only: no message content intent needed.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async c => {
  console.log(`Knox bot online as ${c.user.tag}`);
  // Keep the commands registered with Discord, so nobody has to run a setup step.
  try {
    const route = config.guildId ? Routes.applicationGuildCommands(config.appId, config.guildId) : Routes.applicationCommands(config.appId);
    await new REST().setToken(config.token).put(route, { body: commands });
    console.log(`Commands registered ${config.guildId ? 'to the server' : 'globally (can take up to an hour to appear)'}`);
  } catch (err) {
    console.error('Could not register commands:', err.message);
  }
  // Every 6 hours, take the Knox Plus role back from anyone whose Plus ended.
  if (config.guildId) {
    const sweep = () => c.guilds.fetch(config.guildId).then(guild => plus.sweep(guild)).catch(err => console.error('Plus sweep failed:', err.message));
    setInterval(sweep, 6 * 3600_000);
    sweep();
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'ask') await handlers.ask(interaction);
    else if (interaction.isChatInputCommand() && interaction.commandName === 'link') await handlers.link(interaction);
    else if (interaction.isChatInputCommand() && interaction.commandName === 'help') await handlers.help(interaction);
    else if (interaction.isButton() && interaction.customId === 'checkplus') await handlers.checkPlus(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('reply:')) await handlers.replyButtonClicked(interaction);
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('answer:')) await handlers.replySubmitted(interaction);
  } catch (err) {
    console.error('Unexpected interaction error:', err);
    const message = { content: 'Something went wrong on my end. Please try again.', allowedMentions: noPings };
    if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ ...message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
await client.login(config.token);
