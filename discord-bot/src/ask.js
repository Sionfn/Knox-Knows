// Slash commands and buttons: /ask (with the Reply button), /link and /help.
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { KnoxError, MAX_PHOTO_BYTES, PHOTO_TYPES, downloadPhoto as defaultDownloadPhoto } from './knox.js';
import { MAX_REPLIES } from './lessons.js';
import { splitMessage } from './split.js';

// Never ping anyone from text a student typed (e.g. "@everyone").
export const noPings = { parse: [] };

const quote = text => '> ' + text.slice(0, 300).replace(/\n/g, '\n> ') + (text.length > 300 ? '…' : '');

const replyButton = lessonId => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`reply:${lessonId}`).setLabel('Reply to Knox').setEmoji('💬').setStyle(ButtonStyle.Primary));

// Without a website connection (e.g. in tests), Plus comes from the role alone.
const roleOnly = { isPlus: async () => null, syncRole: async () => 'kept', granted: new Set() };

export function createHandlers({ config, limits, lessons, askKnox, plus = roleOnly, downloadPhoto = defaultDownloadPhoto }) {
  // Plus = a linked Knox Plus subscription, or the Knox Plus role (unless the
  // bot gave that role and the subscription has since ended). Also keeps the
  // role in step with the subscription.
  async function isPlusMember(interaction) {
    const userId = interaction.user.id;
    const websitePlus = await plus.isPlus(userId);
    plus.syncRole(interaction.member, websitePlus).catch(() => {});
    const roleCounts = hasPlusRole(interaction.member, config.plusRoleId) && !(websitePlus === false && plus.granted.has(userId));
    return websitePlus === true || roleCounts;
  }

  const privately = (interaction, text) =>
    interaction.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: noPings });

  // Ask Knox and post the answer (split if long), with a Reply button on the last part.
  // Returns the answer, or null after telling the student what went wrong.
  // photo: the student's photo to send to Knox. showPhoto posts it with the
  // answer (on the first answer, not on every reply).
  async function answer(interaction, { question, history, photo, showPhoto = true, header, footer, lessonIdFor, onFail }) {
    let text, photoBytes;
    try {
      if (photo) {
        // On a reply, carry on without the photo if its link has expired.
        photoBytes = showPhoto ? await downloadPhoto(photo.url) : await downloadPhoto(photo.url).catch(() => undefined);
      }
      text = await askKnox({ apiUrl: config.knoxApiUrl, botKey: config.knoxBotKey, question, history, image: photoBytes?.toString('base64'), imageType: photo?.contentType, discordUserId: interaction.user.id });
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
    // Show the student's photo with the answer (Discord's own link to it expires).
    const files = photoBytes && showPhoto ? { files: [{ attachment: photoBytes, name: photo.name || 'homework.png' }] } : {};
    await interaction.editReply({ content: parts[0], allowedMentions: noPings, ...files, ...(parts.length === 1 ? button : {}) });
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

    const question = (interaction.options.getString('question') || '').trim();
    const photo = interaction.options.getAttachment?.('photo') || null;
    const photoType = photo?.contentType?.split(';')[0];
    if (!question && !photo) return privately(interaction, 'Add a question, a photo of your homework, or both.');
    if (photo && !PHOTO_TYPES.includes(photoType)) return privately(interaction, 'Photos need to be JPG, PNG, GIF or WebP.');
    if (photo && photo.size > MAX_PHOTO_BYTES) return privately(interaction, 'That photo is too big. Please use one under 3 MB.');

    const userId = interaction.user.id;
    const slot = limits.reserve(userId, await isPlusMember(interaction));
    if (!slot.ok) {
      return privately(interaction, slot.reason === 'global'
        ? 'Knox has answered all the questions it can for today. Try again tomorrow, or use https://knoxknowsapp.com.'
        : `You've used your ${config.perUserLimit} questions for today. They reset at midnight UTC. Knox Plus members get unlimited questions.`);
    }

    // Knox can take a while; deferring gives us up to 15 minutes to answer.
    await interaction.deferReply();
    // Plus members are unlimited anyway, so only free members hear that replies are free.
    const left = slot.remaining === null
      ? 'Knox Plus · unlimited questions'
      : `${slot.remaining} of ${config.perUserLimit} questions left today · Replies to this lesson are free`;
    await answer(interaction, {
      question, history: [], photo: photo && { url: photo.url, name: photo.name, contentType: photoType },
      header: question ? quote(question) : '> 📷 Photo question',
      footer: () => `-# ${left}`,
      // The lesson keeps the photo's link so every reply can show it to Knox again
      // (a worksheet has many problems; Knox needs to keep reading it).
      lessonIdFor: text => lessons.start(userId, photo ? [question, '📷 Photo'].filter(Boolean).join('\n') : question, text,
        photo && { url: photo.url, contentType: photoType }),
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
      // Replies never use a daily question; Plus members just see their plan.
      const label = await isPlusMember(interaction) ? 'Knox Plus' : "Lesson reply · doesn't use a question";
      await answer(interaction, {
        question: reply, history: [...lesson.history], photo: lesson.photo, showPhoto: false,
        header: `<@${interaction.user.id}>\n${quote(reply)}`,
        footer: () => repliesLeft > 0
          ? `-# ${label} · ${repliesLeft} ${repliesLeft === 1 ? 'reply' : 'replies'} left in this lesson`
          : '-# That was the last reply in this lesson. Use /ask to start a new one.',
        lessonIdFor: text => { lessons.addReply(lessonId, reply, text); return repliesLeft > 0 ? lessonId : null; },
        onFail: () => limits.refundGlobal(),
      });
    } finally {
      lessons.busy.delete(lessonId);
    }
  }

  // ── /link: connect a Knox account ──
  async function link(interaction) {
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Connect Knox Knows').setStyle(ButtonStyle.Link).setURL(plus.linkUrl(interaction.user.id)),
      new ButtonBuilder().setCustomId('checkplus').setLabel('Check my Plus').setEmoji('✅').setStyle(ButtonStyle.Secondary));
    await interaction.reply({
      content: [
        '**Connect your Knox Knows account**',
        '1. Click **Connect Knox Knows** and sign in (the link works for 15 minutes and only for you).',
        '2. Come back here and click **Check my Plus**.',
        '',
        'Knox Plus members get unlimited questions here and the Knox Plus role, automatically.',
      ].join('\n'),
      components: [buttons], flags: MessageFlags.Ephemeral, allowedMentions: noPings,
    });
  }

  // ── Check my Plus button ──
  async function checkPlus(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const isPlus = await plus.isPlus(interaction.user.id, { fresh: true });
    if (isPlus === null) return interaction.editReply("I couldn't reach Knox Knows just now. Please try again in a minute.");
    const role = await plus.syncRole(interaction.member, isPlus);
    if (isPlus) {
      return interaction.editReply(role === 'no-permission'
        ? "You've got Knox Plus! Your questions here are unlimited. (I couldn't give you the Knox Plus role. Ask a moderator to check my permissions.)"
        : "You've got Knox Plus! 🎉 Your questions here are unlimited and you have the Knox Plus role.");
    }
    const linked = (await plus.statuses([interaction.user.id]).catch(() => ({})))[interaction.user.id]?.linked;
    return interaction.editReply(linked
      ? 'Your Knox account is connected, but it doesn\'t have Knox Plus. Get it at https://knoxknowsapp.com and run this check again.'
      : "Your Knox account isn't connected yet. Use the **Connect Knox Knows** button from /link, sign in, then check again.");
  }

  // ── /help ──
  async function help(interaction) {
    await interaction.reply({
      content: [
        '**How to use Knox here** 🦊',
        `• \`/ask\` in <#${config.studyChannelId}>: ask about any schoolwork. Knox guides you with hints so you learn it, instead of just giving answers.`,
        '• 📷 Stuck on a worksheet? Add a **photo** to `/ask` (with or without a question).',
        '• **💬 Reply to Knox**: answer Knox\'s question to keep the lesson going. Replies are free.',
        `• Everyone gets **${config.perUserLimit} questions a day** (resets at midnight UTC). Knox Plus members get unlimited.`,
        '• `/link`: connect your Knox Knows account to get your Knox Plus perks here.',
        '',
        'Knox won\'t help during a test or exam, but it\'ll gladly help you study for the next one. More at https://knoxknowsapp.com',
      ].join('\n'),
      flags: MessageFlags.Ephemeral, allowedMentions: noPings,
    });
  }

  return { ask, replyButtonClicked, replySubmitted, link, checkPlus, help };
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
