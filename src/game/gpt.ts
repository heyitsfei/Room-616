import type { PlayerState, GPTSceneResponse, GPTEndingResponse } from './types';

const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o'; // Use gpt-4o as default, can be overridden

/**
 * Get OpenAI API key with validation
 */
function getOpenAIApiKey(): string {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required. Please set it in your .env file.');
    }
    return apiKey;
}

const SYSTEM_PROMPT = `You are the narrative engine for a thriller game called "Room 616".

STORY PREMISE:
"You wake up chained to a chair in a pitch-black hotel room number 616. A flickering CRT TV turns on, showing live footage of other people in identical rooms — all with a number ending in 16. Every hour, one of the rooms goes dark permanently and you hear a scream. Escape before your room number is called."

NARRATIVE GOALS:
- Help the player gradually understand WHO is watching them and WHY they are trapped.
- Build mystery and reveal clues about the captors' identity and motives throughout the 10-20 turn journey.
- The story should build toward revealing the nature of the experiment, organization, or entity behind Room 616.
- By turns 10-15, players should start uncovering significant clues about their captors.
- The ending should provide resolution about who was watching and why (even if it's a tragic ending).

CRITICAL: Players MUST have 10–20 turns to escape. The game should NOT end before turn 10 unless the player makes a catastrophic choice.

Each turn, output valid JSON:
  scene_text (≤120 words)
  state_changes (object with keys: time_remaining, trust, sanity, insight, system_access, morality, turn)
  choices (2–4 short imperatives)
  hint (optional)

IMPORTANT RULES:
- time_remaining starts at 12 and decrements by 1 each turn. Do NOT set it to 0 or negative before turn 10.
- system_access ranges from 0-3. Do NOT set it to 3 before turn 10 (this triggers early ending).
- The game should progress naturally over 10-20 turns. Keep tension building gradually.
- Only apply SMALL deltas to state_changes (e.g., +2, -3, not massive swings).
- If turn < 10: Keep time_remaining > 0 and system_access < 3 to ensure game continues.

NARRATIVE MEMORY:
- You will receive the player's complete action history. ALWAYS incorporate previous decisions into the current scene.
- Reference specific choices the player made earlier. Show consequences of past actions.
- Build continuity: if the player investigated something before, mention it. If they avoided something, reference it.
- Make the story feel connected and responsive to the player's journey.
- Gradually reveal information about the captors as the player explores and makes choices.

MYSTERY REVELATION PROGRESSION:
- Early turns (1-5): Player discovers their situation, explores the room, notices the TV and other rooms.
- Mid turns (6-10): Player finds clues about the system, maybe hears voices, sees patterns, learns about the experiment.
- Late turns (11-15): Player uncovers more about WHO is watching - maybe finds evidence, systems, or communications.
- Final turns (16-20): Player either escapes with knowledge of who/why, or learns the truth even in failure.

When ending is requested (after turn 10 or if player makes catastrophic choice), output:
  ending_id (unique identifier like "E-GLASS-CORRIDOR-07")
  ending_title (short title)
  ending_text (80–180 words)
  proposed_score (0–600, but backend will compute final score)

Tone: tense, intelligent, cinematic. No external references.

Always return valid JSON only, no markdown formatting.`;

/**
 * Generate next scene using GPT
 */
export async function generateScene(
    turn: number,
    playerState: PlayerState,
    actionHistory: string[]
): Promise<GPTSceneResponse> {
    // Build action history context
    let actionHistoryText = '';
    if (actionHistory.length === 0) {
        actionHistoryText = 'This is the first scene. Start with the player waking in the dark room.';
    } else {
        actionHistoryText = `Complete action history (all decisions made so far):\n${actionHistory.map((action, index) => `Turn ${index + 1}: ${action}`).join('\n')}\n\nMost recent action: ${actionHistory[actionHistory.length - 1]}\n\nIMPORTANT: Incorporate ALL previous decisions into the narrative. Reference things the player investigated, people they trusted, paths they took, objects they interacted with. Make the story feel continuous and responsive to their choices.`;
    }
    
    const prompt = `Generate the next scene for turn ${turn}.

STORY CONTEXT:
The player is chained in Room 616, watching other rooms on a CRT TV. Every hour, one room goes dark with a scream. They must escape before their number is called.

Current player state:
- time_remaining: ${playerState.time_remaining}
- trust: ${playerState.trust}
- sanity: ${playerState.sanity}
- insight: ${playerState.insight}
- system_access: ${playerState.system_access}
- morality: ${playerState.morality}
- turn: ${playerState.turn}

${actionHistoryText}

CRITICAL CONSTRAINTS:
- The game must last 10-20 turns. Current turn is ${turn}.
- If turn < 10: Keep time_remaining > 0 and system_access < 3 in state_changes.
- Apply SMALL deltas only (e.g., time_remaining: -1, insight: +5, sanity: -3).
- Do NOT set time_remaining to 0 or system_access to 3 before turn 10.
- Build tension gradually over multiple turns.

NARRATIVE REQUIREMENTS:
- Reference specific previous actions in the scene text. Show consequences of past choices.
- If the player investigated something before, show how that knowledge affects the current situation.
- If they avoided or chose a different path, acknowledge it in the narrative.
- Make each scene feel like a continuation of their specific journey.

MYSTERY AND REVELATION:
- Gradually reveal clues about WHO is watching them and WHY they are trapped.
- Early turns (1-5): Focus on discovery and exploration of the room and situation.
- Mid turns (6-10): Introduce clues about the system, patterns, or voices.
- Late turns (11-15): Reveal more about the captors - evidence, systems, communications.
- Final turns (16-20): Build toward resolution about who/why, even if escape fails.
- The story must help the player understand the nature of their captors by the end.

Return JSON with scene_text, state_changes (apply small deltas to current state), choices (2-4 short imperatives), and optional hint.`;

    const apiKey = getOpenAIApiKey();
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: GPT_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            temperature: 0.9,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
        throw new Error('No content in OpenAI response');
    }

    try {
        return JSON.parse(content) as GPTSceneResponse;
    } catch (error) {
        throw new Error(`Failed to parse GPT response: ${content}`);
    }
}

/**
 * Generate ending using GPT
 */
export async function generateEnding(
    finalState: PlayerState,
    actionHistory: string[]
): Promise<GPTEndingResponse> {
    const prompt = `Generate one of 100 distinct cinematic endings for this game run.

Final player state:
- time_remaining: ${finalState.time_remaining}
- trust: ${finalState.trust}
- sanity: ${finalState.sanity}
- insight: ${finalState.insight}
- system_access: ${finalState.system_access}
- morality: ${finalState.morality}
- turn: ${finalState.turn}

Last 10 actions: ${actionHistory.slice(-10).join(', ')}

Return JSON with ending_id (unique like "E-GLASS-CORRIDOR-07"), ending_title, ending_text (80-180 words), and proposed_score (0-600).`;

    const apiKey = getOpenAIApiKey();
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: GPT_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            temperature: 1.0, // Higher temperature for more variety in endings
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
        throw new Error('No content in OpenAI response');
    }

    try {
        return JSON.parse(content) as GPTEndingResponse;
    } catch (error) {
        throw new Error(`Failed to parse GPT response: ${content}`);
    }
}

