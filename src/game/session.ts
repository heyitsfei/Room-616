import type { GameSession, RoundState, LeaderboardEntry, EndingResult } from './types';
import { createInitialState } from './state';

// In-memory storage (for always-on VPS)
const activeSessions = new Map<string, GameSession>(); // userId -> session
const rounds = new Map<string, RoundState>(); // roundId -> round
const leaderboard: LeaderboardEntry[] = [];

let currentRoundId: string | null = null;
let currentSeasonId = `season-${Date.now()}`;

/**
 * Get or create current round
 */
export function getCurrentRound(): RoundState {
    if (!currentRoundId || !rounds.has(currentRoundId)) {
        // Check if we should start a new round
        const lastRound = currentRoundId ? rounds.get(currentRoundId) : null;
        if (lastRound && lastRound.isActive && lastRound.completedPlayers.size === 0) {
            // Round still active but no one finished yet
            return lastRound;
        }
        
        // Start new round
        currentRoundId = `round-${Date.now()}`;
        const newRound: RoundState = {
            roundId: currentRoundId,
            seasonId: currentSeasonId,
            prizePool: 0n,
            activePlayers: new Set(),
            completedPlayers: new Map(),
            startedAt: new Date(),
            isActive: true,
        };
        rounds.set(currentRoundId, newRound);
        return newRound;
    }
    
    return rounds.get(currentRoundId)!;
}

/**
 * Get active session for user (by userId or smartAccountAddress)
 */
export function getSession(identifier: string): GameSession | undefined {
    // Try userId first, then smartAccountAddress (case-insensitive)
    return activeSessions.get(identifier) || activeSessions.get(identifier.toLowerCase());
}

/**
 * Create new game session
 */
export function createSession(
    userId: string,
    smartAccountAddress: string,
    channelId: string,
    tipAmount: bigint,
    displayName?: string
): GameSession {
    const sessionId = `sess-${userId}-${Date.now()}`;
    const session: GameSession = {
        sessionId,
        userId,
        smartAccountAddress,
        displayName,
        channelId,
        state: createInitialState(),
        startedAt: new Date(),
        tipAmount,
        actionHistory: [],
        isActive: true,
    };
    
    // Store session by both userId and smartAccountAddress for lookups
    activeSessions.set(userId, session);
    activeSessions.set(smartAccountAddress.toLowerCase(), session);
    
    // Add to current round
    const round = getCurrentRound();
    round.activePlayers.add(userId);
    round.prizePool += tipAmount;
    
    return session;
}

/**
 * Update session state
 */
export function updateSession(userId: string, updates: Partial<GameSession>): void {
    const session = activeSessions.get(userId);
    if (session) {
        Object.assign(session, updates);
    }
}

/**
 * End session and add to leaderboard
 */
export function endSession(
    userId: string,
    ending: { ending_id: string; ending_title: string; ending_text: string },
    finalScore: number,
    tier: 'S' | 'A' | 'B' | 'C' | 'D'
): void {
    const session = activeSessions.get(userId);
    if (!session) return;
    
    session.isActive = false;
    session.endingId = ending.ending_id;
    session.finalScore = finalScore;
    
    // Update round
    const round = getCurrentRound();
    round.activePlayers.delete(userId);
    round.completedPlayers.set(userId, {
        ending_id: ending.ending_id,
        ending_title: ending.ending_title,
        ending_text: ending.ending_text,
        final_score: finalScore,
        tier,
    });
    
    // Add to leaderboard
    const entry: LeaderboardEntry = {
        season_id: round.seasonId,
        session_id: session.sessionId,
        wallet: userId,
        score: finalScore,
        ending_id: ending.ending_id,
        tier,
        timestamp: new Date(),
    };
    leaderboard.push(entry);
    
    // Check if round should end (at least one player finished)
    if (round.completedPlayers.size >= 1) {
        // Round ends when at least one player finishes
        round.isActive = false;
    }
}

/**
 * Get leaderboard for current season
 */
export function getLeaderboard(limit = 10): LeaderboardEntry[] {
    return leaderboard
        .filter(entry => entry.season_id === currentSeasonId)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

/**
 * Get round winner (highest score)
 */
export function getRoundWinner(roundId: string): { userId: string; result: EndingResult } | null {
    const round = rounds.get(roundId);
    if (!round || round.completedPlayers.size === 0) return null;
    
    let winner: { userId: string; result: EndingResult } | null = null;
    let highestScore = -1;
    
    for (const [userId, result] of round.completedPlayers.entries()) {
        if (result.final_score > highestScore) {
            highestScore = result.final_score;
            winner = { userId, result };
        }
    }
    
    return winner;
}

/**
 * Clear completed session (by userId or smartAccountAddress)
 */
export function clearSession(identifier: string): void {
    const session = getSession(identifier);
    if (session) {
        // Remove from both userId and smartAccountAddress lookups
        activeSessions.delete(session.userId);
        activeSessions.delete(session.smartAccountAddress.toLowerCase());
    } else {
        // Fallback: try direct deletion
        activeSessions.delete(identifier);
        activeSessions.delete(identifier.toLowerCase());
    }
}

