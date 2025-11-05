export interface PlayerState {
    time_remaining: number; // 12 → 0
    trust: number; // -3 → +3
    sanity: number; // 0-100
    insight: number; // 0-100
    system_access: number; // 0-3
    morality: number; // -100 → +100
    turn: number; // 1-20
}

export interface GameSession {
    sessionId: string;
    userId: string; // User's identity address (from basePayload)
    smartAccountAddress: string; // User's smart contract address (senderAddress)
    displayName?: string; // User's display name if available
    channelId: string;
    state: PlayerState;
    startedAt: Date;
    tipAmount: bigint; // Amount tipped to enter
    actionHistory: string[]; // Last 10 actions
    isActive: boolean;
    endingId?: string;
    finalScore?: number;
}

export interface GPTSceneResponse {
    scene_text: string;
    state_changes: Partial<PlayerState>;
    choices: string[];
    hint?: string;
    image_url?: string; // Optional image URL if generated
}

export interface GPTEndingResponse {
    ending_id: string;
    ending_title: string;
    ending_text: string;
    proposed_score: number;
}

export interface EndingResult {
    ending_id: string;
    ending_title: string;
    ending_text: string;
    final_score: number;
    tier: 'S' | 'A' | 'B' | 'C' | 'D';
}

export interface LeaderboardEntry {
    season_id: string;
    session_id: string;
    wallet: string;
    score: number;
    ending_id: string;
    tier: string;
    timestamp: Date;
}

export interface RoundState {
    roundId: string;
    seasonId: string;
    prizePool: bigint; // Total tips collected
    activePlayers: Set<string>; // userIds still playing
    completedPlayers: Map<string, EndingResult>; // userId -> ending result
    startedAt: Date;
    isActive: boolean;
}

