# NoticoMax Claude Handoff

Coordinate with other Claude instances working on NoticoMax. Each "resume" is a numbered
message stored in MongoDB. Any Claude with the admin secret can read, post, and prune.

## Before doing anything

**Load the admin secret from `.env` and determine your identity:**

```bash
SECRET=$(grep '^ADMIN_SECRET=' .env | cut -d'=' -f2- | tr -d '"')
if [ -z "$SECRET" ]; then echo "ERROR: ADMIN_SECRET not found in .env"; exit 1; fi
case "$(uname -s)" in
  Darwin*) ME=mac-claude ;;
  Linux*) ME=linux-claude ;;
  MINGW*|CYGWIN*|MSYS*) ME=windows-claude ;;
  *) ME=$(uname -s | tr '[:upper:]' '[:lower:]')-claude ;;
esac
API=https://app.noticomax.com/api/claude-handoff
```

Keep these variables available for the rest of the session.

## Parse `$ARGUMENTS`

Figure out what the user wants based on the first word:

| Input                          | Action                                               |
| ------------------------------ | ---------------------------------------------------- |
| *(empty)*                      | Fetch the latest resume and catch up                 |
| `list` or `list N`             | List recent resumes (default 10)                     |
| `since N`                      | Show resumes posted after #N                         |
| `show N`                       | Show a specific resume                               |
| `post`                         | Draft and post a new resume for the user to review   |
| `delete N`                     | Delete a specific resume                             |
| `cleanup N`                    | Keep only the most recent N; delete older            |

## Action: fetch latest (default)

```bash
curl -sS -H "Authorization: Bearer $SECRET" "$API/latest"
```

Show the returned JSON's `content` to the user, headlined with
`Resume #<number> by <author> at <createdAt>`. Then:

1. Read `CLAUDE_HANDOFF.md` in the repo for any additional pinned context.
2. Tell the user what you understand from the latest resume.
3. Propose what you'll do next, then wait for confirmation before code changes.

## Action: list

```bash
curl -sS -H "Authorization: Bearer $SECRET" "$API?limit=${N:-10}"
```

Render a compact table: `#<number>  <author>  <createdAt>  <first 80 chars of content>`.

## Action: since

```bash
curl -sS -H "Authorization: Bearer $SECRET" "$API?since=$N"
```

Show each resume's full content in ascending order.

## Action: show

```bash
curl -sS -H "Authorization: Bearer $SECRET" "$API/$N"
```

## Action: post

1. Draft a resume in markdown covering:
   - What was accomplished this session (with commit hashes if any)
   - What's still open
   - Any gotchas or environment changes the next Claude should know about
2. Show the draft to the user and ask "Post this as resume by `$ME`? (y/n/edit)"
3. On confirmation, escape the content for JSON (use `jq -Rs .` if available, else pass
   via a heredoc) and POST:

```bash
CONTENT=$(cat <<'EOF'
<your drafted markdown>
EOF
)
BODY=$(jq -n --arg author "$ME" --arg content "$CONTENT" --argjson tags '[]' \
  '{author: $author, content: $content, tags: $tags}')
curl -sS -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  "$API" -d "$BODY"
```

If `jq` isn't installed, fall back to building the JSON with Node:
```bash
BODY=$(node -e "console.log(JSON.stringify({author: process.argv[1], content: process.argv[2], tags: []}))" "$ME" "$CONTENT")
```

Report back the resume number returned by the API.

## Action: delete

```bash
curl -sS -X DELETE -H "Authorization: Bearer $SECRET" "$API/$N"
```

## Action: cleanup

Confirm with user first: "This will delete all but the last $N resumes. Proceed? (y/n)"

```bash
curl -sS -X DELETE -H "Authorization: Bearer $SECRET" "$API?keep_last=$N"
```

Show `deletedCount` from the response.

## Response style

Keep output concise. Don't dump raw JSON unless the user asks — extract the relevant
fields and present them cleanly.
