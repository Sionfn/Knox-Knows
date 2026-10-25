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
    this.megaGrantsFile = config.dataFile.replace(/(\.json)?$/, '-mega-roles.json');
    this.grantedMega = new Set(loadJson(this.megaGrantsFile) || []);
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

  // /unlink: disconnect this Discord account from its Knox account.
  async unlink(discordId) {
    const res = await this.fetch(this.statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Knox-Bot-Key': this.config.knoxBotKey },
      body: JSON.stringify({ action: 'unlink', discordId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Unlink failed (${res.status})`);
    this.cache.delete(discordId);
    return (await res.json()).wasLinked === true;
  }

  // Website Plus for one person, or null if the website couldn't be reached.
  async isPlus(discordId, options) {
    try { return (await this.statuses([discordId], options))[discordId]?.plus === true; }
    catch (err) { console.error(err.message); return null; }
  }

  // The website plan for one person: 'free' | 'plus' | 'mega', or null if the
  // website couldn't be reached. (An older website without "tier" reports plus only.)
  async tier(discordId, options) {
    try {
      const status = (await this.statuses([discordId], options))[discordId];
      return status?.tier || (status?.plus ? 'plus' : 'free');
    } catch (err) { console.error(err.message); return null; }
  }

  // Give or take the Mega Knox role to match (only removes a role the bot gave).
  async syncMegaRole(member, mega) {
    const roleId = this.config.megaRoleId;
    if (!roleId || !member?.roles?.cache || mega === null) return 'kept';
    const hasRole = member.roles.cache.has(roleId);
    try {
      if (mega && !hasRole) {
        await member.roles.add(roleId, 'Mega Knox member (linked with /link)');
        this.grantedMega.add(member.id); saveJson(this.megaGrantsFile, [...this.grantedMega]);
        return 'added';
      }
      if (!mega && hasRole && this.grantedMega.has(member.id)) {
        await member.roles.remove(roleId, 'Mega Knox ended');
        this.grantedMega.delete(member.id); saveJson(this.megaGrantsFile, [...this.grantedMega]);
        return 'removed';
      }
    } catch (err) {
      console.error(`Could not update the Mega Knox role for ${member.id}: ${err.message}`);
      return 'no-permission';
    }
    return 'kept';
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
