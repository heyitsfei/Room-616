# Room 616 - Interactive Thriller RPG Bot

A text-based mystery/thriller RPG built on Towns Protocol. Players navigate through 10-20 decisions in a dark, psychological thriller story. Each ending has a unique score, and the player with the highest score at the end of each round wins the prize pool (all tips collected).

## Game Overview

**Room 616** is an interactive narrative game where:
- Players wake in a dark room and must escape before their "number is called"
- Each decision affects player stats (trust, sanity, insight, system access, morality)
- 100+ unique endings generated dynamically by GPT
- Tip-to-play entry mechanic
- Winner takes all prize pool at end of each round

## Features

- **10-20 Decision Story Loop**: Navigate through a thrilling narrative
- **GPT-Generated Content**: Dynamic scenes and 100+ unique endings
- **Player State System**: Track trust, sanity, insight, system access, morality, and time
- **Score-Based Competition**: Backend-computed scores determine winners
- **Prize Pool System**: All tips collected go to the highest-scoring player
- **Leaderboard**: Track top players and their endings

## Setup

### Prerequisites

- Node.js 18+ or Bun
- OpenAI API key
- Towns Protocol bot credentials

### Installation

1. Install dependencies:
```bash
bun install
# or
yarn install
```

2. Create `.env` file:
```bash
cp .env.sample .env
```

3. Configure environment variables:
```env
APP_PRIVATE_DATA=<your_towns_bot_private_data>
JWT_SECRET=<your_jwt_secret>
OPENAI_API_KEY=<your_openai_api_key>
GPT_MODEL=gpt-4o  # Optional, defaults to gpt-4o
PORT=3000  # Optional, defaults to 3000
```

### Running the Bot

Development (with hot reload):
```bash
bun run dev
# or
yarn dev
```

Production:
```bash
bun run start
# or
yarn start
```

## Game Commands

- `/start` - Start a new game (requires tip)
- `/status` - Check your current game status
- `/leaderboard` - View the current leaderboard
- `/choose1` - Choose option 1
- `/choose2` - Choose option 2
- `/choose3` - Choose option 3
- `/choose4` - Choose option 4
- `/help` - Show help message

## How to Play

1. **Tip the bot** to enter the game (any amount goes to prize pool)
2. **Make choices** using `/choose1`, `/choose2`, etc. when presented with options
3. **Navigate** through 10-20 decisions
4. **Reach an ending** and get your score
5. **Win the prize pool** if you have the highest score when the round ends

## Game Mechanics

### Player State Variables

- **time_remaining** (12→0): Turns left before "number is called"
- **trust** (-3→+3): Determines ally vs. betrayal scenes
- **sanity** (0-100): Stability under pressure
- **insight** (0-100): Knowledge gathered
- **system_access** (0-3): System control level
- **morality** (-100→+100): Ethical decisions weight
- **turn** (1-20): Current progress

### Scoring System

Scores are computed authoritatively by the backend:
- Base score: 100
- Bonus for insight, system access, trust, morality
- Penalty for low sanity
- Final score determines tier (S, A, B, C, D)

### Round System

- Each round lasts until at least one player finishes
- All tips collected during the round go to the highest-scoring player
- New rounds start automatically when previous round ends

## Architecture

```
[Towns Chat UI]
   ↕ (slash commands + tips)
[Bot Runtime]
   ├── Session Manager
   ├── GPT Client (OpenAI)
   ├── Score Engine
   ├── Prize Pool Manager
   └── Leaderboard Service
```

## Storage

The bot uses in-memory storage (Maps) for:
- Active game sessions
- Round state and prize pools
- Leaderboard entries

This is suitable for always-on VPS hosting. For production with persistence requirements, consider migrating to Redis or PostgreSQL.

## Development

### Project Structure

```
src/
  ├── index.ts          # Main bot handlers
  ├── commands.ts       # Slash command definitions
  └── game/
      ├── types.ts      # Type definitions
      ├── state.ts      # Game state management
      ├── session.ts    # Session and round management
      ├── scoring.ts    # Score calculation
      └── gpt.ts        # OpenAI GPT integration
```

### Adding Features

- **New Commands**: Add to `src/commands.ts` and implement handler in `src/index.ts`
- **New Game Mechanics**: Modify `src/game/state.ts` and `src/game/scoring.ts`
- **GPT Prompts**: Update prompts in `src/game/gpt.ts`

## TODO / Future Enhancements

- [ ] Implement prize distribution via Towns tipping contract
- [ ] Add persistent storage (Redis/PostgreSQL) for production
- [ ] Add caching for GPT-generated endings
- [ ] Implement season reset functionality
- [ ] Add admin commands for managing rounds
- [ ] Add statistics tracking (average scores, popular endings, etc.)

## License

MIT
