// Knox Plus from the website: links Discord accounts to Knox accounts and
// keeps the Knox Plus role in step with who's actually subscribed.
import { createHmac } from 'node:crypto';
import { loadJson, saveJson } from './store.js';

const CACHE_MS = 10 * 60_000;
const LINK_MINUTES = 15;

export class Plus {
  constructor({ config, fetch = globalThis.fetch }) {
    this.config = config;
    this.fetch = fetch;
    this.statusUrl = new URL('/api/discord-link', config.knoxApiUrl).href;
    this.cache = new Map(); // discordId → { plus, linked, at }
    this.grantsFile = config.dataFile.replace(/(\.json)?$/, '-plus-roles.json');
    this.granted = new Set(loadJson(this.grantsFile) || []); // roles the bot gave, so it only removes those
  }

  // A one-time website link that connects this Discord account to a Knox account.
  linkUrl(discordId, now = Date.now()) {
    const expires = Math.floor(now / 1000) + LINK_MINUTES * 60;
    const signature = createHmac('sha256', this.config.knoxBotKey).update(`discord-link:${discordId}:${expires}`).digest('base64url');
    const url = new URL('/app', this.config.knoxApiUrl);
    url.searchParams.set('discord', `${discordId}.${expires}.${signature}`);
    return url.href;
  }

  // { discordId: { linked, plus } } from the website. Throws if it can't be reached.
  async statuses(discordIds, { fresh = false } = {}) {
    const now = Date.now();
    const results = {};
    const missing = discordIds.filter(id => {
      const hit = this.cache.get(id);
      if (!fresh && hit && now - hit.at < CACHE_MS) results[id] = hit;
      return !results[id];
    });
    for (let i = 0; i < missing.length; i += 100) {
      const res = await this.fetch(this.statusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Knox-Bot-Key': this.config.knoxBotKey },
        body: JSON.stringify({ action: 'status', discordIds: missing.slice(i, i + 100) }),
        signal: AbortSignal.timeout(fresh ? 10_000 : 1_500), // /ask must answer Discord within 3 seconds
      });
      if (!res.ok) throw new Error(`Knox Plus check failed (${res.status})`);
      const { results: page } = await res.json();
      for (const [id, status] of Object.entries(page)) {
        results[id] = { ...status, at: now };
        this.cache.set(id, results[id]);
      }
    }
    return results;
  }

  // Website Plus for one person, or null if the website couldn't be reached.
  async isPlus(discordId, options) {
    try { return (await this.statuses([discordId], options))[discordId]?.plus === true; }
    catch (err) { console.error(err.message); return null; }
  }

  // Give or take the Knox Plus role to match. Returns 'added', 'removed',
  // 'kept' (no change needed) or 'no-permission'.
  async syncRole(member, plus) {
    const roleId = this.config.plusRoleId;
    if (!roleId || !member?.roles?.cache || plus === null) return 'kept';
    const hasRole = member.roles.cache.has(roleId);
    try {
      if (plus && !hasRole) {
        await member.roles.add(roleId, 'Knox Plus subscriber (linked with /link)');
        this.#setGranted(member.id, true);
        return 'added';
      }
      // Only take back a role the bot gave; people given it by hand keep it.
      if (!plus && hasRole && this.granted.has(member.id)) {
        await member.roles.remove(roleId, 'Knox Plus subscription ended');
        this.#setGranted(member.id, false);
        return 'removed';
      }
    } catch (err) {
      console.error(`Could not update the Knox Plus role for ${member.id}: ${err.message}`);
      return 'no-permission';
    }
    return 'kept';
  }

  // Every few hours: take the role back from anyone whose Plus ended.
  async sweep(guild) {
    const ids = [...this.granted];
    if (!ids.length) return;
    let results;
    try { results = await this.statuses(ids, { fresh: true }); }
    catch (err) { return console.error('Knox Plus sweep skipped:', err.message); }
    for (const id of ids) {
      if (results[id]?.plus) continue;
      const member = await guild.members.fetch(id).catch(() => null);
      if (member) await this.syncRole(member, false);
      else this.#setGranted(id, false); // left the server
    }
  }

  #setGranted(id, on) {
    if (on) this.granted.add(id); else this.granted.delete(id);
    saveJson(this.grantsFile, [...this.granted]);
  }
}
