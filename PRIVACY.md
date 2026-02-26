# Privacy Policy

**Last updated:** 2026-02-23

**Bot:** Antartica — Peril Bot
**Developer:** Stefano Vetrini — [stefanovetrini.itch.io](https://stefanovetrini.itch.io)

---

## 1. What Data We Collect

The bot collects the **minimum data necessary** to operate:

| Data                    | Purpose                                         | Retention                 |
| ----------------------- | ----------------------------------------------- | ------------------------- |
| Discord User ID         | Identify the Lead; enforce button authorization | Session lifetime (max 6h) |
| Discord Channel ID      | Scope sessions to originating channel           | Session lifetime (max 6h) |
| Discord Guild ID        | Scope sessions and threat pool to guild         | Until manually cleared    |
| Tag text and objectives | Temporary session Pouch and draw state          | Session lifetime (max 6h) |

## 2. What We Do NOT Collect

- Personally identifiable information beyond Discord IDs
- Message content (only slash command options are processed)
- Extraction results or draw outcomes in any persistent log
- Voice or presence data
- Any data outside of slash command interactions

## 3. Data Retention

**Sessions** expire automatically after **6 hours** (configurable via `SESSION_TTL_HOURS`).
When using in-memory storage (default), all session data is lost on bot restart.

**Threat Pools** persist until a server administrator explicitly calls `/threats clear`.

## 4. Data Sharing

We do **not** sell, share, or transfer any data to third parties.

If Redis storage is enabled, session data is stored in Upstash's cloud service, which has
its own privacy policy. The bot owner is responsible for configuring Redis appropriately.

## 5. Your Rights (GDPR / CCPA)

You may request:

- **Access**: what data is stored about you (contact developer)
- **Deletion**: removal of your data (use `/peril end` or contact developer)

For requests, open an issue on the GitHub repository or contact the developer.

## 6. Discord Compliance

This bot operates within [Discord's Terms of Service](https://discord.com/terms) and
[Community Guidelines](https://discord.com/guidelines). Server administrators are
responsible for ensuring the bot is used appropriately within their servers.

## 7. Changes

This policy may be updated. The **Last updated** date reflects the most recent revision.

## 8. Contact

- **Repository:** https://github.com/ningod/antartica-peril-bot
- **Developer:** https://stefanovetrini.itch.io
