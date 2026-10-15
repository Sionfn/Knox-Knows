import { SlashCommandBuilder } from 'discord.js';

export const askCommand = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask Knox for help with schoolwork (in #study-help)')
  .addStringOption(option => option
    .setName('question')
    .setDescription('What are you stuck on?')
    .setRequired(true)
    .setMaxLength(1500));

export const commands = [askCommand.toJSON()];
