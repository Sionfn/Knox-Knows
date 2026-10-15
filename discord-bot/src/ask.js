// /ask and the Reply button that continues a lesson.
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { KnoxError } from './knox.js';
import { MAX_REPLIES } from './lessons.js';
import { splitMessage } from './split.js';

// Never ping anyone from text a student typed (e.g. "@everyone").
export const noPings = { parse: [] };

const quote = text => '> ' + text.slice(0, 300).replace(/\n/g, '\n> ') + (text.length > 300 ? '…' : '');

const replyButton = lessonId => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`reply:${lessonId}`).setLabel('Reply to Knox').setEmoji('💬').setStyle(ButtonStyle.Primary));

export function createHandlers({ config, limits, lessons, askKnox }) {
  const privately = (interaction, text) =>
    interaction.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: noPings });

  // Ask Knox and post the answer (split if long), with a Reply button on the last part.
  // Returns the answer, or null after telling the student what went wrong.
  async function answer(interaction, { question, history, header, footer, lessonIdFor, onFail }) {
    let text;
    try {
      text = await askKnox({ apiUrl: config.knoxApiUrl, botKey: config.knoxBotKey, question, history, discordUserId: interaction.user.id });
    } catch (err) {
      onFail();
      if (!(err instanceof KnoxError)) console.error('Knox request failed:', err);
      const reason = err instanceof KnoxError ? err.message : 'Something went wrong on my end. Please try again.';
      await interaction.editReply({ content: `${reason} (This didn't count toward your daily questions.)`, allowedMentions: noPings });
      return null;
    }
    const lessonId = lessonIdFor(text);
    const parts = splitMessage(`${header}\n\n${text}\n\n${footer(lessonId)}`);
    const button = lessonId ? { components: [replyButton(lessonId)] } : {};
    await interaction.editReply({ content: parts[0], allowedMentions: noPings, ...(parts.length === 1 ? button : {}) });
    for (let i = 1; i < parts.length; i++) {
      await interaction.followUp({ content: parts[i], allowedMentions: noPings, ...(i === parts.length - 1 ? button : {}) });
    }
    return text;
  }

  // ── /ask ──
  async function ask(interaction) {
    // Only in #study-help (or a thread inside it).
    const inStudyHelp = interaction.channelId === config.studyChannelId || interaction.channel?.parentId === config.studyChannelId;
    if (!inStudyHelp) return privately(interaction, `Ask me in <#${config.studyChannelId}> 📚`);

    const userId = interaction.user.id;
    const slot = limits.reserve(userId, hasPlusRole(interaction.member, config.plusRoleId));
    if (!slot.ok) {
      return privately(interaction, slot.reason === 'global'
        ? 'Knox has answered all the questions it can for today. Try again tomorrow, or use https://knoxknowsapp.com.'
        : `You've used your ${config.perUserLimit} questions for today. They reset at midnight UTC. Knox Plus members get unlimited questions.`);
    }

    // Knox can take a while; deferring gives us up to 15 minutes to answer.
    await interaction.deferReply();
    const question = interaction.options.getString('question', true).trim();
    const left = slot.remaining === null ? 'Knox Plus · unlimited questions' : `${slot.remaining} of ${config.perUserLimit} questions left today`;
    await answer(interaction, {
      question, history: [], header: quote(question),
      footer: () => `-# ${left} · Replies to this lesson are free`,
      lessonIdFor: text => lessons.start(userId, question, text),
      onFail: () => limits.refund(userId),
    });
  }

  // ── Reply button: open a box to type an answer ──
  async function replyButtonClicked(interaction) {
    const lessonId = interaction.customId.slice('reply:'.length);
    const lesson = lessons.get(lessonId);
    const problem = lessonProblem(lesson, interaction.user.id);
    if (problem) return privately(interaction, problem);

    const input = new TextInputBuilder()
      .setCustomId('reply').setLabel('Your answer or question').setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1500).setRequired(true);
    await interaction.showModal(new ModalBuilder()
      .setCustomId(`answer:${lessonId}`).setTitle('Reply to Knox')
      .addComponents(new ActionRowBuilder().addComponents(input)));
  }

  // ── Reply box submitted: continue the lesson ──
  async function replySubmitted(interaction) {
    const lessonId = interaction.customId.slice('answer:'.length);
    const lesson = lessons.get(lessonId);
    const problem = lessonProblem(lesson, interaction.user.id);
    if (problem) return privately(interaction, problem);
    if (lessons.busy.has(lessonId)) return privately(interaction, 'Knox is still answering your last reply. One sec!');
    if (!limits.reserveGlobal()) {
      return privately(interaction, 'Knox has answered all the questions it can for today. Try again tomorrow, or use https://knoxknowsapp.com.');
    }

    lessons.busy.add(lessonId);
    try {
      await interaction.deferReply();
      const reply = interaction.fields.getTextInputValue('reply').trim();
      const repliesLeft = MAX_REPLIES - lesson.replies - 1;
      await answer(interaction, {
        question: reply, history: [...lesson.history],
        header: `<@${interaction.user.id}>\n${quote(reply)}`,
        footer: () => repliesLeft > 0
          ? `-# Lesson reply · free · ${repliesLeft} ${repliesLeft === 1 ? 'reply' : 'replies'} left in this lesson`
          : '-# That was the last reply in this lesson. Use /ask to start a new one.',
        lessonIdFor: text => { lessons.addReply(lessonId, reply, text); return repliesLeft > 0 ? lessonId : null; },
        onFail: () => limits.refundGlobal(),
      });
    } finally {
      lessons.busy.delete(lessonId);
    }
  }

  return { ask, replyButtonClicked, replySubmitted };
}

// Why a student can't reply to this lesson, or null if they can.
function lessonProblem(lesson, userId) {
  if (!lesson) return 'This lesson has ended (they last 2 hours). Use /ask to start a new one.';
  if (lesson.ownerId !== userId) return 'Only the student who asked can reply to this lesson. Use /ask to start your own!';
  if (lesson.replies >= MAX_REPLIES) return `This lesson has used all ${MAX_REPLIES} replies. Use /ask to start a new one.`;
  return null;
}

function hasPlusRole(member, plusRoleId) {
  if (!plusRoleId || !member) return false;
  // A cached GuildMember has a role manager; a raw API member has an array of IDs.
  return Array.isArray(member.roles) ? member.roles.includes(plusRoleId) : member.roles.cache.has(plusRoleId);
}
