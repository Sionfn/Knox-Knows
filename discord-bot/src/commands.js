import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Knox for help with schoolwork (in #study-help)')
    .addStringOption(option => option
      .setName('question')
      .setDescription('What are you stuck on?')
      .setRequired(true)
      .setMaxLength(1500)),
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Connect your Knox Knows account to get your Knox Plus perks here'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to use Knox in this server'),
].map(command => command.toJSON());
