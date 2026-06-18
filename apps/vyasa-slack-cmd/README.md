# Vyasa Slack Command

Slack slash command (`/vyasa`) that queries the Vyasa RAG service.

## Local Development

### Prerequisites

1. **Slack App Setup** (optional for local testing):
   - Go to https://api.slack.com/apps
   - Create new app → "From scratch"
   - Enable **Slash Commands** → Create `/vyasa`
   - Get `Signing Secret` from App Credentials

2. **ngrok** (required for Slack to reach your local server):
   ```bash
   brew install ngrok
   ngrok authtoken YOUR_TOKEN
   ```

### Setup

1. Copy environment file:

   ```bash
   cp apps/vyasa-slack-cmd/.env.local.example apps/vyasa-slack-cmd/.env.local
   ```

2. Edit `.env.local`:
   - Set `DEV_MODE=true` to skip signature verification (for local testing)
   - Optionally set `SLACK_SIGNING_SECRET` if you want to test real signature verification

3. Start the server:

   ```bash
   npx nx serve vyasa-slack-cmd
   ```

4. Expose to internet (in another terminal):

   ```bash
   ngrok http 3000
   ```

5. **If using real Slack** (not dev mode):
   - Update `/vyasa` slash command Request URL to: `https://YOUR_NGROK_URL/`

### Testing

**Local health check:**

```bash
curl http://localhost:3000/health
```

**Test with real Slack:**

- Type `/vyasa Who was Karna?` in your Slack channel

**Test without Slack (using curl):**

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "command=/vyasa&text=Who+was+Karna%3F&response_url=https://hooks.slack.com/test&user_id=U123&channel_id=C123&team_id=T123"
```

## Architecture

```
Slack /vyasa → ngrok → Local Express → Vyasa RAG API → Slack response_url
```

- **receiver** (server.ts): Handles Slack slash command, verifies signature, sends immediate ack
- **worker**: Calls RAG API, posts answer to Slack's response_url

## Commands

- `npx nx build vyasa-slack-cmd` - Build for production (Lambda)
- `npx nx test vyasa-slack-cmd` - Run unit tests
- `npx nx serve vyasa-slack-cmd` - Run local dev server
