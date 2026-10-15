// One-off: tells Discord about /ask. Run again only when commands change.
import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';

const token = process.env.DISCORD_TOKEN;
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !appId) throw new Error('Set DISCORD_TOKEN and DISCORD_APP_ID first.');

const rest = new REST().setToken(token);
const route = guildId ? Routes.applicationGuildCommands(appId, guildId) : Routes.applicationCommands(appId);
await rest.put(route, { body: commands });
console.log(`Registered ${commands.length} command(s) ${guildId ? 'to the server (instant)' : 'globally (can take up to an hour)'}.`);
