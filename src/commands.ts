import type { PlainMessage, SlashCommand } from '@towns-protocol/proto'

const commands = [
    {
        name: 'help',
        description: 'Get help with bot commands',
    },
    {
        name: 'start',
        description: 'Start a new game (requires tip)',
    },
    {
        name: 'choose1',
        description: 'Choose option 1',
    },
    {
        name: 'choose2',
        description: 'Choose option 2',
    },
    {
        name: 'choose3',
        description: 'Choose option 3',
    },
    {
        name: 'choose4',
        description: 'Choose option 4',
    },
    {
        name: 'status',
        description: 'Check your current game status',
    },
    {
        name: 'leaderboard',
        description: 'View the current leaderboard',
    },
] as const satisfies PlainMessage<SlashCommand>[]

export default commands
