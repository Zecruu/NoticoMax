---
name: sync-skills
description: Push or pull Claude Code skills to/from NoticoMax cloud so they can be shared across computers. Use when you want to backup, share, or sync your custom Claude skills.
argument-hint: "[push|pull|list] [skill-name] (optional)"
allowed-tools: "Bash Read Write Glob Grep"
---

# Sync Claude Code Skills with NoticoMax

## Overview

This skill pushes and pulls Claude Code custom skills to/from the NoticoMax API so they're available on any computer where you're logged in to NoticoMax.

**API Base URL:** `https://www.noticomax.com`

## How it works

1. The user's NoticoMax session token is read from the config file at `~/.noticomax-claude` (JSON with `{ "sessionToken": "...", "apiUrl": "..." }`)
2. Skills are read from `~/.claude/skills/` (personal) and `.claude/skills/` (project)
3. The API at `/api/skills` stores skills in the NoticoMax cloud

## Action: `$0`
Skill name filter: `$1`

## Instructions

### Step 0: Load config

Read `~/.noticomax-claude` to get the session token and API URL.

- If the file doesn't exist, ask the user for their NoticoMax session token
- Tell them they can get it by opening browser dev tools on noticomax.com and running: `localStorage.getItem("noticomax_session")`
- Save the config to `~/.noticomax-claude` as `{ "sessionToken": "<token>", "apiUrl": "https://www.noticomax.com" }`
- Use the `apiUrl` from config for all API calls (default: `https://www.noticomax.com`)

### If action is `push` (or no action specified)

1. Find all skills to push:
   - If a skill name was provided (`$1`), only push that one
   - Otherwise, scan `~/.claude/skills/*/SKILL.md` for personal skills
   - Also scan `.claude/skills/*/SKILL.md` in the current project (if it exists)
   - SKIP the `noticomax` and `sync-skills` skills themselves (don't push the bootstrap skill)
2. For each skill found:
   - Read `SKILL.md` and parse the YAML frontmatter (between `---` markers) and the markdown body
   - Read any other files in the skill directory as supporting files
   - POST to `{apiUrl}/api/skills` with Authorization header `Bearer {sessionToken}`:
     ```json
     {
       "name": "skill-name",
       "description": "from frontmatter",
       "frontmatter": { ... all frontmatter fields ... },
       "content": "markdown body after frontmatter",
       "supportingFiles": [{ "filename": "reference.md", "content": "..." }],
       "tags": ["personal" or "project:{dirname}"],
       "isPublic": false
     }
     ```
3. Report which skills were pushed and whether each was created or updated

### If action is `pull`

1. GET `{apiUrl}/api/skills` with Authorization header `Bearer {sessionToken}`
   - If a skill name was provided, add `?search={name}` to filter
2. For each skill returned:
   - Ask the user whether to install as personal (`~/.claude/skills/{name}/`) or project (`.claude/skills/{name}/`)
   - Reconstruct `SKILL.md` by combining frontmatter and content:
     ```
     ---
     {yaml frontmatter}
     ---

     {content}
     ```
   - Write supporting files to the same directory
3. Report which skills were installed and where

### If action is `list`

1. GET `{apiUrl}/api/skills?public=true` with Authorization header `Bearer {sessionToken}`
2. Display a table of available skills:
   - Name | Description | Tags | Last Updated | Yours?

## API Reference

All endpoints require `Authorization: Bearer {sessionToken}` header.

- `GET /api/skills` - List skills. Query params: `search`, `tag`, `public=true`
- `POST /api/skills` - Create/upsert a skill (by name). Body: `{ name, description, frontmatter, content, supportingFiles, tags, isPublic }`
- `GET /api/skills/{skillId}` - Get a single skill
- `PUT /api/skills/{skillId}` - Update a skill
- `DELETE /api/skills/{skillId}` - Delete a skill

## Important

- Use `curl` or `WebFetch` for API calls
- When parsing YAML frontmatter, split on the first two `---` lines
- Preserve the exact content of skills — do not modify, format, or "improve" them
- If auth fails (401), tell the user their session may have expired and they need to re-login on noticomax.com
