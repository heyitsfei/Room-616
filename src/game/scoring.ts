import type { PlayerState, EndingResult } from './types';

/**
 * Compute authoritative score from final player state
 */
export function computeScore(state: PlayerState): number {
    const base = 100;
    
    const raw = base +
        (state.insight / 2) +
        (state.system_access * 50) +
        (state.trust * 20) -
        ((100 - state.sanity) / 2) +
        (state.morality / 5);
    
    return Math.max(0, Math.round(raw));
}

/**
 * Determine tier based on score
 */
export function getTier(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (score >= 450) return 'S';
    if (score >= 350) return 'A';
    if (score >= 250) return 'B';
    if (score >= 150) return 'C';
    return 'D';
}

/**
 * Create ending result with computed score
 */
export function createEndingResult(
    ending: { ending_id: string; ending_title: string; ending_text: string },
    finalState: PlayerState
): EndingResult {
    const final_score = computeScore(finalState);
    const tier = getTier(final_score);
    
    return {
        ...ending,
        final_score,
        tier,
    };
}

