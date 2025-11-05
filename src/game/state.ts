import type { PlayerState, GameSession, RoundState } from './types';

/**
 * Create initial player state
 */
export function createInitialState(): PlayerState {
    return {
        time_remaining: 12,
        trust: 0,
        sanity: 100,
        insight: 0,
        system_access: 0,
        morality: 0,
        turn: 1,
    };
}

/**
 * Apply state changes from GPT response
 */
export function applyStateChanges(
    currentState: PlayerState,
    changes: Partial<PlayerState>
): PlayerState {
    const newState = { ...currentState };
    
    // Apply deltas
    if (changes.time_remaining !== undefined) {
        newState.time_remaining = Math.max(0, Math.min(12, changes.time_remaining));
    }
    if (changes.trust !== undefined) {
        newState.trust = Math.max(-3, Math.min(3, changes.trust));
    }
    if (changes.sanity !== undefined) {
        newState.sanity = Math.max(0, Math.min(100, changes.sanity));
    }
    if (changes.insight !== undefined) {
        newState.insight = Math.max(0, Math.min(100, changes.insight));
    }
    if (changes.system_access !== undefined) {
        newState.system_access = Math.max(0, Math.min(3, changes.system_access));
    }
    if (changes.morality !== undefined) {
        newState.morality = Math.max(-100, Math.min(100, changes.morality));
    }
    if (changes.turn !== undefined) {
        newState.turn = changes.turn;
    } else {
        newState.turn += 1;
    }
    
    // Decrement time_remaining if not explicitly set
    if (changes.time_remaining === undefined) {
        newState.time_remaining = Math.max(0, newState.time_remaining - 1);
    }
    
    // SAFETY: Prevent game from ending before turn 10
    // Force minimum values to keep game going
    if (newState.turn < 10) {
        // Ensure time_remaining is at least 1 before turn 10
        if (newState.time_remaining <= 0) {
            newState.time_remaining = 1;
            console.warn(`Safety: Prevented time_remaining from reaching 0 at turn ${newState.turn}`);
        }
        // Ensure system_access is at most 2 before turn 10
        if (newState.system_access >= 3) {
            newState.system_access = 2;
            console.warn(`Safety: Prevented system_access from reaching 3 at turn ${newState.turn}`);
        }
    }
    
    return newState;
}

/**
 * Check if game should end
 * Game must last exactly 10 turns
 */
export function shouldEndGame(state: PlayerState): boolean {
    // Must have at least 10 turns
    if (state.turn < 10) {
        return false;
    }
    
    // After turn 10, can end if:
    // - Reached max turns (10)
    // - Time ran out
    // - Achieved full system access
    return (
        state.turn >= 10 ||
        state.time_remaining <= 0 ||
        state.system_access >= 3
    );
}

