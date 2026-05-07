import { NextRequest, NextResponse } from "next/server";

// GET /api/skills/bootstrap          -> Claude Code SKILL.md (default)
// GET /api/skills/bootstrap?tool=codex -> Codex CLI prompt file
// No auth required — this is the entry point for first-time setup
export async function GET(request: NextRequest) {
  const tool = new URL(request.url).searchParams.get("tool");

  if (tool === "codex") {
    return new NextResponse(codexPromptMd, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  return new NextResponse(claudeSkillMd, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

const claudeSkillMd = `---
name: noticomax
description: Push or pull Claude Code skills (and Codex CLI prompts) to/from NoticoMax cloud so they can be shared across computers. Use when you want to backup, share, or sync your custom skills.
argument-hint: "[push|pull|list] [skill-name] (optional)"
allowed-tools: "Bash Read Write Glob Grep"
---

# Sync Claude Code Skills with NoticoMax

## Overview

This skill pushes and pulls Claude Code custom skills to/from the NoticoMax API so they're available on any computer where you're logged in to NoticoMax.

On \`pull\`, both Claude skills AND Codex CLI prompts are downloaded — Claude skills go to \`~/.claude/skills/\` and Codex prompts go to \`~/.codex/prompts/\`.

## How it works

1. The user's NoticoMax session token is read from the config file at \`~/.noticomax-claude\` (JSON with \`{ "sessionToken": "...", "apiUrl": "..." }\`)
2. Claude skills are read from \`~/.claude/skills/\` (personal) and \`.claude/skills/\` (project)
3. The API at \`/api/skills\` stores skills in the NoticoMax cloud, tagged with \`tool: "claude"\` or \`tool: "codex"\`

## Action: \`$0\`
Skill name filter: \`$1\`

## Instructions

### Step 0: Load config

Read \`~/.noticomax-claude\` to get the session token and API URL.

- If the file doesn't exist, ask the user for their NoticoMax session token
- Tell them they can get it by opening browser dev tools on noticomax.com and running: \`localStorage.getItem("noticomax_session")\`
- Save the config to \`~/.noticomax-claude\` as \`{ "sessionToken": "<token>", "apiUrl": "https://www.noticomax.com" }\`
- Use the \`apiUrl\` from config for all API calls (default: \`https://www.noticomax.com\`)

### If action is \`push\` (or no action specified)

This action pushes Claude skills only. To push Codex prompts, use \`$noticomax push\` inside Codex CLI (Codex prompts use a \`$\` prefix, not \`/\`).

1. Find all skills to push:
   - If a skill name was provided (\`$1\`), only push that one
   - Otherwise, scan \`~/.claude/skills/*/SKILL.md\` for personal skills
   - Also scan \`.claude/skills/*/SKILL.md\` in the current project (if it exists)
   - SKIP the \`noticomax\` skill itself (don't push the bootstrap skill)
2. For each skill found:
   - Read \`SKILL.md\` and parse the YAML frontmatter (between \`---\` markers) and the markdown body
   - Read any other files in the skill directory as supporting files
   - POST to \`{apiUrl}/api/skills\` with Authorization header \`Bearer {sessionToken}\`:
     \`\`\`json
     {
       "tool": "claude",
       "name": "skill-name",
       "description": "from frontmatter",
       "frontmatter": { "all": "frontmatter fields" },
       "content": "markdown body after frontmatter",
       "supportingFiles": [{ "filename": "reference.md", "content": "..." }],
       "tags": ["personal or project:dirname"],
       "isPublic": false
     }
     \`\`\`
3. Report which skills were pushed and whether each was created or updated

### If action is \`pull\`

Pull downloads BOTH Claude skills and Codex prompts from the cloud, writing each to its proper location.

1. GET \`{apiUrl}/api/skills\` with Authorization header \`Bearer {sessionToken}\`
   - If a skill name was provided, add \`?search={name}\` to filter
   - Do NOT add a \`tool\` query param — the response includes both Claude and Codex items
2. For each skill returned, branch on its \`tool\` field (defaulting to \`"claude"\` if absent):
   - If \`tool === "codex"\`:
     - Reconstruct the prompt: if \`frontmatter\` is non-empty, prepend it as YAML between \`---\` markers; otherwise just the \`content\`
     - Write to \`~/.codex/prompts/{name}.md\` (create the directory if needed)
   - Otherwise (Claude skill):
     - Ask the user whether to install as personal (\`~/.claude/skills/{name}/\`) or project (\`.claude/skills/{name}/\`)
     - Reconstruct \`SKILL.md\` by combining frontmatter and content:
       \`\`\`
       ---
       {yaml frontmatter}
       ---

       {content}
       \`\`\`
     - Write supporting files to the same directory
3. Report which Claude skills and Codex prompts were installed and where

### If action is \`list\`

1. GET \`{apiUrl}/api/skills?public=true\` with Authorization header \`Bearer {sessionToken}\`
2. Display a table of available skills:
   - Tool | Name | Description | Tags | Last Updated | Yours?

## API Reference

All endpoints require \`Authorization: Bearer {sessionToken}\` header.

- \`GET /api/skills\` - List skills. Query params: \`search\`, \`tag\`, \`public=true\`, \`tool=claude|codex\` (omit to get both)
- \`POST /api/skills\` - Create/upsert a skill (by name + tool). Body: \`{ tool, name, description, frontmatter, content, supportingFiles, tags, isPublic }\`. \`tool\` defaults to \`"claude"\`.
- \`GET /api/skills/{skillId}\` - Get a single skill
- \`PUT /api/skills/{skillId}\` - Update a skill
- \`DELETE /api/skills/{skillId}\` - Delete a skill

## Important

- Use \`curl\` for API calls
- When parsing YAML frontmatter, split on the first two \`---\` lines
- Preserve the exact content of skills — do not modify, format, or "improve" them
- If auth fails (401), tell the user their session may have expired and they need to re-login on noticomax.com
`;

const codexPromptMd = `# Sync Codex CLI Prompts with NoticoMax

Push or pull Codex CLI prompts to/from the NoticoMax cloud so they can be shared across computers.

This prompt was installed at \`~/.codex/prompts/noticomax.md\`. Invoke it from Codex CLI as \`$noticomax [push|pull|list] [name]\` (Codex prompts use a \`$\` prefix, not \`/\`). The first argument after \`$noticomax\` is the action; the second is an optional name filter.

## How it works

1. Read the user's NoticoMax session token from \`~/.noticomax-codex\` (JSON: \`{ "sessionToken": "...", "apiUrl": "..." }\`).
2. Codex prompts are stored in \`~/.codex/prompts/*.md\` — each file is a single prompt.
3. The NoticoMax API at \`/api/skills\` stores them in the cloud tagged with \`tool: "codex"\`.

## Step 0: Load config

Read \`~/.noticomax-codex\`. If it doesn't exist:

- Ask the user for their NoticoMax session token (they can get it from noticomax.com via browser dev tools: \`localStorage.getItem("noticomax_session")\`).
- Save \`{ "sessionToken": "<token>", "apiUrl": "https://www.noticomax.com" }\` to \`~/.noticomax-codex\`.

Use the \`apiUrl\` from config (default: \`https://www.noticomax.com\`) for all API calls.

## Action: push (default)

1. Find all prompts to push:
   - If a name argument was given, only push \`~/.codex/prompts/{name}.md\`.
   - Otherwise scan all \`~/.codex/prompts/*.md\` files.
   - SKIP the \`noticomax.md\` file itself.
2. For each prompt file:
   - The whole file is the \`content\`. If the file starts with a \`---\` YAML block, parse that as \`frontmatter\` and use the body as \`content\`; otherwise \`frontmatter\` is \`{}\`.
   - The \`name\` is the filename without \`.md\`.
   - The \`description\` is the first non-empty line after any frontmatter (strip leading \`#\`), truncated to 200 chars.
   - POST to \`{apiUrl}/api/skills\` with header \`Authorization: Bearer {sessionToken}\`:
     \`\`\`json
     {
       "tool": "codex",
       "name": "prompt-name",
       "description": "first line",
       "frontmatter": {},
       "content": "full prompt body",
       "supportingFiles": [],
       "tags": ["codex"],
       "isPublic": false
     }
     \`\`\`
3. Report which prompts were pushed and whether each was created or updated.

## Action: pull

Pull downloads BOTH Codex prompts and Claude skills (so the cloud stays in sync across tools), but only Codex prompts are written by default. Claude skills are reported but NOT written to disk unless the user confirms.

1. GET \`{apiUrl}/api/skills\` with \`Authorization: Bearer {sessionToken}\`. Add \`?search={name}\` if a name was given.
2. For each item returned, branch on its \`tool\` field (default \`"claude"\`):
   - If \`tool === "codex"\`: reconstruct the prompt (frontmatter as YAML between \`---\` markers if non-empty, then content) and write to \`~/.codex/prompts/{name}.md\`.
   - If \`tool === "claude"\`: list the skill name and ask the user whether to also install it to \`~/.claude/skills/{name}/SKILL.md\`. If yes, write SKILL.md (frontmatter + content) and any supporting files. If no, skip.
3. Report what was installed and where.

## Action: list

GET \`{apiUrl}/api/skills?public=true\` with the auth header and print a table:

\`Tool | Name | Description | Tags | Updated | Yours?\`

## API reference

All endpoints require \`Authorization: Bearer {sessionToken}\`.

- \`GET /api/skills\` — list (params: \`search\`, \`tag\`, \`public=true\`, \`tool=claude|codex\`).
- \`POST /api/skills\` — upsert by \`(name, tool)\`. Body: \`{ tool, name, description, frontmatter, content, supportingFiles, tags, isPublic }\`.
- \`GET|PUT|DELETE /api/skills/{skillId}\` — single-item CRUD.

## Notes

- Use \`curl\` for API calls.
- Preserve the exact content of prompts — do not modify or reformat them.
- If auth fails with 401, tell the user their session may have expired and they should re-login at noticomax.com.
`;
