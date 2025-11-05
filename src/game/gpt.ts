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

Players have 10–20 turns to escape before their number is called.

Each turn, output valid JSON:
  scene_text (≤120 words)
  state_changes (object with keys: time_remaining, trust, sanity, insight, system_access, morality, turn)
  choices (2–4 short imperatives)
  hint (optional)

When ending is requested, output:
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
    previousAction: string | null
): Promise<GPTSceneResponse> {
    const prompt = `Generate the next scene for turn ${turn}.

Current player state:
- time_remaining: ${playerState.time_remaining}
- trust: ${playerState.trust}
- sanity: ${playerState.sanity}
- insight: ${playerState.insight}
- system_access: ${playerState.system_access}
- morality: ${playerState.morality}
- turn: ${playerState.turn}

${previousAction ? `Previous action: ${previousAction}` : 'This is the first scene. Start with the player waking in the dark room.'}

Return JSON with scene_text, state_changes (apply deltas to current state), choices (2-4 short imperatives), and optional hint.`;

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

