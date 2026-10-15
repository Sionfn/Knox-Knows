// The /ask command: checks the channel and limits, asks Knox, posts the answer.
import { MessageFlags } from 'discord.js';
import { KnoxError } from './knox.js';
import { splitMessage } from './split.js';

// Never ping anyone from text a student typed (e.g. "@everyone").
export const noPings = { parse: [] };

export function createAskHandler({ config, limits, askKnox }) {
  return async function handleAsk(interaction) {
    const privately = text => interaction.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: noPings });

    // Only in #study-help (or a thread inside it).
    const inStudyHelp = interaction.channelId === config.studyChannelId || interaction.channel?.parentId === config.studyChannelId;
    if (!inStudyHelp) return privately(`Ask me in <#${config.studyChannelId}> 📚`);

    const userId = interaction.user.id;
    const slot = limits.reserve(userId, hasPlusRole(interaction.member, config.plusRoleId));
    if (!slot.ok) {
      return privately(slot.reason === 'global'
        ? 'Knox has answered all the questions it can for today. Try again tomorrow, or use https://knoxknowsapp.com.'
        : `You've used your ${config.perUserLimit} questions for today. They reset at midnight UTC. Knox Plus members get unlimited questions.`);
    }

    // Knox can take a while; deferring gives us up to 15 minutes to answer.
    await interaction.deferReply();

    const question = interaction.options.getString('question', true).trim();
    let answer;
    try {
      answer = await askKnox({ apiUrl: config.knoxApiUrl, botKey: config.knoxBotKey, question, discordUserId: userId });
    } catch (err) {
      limits.refund(userId);
      if (!(err instanceof KnoxError)) console.error('Knox request failed:', err);
      const reason = err instanceof KnoxError ? err.message : 'Something went wrong on my end. Please try again.';
      return interaction.editReply({ content: `${reason} (This one didn't count toward your daily questions.)`, allowedMentions: noPings });
    }

    const footer = slot.remaining === null
      ? '-# Knox Plus · unlimited questions'
      : `-# ${slot.remaining} of ${config.perUserLimit} questions left today`;
    const quoted = '> ' + question.slice(0, 300).replace(/\n/g, '\n> ') + (question.length > 300 ? '…' : '');
    const [first, ...rest] = splitMessage(`${quoted}\n\n${answer}\n\n${footer}`);

    await interaction.editReply({ content: first, allowedMentions: noPings });
    for (const part of rest) await interaction.followUp({ content: part, allowedMentions: noPings });
  };
}

function hasPlusRole(member, plusRoleId) {
  if (!plusRoleId || !member) return false;
  // A cached GuildMember has a role manager; a raw API member has an array of IDs.
  return Array.isArray(member.roles) ? member.roles.includes(plusRoleId) : member.roles.cache.has(plusRoleId);
}
