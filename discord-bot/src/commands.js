import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Knox: a full step-by-step answer (in #study-help)')
    .addStringOption(option => option
      .setName('question')
      .setDescription('What are you stuck on?')
      .setMaxLength(1500))
    .addAttachmentOption(option => option
      .setName('photo')
      .setDescription('A photo of your homework (JPG, PNG, GIF or WebP, under 3 MB)')),
  new SlashCommandBuilder()
    .setName('learn')
    .setDescription('Learn mode: Knox teaches you step by step with hints (in #study-help)')
    .addStringOption(option => option
      .setName('question')
      .setDescription('What do you want to learn?')
      .setMaxLength(1500))
    .addAttachmentOption(option => option
      .setName('photo')
      .setDescription('A photo of your homework (JPG, PNG, GIF or WebP, under 3 MB)')),
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Connect your Knox Knows account to get your Knox Plus perks here'),
  new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Disconnect your Knox Knows account from Discord'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to use Knox in this server'),
].map(command => command.toJSON());
