// Slash commands and buttons: /ask (with the Reply button), /link and /help.
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { KnoxError, MAX_PHOTO_BYTES, PHOTO_TYPES, downloadPhoto as defaultDownloadPhoto } from './knox.js';
import { MAX_REPLIES, REPLIES_BY_TIER } from './lessons.js';
import { splitMessage } from './split.js';
import { formatLearn, parseLearn } from './learn-format.js';

// Never ping anyone from text a student typed (e.g. "@everyone").
export const noPings = { parse: [] };

const quote = text => '> ' + text.slice(0, 300).replace(/\n/g, '\n> ') + (text.length > 300 ? '…' : '');

// Learn lessons: Reply / End lesson. Ask Knox answers: a follow-up, "Teach me this"
// (the same question as a Learn lesson) and Done.
const replyButton = (lessonId, mode = 'learn') => new ActionRowBuilder().addComponents(...(mode === 'answer' ? [
  new ButtonBuilder().setCustomId(`reply:${lessonId}`).setLabel('Ask a follow-up').setEmoji('💬').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`teach:${lessonId}`).setLabel('Teach me this').setEmoji('🎓').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`end:${lessonId}`).setLabel('Done').setEmoji('✅').setStyle(ButtonStyle.Secondary),
] : [
  new ButtonBuilder().setCustomId(`reply:${lessonId}`).setLabel('Reply to Knox').setEmoji('💬').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`end:${lessonId}`).setLabel('End lesson').setEmoji('🏁').setStyle(ButtonStyle.Secondary),
]));
// Ask Knox ends with "Answer: …" (the website's answer box); in Discord it's a ✅ line.
const formatAnswer = text => String(text).replace(/^\s*Answer:\s*(.+)$/gim, (_, a) => `> ✅ **Answer:** ${a.replace(/^\*\*(.*)\*\*$/, '$1').trim()}`);
// Tap-to-answer options from a Learn reply's "Choices:" line (like the website's buttons).
const choiceButtons = (lessonId, choices) => new ActionRowBuilder().addComponents(choices.map((c, i) =>
  new ButtonBuilder().setCustomId(`choice:${lessonId}:${i}`).setLabel(c.replace(/\*\*|`/g, '').slice(0, 80)).setStyle(ButtonStyle.Secondary)));

// Without a website connection (e.g. in tests), Plus comes from the role alone.
const roleOnly = { isPlus: async () => null, tier: async () => null, syncRole: async () => 'kept', granted: new Set() };
const PLAN_NAME = { plus: 'Knox Plus', mega: 'Mega Knox' };

export function createHandlers({ config, limits, lessons, askKnox, plus = roleOnly, downloadPhoto = defaultDownloadPhoto }) {
  // Plus = a linked Knox Plus subscription, or the Knox Plus role (unless the
  // bot gave that role and the subscription has since ended). Also keeps the
  // role in step with the subscription.
  // The member's plan: 'free' | 'plus' | 'mega' — from their linked Knox
  // account (same rules as the website), or their Discord role. Mega members
  // get both the Knox Plus and Mega Knox roles.
  async function memberTier(interaction) {
    const userId = interaction.user.id;
    const websiteTier = plus.tier ? await plus.tier(userId)
      : await plus.isPlus(userId).then(p => p === null ? null : p ? 'plus' : 'free');
    plus.syncRole(interaction.member, websiteTier === null ? null : websiteTier !== 'free').catch(() => {});
    plus.syncMegaRole?.(interaction.member, websiteTier === null ? null : websiteTier === 'mega').catch(() => {});
    if (websiteTier === 'mega' || websiteTier === 'plus') return websiteTier;
    const megaRole = hasPlusRole(interaction.member, config.megaRoleId) && !(websiteTier === 'free' && plus.grantedMega?.has(userId));
    if (megaRole) return 'mega';
    const plusRole = hasPlusRole(interaction.member, config.plusRoleId) && !(websiteTier === 'free' && plus.granted.has(userId));
    return plusRole ? 'plus' : 'free';
  }

  const privately = (interaction, text) =>
    interaction.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: noPings });

  // Ask Knox and post the answer (split if long), with a Reply button on the last part.
  // Returns the answer, or null after telling the student what went wrong.
  // photo: the student's photo to send to Knox. showPhoto posts it with the
  // answer (on the first answer, not on every reply).
  async function answer(interaction, { question, history, photo, showPhoto = true, header, footer, lessonIdFor, onFail, mode = 'learn' }) {
    let text, photoBytes;
    try {
      if (photo) {
        // On a reply, carry on without the photo if its link has expired.
        photoBytes = showPhoto ? await downloadPhoto(photo.url) : await downloadPhoto(photo.url).catch(() => undefined);
      }
      text = await askKnox({ apiUrl: config.knoxApiUrl, botKey: config.knoxBotKey, question, history, image: photoBytes?.toString('base64'), imageType: photo?.contentType, discordUserId: interaction.user.id, learnMode: mode === 'learn' });
    } catch (err) {
      onFail();
      if (!(err instanceof KnoxError)) console.error('Knox request failed:', err);
      const reason = err instanceof KnoxError ? err.message : 'Something went wrong on my end. Please try again.';
      await interaction.editReply({ content: `${reason} (This didn't count toward your daily questions.)`, allowedMentions: noPings });
      return null;
    }
    const lessonId = lessonIdFor(text);
    // Learn marker lines become Discord formatting; choices become buttons.
    const shown = mode === 'learn' ? formatLearn(text) : { text: formatAnswer(text), choices: [] };
    const options = shown.choices.length && !lessonId ? `\n\n**Options:** ${shown.choices.join(' · ')}` : '';
    const parts = splitMessage(`${header}\n\n${shown.text}${options}\n\n${footer(lessonId)}`);
    const button = lessonId ? { components: [...(shown.choices.length ? [choiceButtons(lessonId, shown.choices)] : []), replyButton(lessonId, mode)] } : {};
    // Show the student's photo with the answer (Discord's own link to it expires).
    const files = photoBytes && showPhoto ? { files: [{ attachment: photoBytes, name: photo.name || 'homework.png' }] } : {};
    await interaction.editReply({ content: parts[0], allowedMentions: noPings, ...files, ...(parts.length === 1 ? button : {}) });
    for (let i = 1; i < parts.length; i++) {
      await interaction.followUp({ content: parts[i], allowedMentions: noPings, ...(i === parts.length - 1 ? button : {}) });
    }
    return text;
  }

  // ── /ask (Ask Knox) and /learn (Learn mode) ──
  const ask = interaction => start(interaction, 'answer');
  const learn = interaction => start(interaction, 'learn');
  async function start(interaction, mode) {
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
    const tier = await memberTier(interaction);
    const slot = limits.reserve(userId, tier !== 'free');
    if (!slot.ok) {
      return privately(interaction, slot.reason === 'global'
        ? 'Knox has answered all the questions it can for today. Try again tomorrow, or use https://knoxknowsapp.com.'
        : `You've used your ${config.perUserLimit} questions for today. They reset at midnight UTC. Knox Plus members get unlimited questions.`);
    }

    // Knox can take a while; deferring gives us up to 15 minutes to answer.
    await interaction.deferReply();
    // Plus members are unlimited anyway, so only free members hear that replies are free.
    const left = slot.remaining === null
      ? `${PLAN_NAME[tier] || 'Knox Plus'} · unlimited questions`
      : `${slot.remaining} of ${config.perUserLimit} questions left today · ${mode === 'learn' ? 'Replies to this lesson are free' : 'Follow-ups use a question'}`;
    await answer(interaction, {
      question, history: [], photo: photo && { url: photo.url, name: photo.name, contentType: photoType },
      header: question ? quote(question) : '> 📷 Photo question',
      footer: () => `-# ${left}`,
      // The lesson keeps the photo's link so every reply can show it to Knox again
      // (a worksheet has many problems; Knox needs to keep reading it).
      lessonIdFor: text => lessons.start(userId, photo ? [question, '📷 Photo'].filter(Boolean).join('\n') : question, text,
        photo && { url: photo.url, contentType: photoType }, REPLIES_BY_TIER[tier] || MAX_REPLIES, mode),
      onFail: () => limits.refund(userId), mode,
    });
  }

  // ── Reply button: open a box to type an answer ──
  async function replyButtonClicked(interaction) {
    const lessonId = interaction.customId.slice('reply:'.length);
    const lesson = lessons.get(lessonId);
    const problem = lessonProblem(lesson, interaction.user.id);
    if (problem) return privately(interaction, problem);

    const input = new TextInputBuilder()
      .setCustomId('reply').setLabel(lesson.mode === 'answer' ? 'Your follow-up question' : 'Your answer or question').setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1500).setRequired(true);
    await interaction.showModal(new ModalBuilder()
      .setCustomId(`answer:${lessonId}`).setTitle(lesson.mode === 'answer' ? 'Ask Knox a follow-up' : 'Reply to Knox')
      .addComponents(new ActionRowBuilder().addComponents(input)));
  }

  // ── Reply box submitted: continue the lesson ──
  async function replySubmitted(interaction) {
    const lessonId = interaction.customId.slice('answer:'.length);
    return continueLesson(interaction, lessonId, () => interaction.fields.getTextInputValue('reply').trim());
  }

  // ── "Teach me this" on an Ask Knox answer: the same question as a Learn lesson ──
  async function teachClicked(interaction) {
    const lessonId = interaction.customId.slice('teach:'.length);
    const lesson = lessons.get(lessonId);
    if (!lesson) return privately(interaction, 'This answer has expired (they last 2 hours). Use /learn to start a lesson.');
    if (lesson.ownerId !== interaction.user.id) return privately(interaction, 'Only the student who asked can start this lesson. Use /learn to start your own!');
    if (!limits.reserveGlobal()) return privately(interaction, 'Knox has answered all the questions it can for today. Try again tomorrow, or use https://knoxknowsapp.com.');
    const tier = await memberTier(interaction);
    const question = lesson.history[0].content;
    await interaction.deferReply();
    // Already paid for with the /ask question, so the lesson itself is free.
    await answer(interaction, {
      question, history: [], photo: lesson.photo, showPhoto: false,
      header: `<@${interaction.user.id}> 🎓 **Teach me this**\n${quote(question)}`,
      footer: () => `-# ${PLAN_NAME[tier] || 'Learn lesson'} · Replies to this lesson are free`,
      lessonIdFor: text => lessons.start(interaction.user.id, question, text, lesson.photo, REPLIES_BY_TIER[tier] || MAX_REPLIES, 'learn'),
      onFail: () => limits.refundGlobal(), mode: 'learn',
    });
  }

  // ── A tap-to-answer button: send that choice as the reply ──
  async function choiceClicked(interaction) {
    const [, lessonId, index] = interaction.customId.split(':');
    const lesson = lessons.get(lessonId);
    const last = [...(lesson?.history || [])].reverse().find(m => m.role === 'assistant')?.content;
    const choice = parseLearn(last).choices[Number(index)];
    if (lesson && !choice) return privately(interaction, 'Those options are from an earlier step. Use **Reply to Knox** to answer.');
    return continueLesson(interaction, lessonId, () => choice);
  }

  async function continueLesson(interaction, lessonId, readReply) {
    const lesson = lessons.get(lessonId);
    const problem = lessonProblem(lesson, interaction.user.id);
    if (problem) return privately(interaction, problem);
    if (lessons.busy.has(lessonId)) return privately(interaction, 'Knox is still answering your last reply. One sec!');
    const mode = lesson.mode || 'learn', userId = interaction.user.id;
    const tier = await memberTier(interaction);
    // An Ask Knox follow-up is a new question (like on the website); Learn replies are free.
    const slot = mode === 'answer' ? limits.reserve(userId, tier !== 'free') : { ok: limits.reserveGlobal(), reason: 'global' };
    if (!slot.ok) {
      return privately(interaction, slot.reason === 'global'
        ? 'Knox has answered all the questions it can for today. Try again tomorrow, or use https://knoxknowsapp.com.'
        : `You've used your ${config.perUserLimit} questions for today. They reset at midnight UTC. Knox Plus members get unlimited questions.`);
    }

    lessons.busy.add(lessonId);
    try {
      await interaction.deferReply();
      const reply = readReply();
      const repliesLeft = (lesson.maxReplies || MAX_REPLIES) - lesson.replies - 1;
      // Learn replies never use a daily question; Plus and Mega members just see their plan.
      const label = mode === 'answer'
        ? (slot.remaining == null ? `${PLAN_NAME[tier] || 'Knox Plus'} · unlimited questions` : `${slot.remaining} of ${config.perUserLimit} questions left today`)
        : PLAN_NAME[tier] || "Lesson reply · doesn't use a question";
      await answer(interaction, {
        question: reply, history: [...lesson.history], photo: lesson.photo, showPhoto: false,
        header: `<@${interaction.user.id}>\n${quote(reply)}`,
        footer: () => repliesLeft > 0
          ? (mode === 'answer' ? `-# ${label}` : `-# ${label} · ${repliesLeft} ${repliesLeft === 1 ? 'reply' : 'replies'} left in this lesson`)
          : '-# That was the last reply here. Use /ask or /learn to start a new one.',
        lessonIdFor: text => { lessons.addReply(lessonId, reply, text); return repliesLeft > 0 ? lessonId : null; },
        onFail: () => mode === 'answer' ? limits.refund(userId) : limits.refundGlobal(), mode,
      });
    } finally {
      lessons.busy.delete(lessonId);
    }
  }

  // ── /link: connect a Knox account ──
  async function link(interaction) {
    // Only inside the Knox Knows server: linking here is what unlocks the
    // 🟢 Slime Flame on the website, so it has to mean they joined.
    if (config.guildId && interaction.guildId !== config.guildId) return privately(interaction, "Run `/link` inside the Knox Knows server to connect your account.");
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Connect Knox Knows').setStyle(ButtonStyle.Link).setURL(plus.linkUrl(interaction.user.id)),
      new ButtonBuilder().setCustomId('checkplus').setLabel('Check my Plus').setEmoji('✅').setStyle(ButtonStyle.Secondary));
    await interaction.reply({
      content: [
        '**Connect your Knox Knows account**',
        '1. Click **Connect Knox Knows** and sign in (the link works for 15 minutes and only for you).',
        '2. Come back here and click **Check my Plus**.',
        '',
        'Knox Plus and Mega Knox members get their plan here automatically: unlimited questions, longer lessons, and their role.',
        'Everyone who connects also unlocks the 🟢 **Slime Flame** for their streak on Knox Knows.',
      ].join('\n'),
      components: [buttons], flags: MessageFlags.Ephemeral, allowedMentions: noPings,
    });
  }

  // ── /unlink: disconnect the Knox account ──
  async function unlink(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let wasLinked;
    try { wasLinked = await plus.unlink(interaction.user.id); }
    catch (err) { console.error(err.message); return interaction.editReply("I couldn't reach Knox Knows just now. Please try again in a minute."); }
    if (!wasLinked) return interaction.editReply("Your Discord isn't connected to a Knox Knows account. Use `/link` to connect one.");
    // Their plan no longer counts here: take back the roles the bot gave.
    if (interaction.member) { await plus.syncRole?.(interaction.member, false); await plus.syncMegaRole?.(interaction.member, false); }
    return interaction.editReply('Disconnected. Your Knox Knows account is no longer linked to this Discord, so your plan perks here and the 🟢 Slime Flame are off. Use `/link` any time to connect again.');
  }

  // ── Check my Plus button ──
  async function checkPlus(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const tier = plus.tier ? await plus.tier(interaction.user.id, { fresh: true })
      : await plus.isPlus(interaction.user.id, { fresh: true }).then(p => p === null ? null : p ? 'plus' : 'free');
    if (tier === null) return interaction.editReply("I couldn't reach Knox Knows just now. Please try again in a minute.");
    const role = await plus.syncRole(interaction.member, tier !== 'free');
    const megaRole = await (plus.syncMegaRole?.(interaction.member, tier === 'mega') ?? 'kept');
    if (tier === 'mega') {
      return interaction.editReply(role === 'no-permission' || megaRole === 'no-permission'
        ? `You've got Mega Knox! Your questions here are unlimited and lessons go up to ${REPLIES_BY_TIER.mega} replies. (I couldn't give you your role. Ask a moderator to check my permissions.)`
        : `You've got Mega Knox! 💎 Your questions here are unlimited, lessons go up to ${REPLIES_BY_TIER.mega} replies, and you have the Mega Knox role.`);
    }
    if (tier === 'plus') {
      return interaction.editReply(role === 'no-permission'
        ? `You've got Knox Plus! Your questions here are unlimited and lessons go up to ${REPLIES_BY_TIER.plus} replies. (I couldn't give you the Knox Plus role. Ask a moderator to check my permissions.)`
        : `You've got Knox Plus! 🎉 Your questions here are unlimited, lessons go up to ${REPLIES_BY_TIER.plus} replies, and you have the Knox Plus role.`);
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
        `• \`/ask\` in <#${config.studyChannelId}>: **Ask Knox**. A full step-by-step answer, with the answer at the end. **💬 Ask a follow-up** if something's unclear, or **🎓 Teach me this** to learn it as a lesson.`,
        `• \`/learn\` in <#${config.studyChannelId}>: **Learn mode**. Knox teaches you step by step with hints and questions, so you can do it yourself. **💬 Reply to Knox** (or tap an answer button) to keep going; replies are free. **🏁 End lesson** when you're done.`,
        '• 📷 Stuck on a worksheet? Add a **photo** to `/ask` or `/learn` (with or without a question).',
        `• Everyone gets **${config.perUserLimit} questions a day** (resets at midnight UTC; an Ask Knox follow-up is a question) and ${MAX_REPLIES} replies per Learn lesson. Knox Plus: unlimited questions, ${REPLIES_BY_TIER.plus} replies per lesson. Mega Knox: unlimited questions, ${REPLIES_BY_TIER.mega} replies per lesson.`,
        '• `/link`: connect your Knox Knows account to get your Knox Plus perks here (and the 🟢 Slime Flame). `/unlink` disconnects it.',
        '',
        'Knox won\'t help during a test or exam, but it\'ll gladly help you study for the next one. More at https://knoxknowsapp.com',
      ].join('\n'),
      flags: MessageFlags.Ephemeral, allowedMentions: noPings,
    });
  }

  // ── End lesson button: close the lesson and remove its buttons ──
  async function endLesson(interaction) {
    const lessonId = interaction.customId.slice('end:'.length);
    const lesson = lessons.get(lessonId);
    if (!lesson) return privately(interaction, 'This has already ended. Use /ask or /learn to start a new one.');
    if (lesson.ownerId !== interaction.user.id) return privately(interaction, 'Only the student who asked can end this lesson.');
    if (lessons.busy.has(lessonId)) return privately(interaction, 'Knox is still answering your last reply. One sec!');
    lessons.end(lessonId);
    await interaction.update({
      content: `${interaction.message.content}\n-# ${lesson.mode === 'answer' ? '✅ Done.' : '🏁 Lesson ended. Nice work!'} Use /ask or /learn to start a new one.`,
      components: [], allowedMentions: noPings,
    });
  }

  return { ask, learn, replyButtonClicked, replySubmitted, choiceClicked, teachClicked, endLesson, link, unlink, checkPlus, help };
}

// Why a student can't reply to this lesson, or null if they can.
function lessonProblem(lesson, userId) {
  if (!lesson) return 'This has ended (lessons and answers last 2 hours). Use /ask or /learn to start a new one.';
  if (lesson.ownerId !== userId) return 'Only the student who asked can reply here. Use /ask or /learn to start your own!';
  const max = lesson.maxReplies || MAX_REPLIES;
  if (lesson.replies >= max) return `This has used all ${max} replies. Use /ask or /learn to start a new one.`;
  return null;
}

function hasPlusRole(member, plusRoleId) {
  if (!plusRoleId || !member) return false;
  // A cached GuildMember has a role manager; a raw API member has an array of IDs.
  return Array.isArray(member.roles) ? member.roles.includes(plusRoleId) : member.roles.cache.has(plusRoleId);
}
