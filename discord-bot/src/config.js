// Reads settings from the environment. Fails fast on anything required.

function required(name) {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

function number(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number.`);
  return value;
}

export function loadConfig() {
  return {
    token:          required('DISCORD_TOKEN'),
    appId:          required('DISCORD_APP_ID'),
    guildId:        (process.env.DISCORD_GUILD_ID || '').trim() || null,
    studyChannelId: (process.env.STUDY_HELP_CHANNEL_ID || '1557948470852321290').trim(),
    plusRoleId:     (process.env.KNOX_PLUS_ROLE_ID || '').trim() || null,
    megaRoleId:     (process.env.KNOX_MEGA_ROLE_ID || '').trim() || null,
    knoxApiUrl:     required('KNOX_API_URL'),
    knoxBotKey:     required('KNOX_BOT_KEY'),
    perUserLimit:   number('DAILY_QUESTIONS_PER_USER', 5),
    globalCap:      number('DAILY_GLOBAL_CAP', 200),
    dataFile:       process.env.DATA_FILE || './data/usage.json',
  };
}
