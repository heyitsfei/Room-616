// Load environment variables
import { config } from 'dotenv'
config()

import { makeTownsBot } from '@towns-protocol/bot'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { PlainMessage } from '@towns-protocol/proto'
import commands from './commands'
import { generateScene, generateEnding, generateSceneImage } from './game/gpt'
import { applyStateChanges, shouldEndGame } from './game/state'
import { createEndingResult } from './game/scoring'
import type { PlayerState } from './game/types'
import {
    getSession,
    createSession,
    updateSession,
    endSession,
    clearSession,
    getLeaderboard,
    getCurrentRound,
    getRoundWinner,
} from './game/session'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

// Store last scene choices for each user (for handling /choose commands and button interactions)
const lastChoices = new Map<string, string[]>(); // userId -> choices array
const interactionRequestMap = new Map<string, { userId: string; choices: string[] }>(); // requestId -> { userId, choices }

/**
 * Format scene with choices as buttons
 */
async function sendSceneWithButtons(
    handler: Parameters<Parameters<typeof bot.onSlashCommand>[1]>[0],
    channelId: string,
    sceneText: string,
    choices: string[],
    hint?: string,
    userId?: string,
    playerState?: PlayerState,
    imageUrl?: string
): Promise<void> {
    // If we have an image, send it first as a separate message
    if (imageUrl) {
        try {
            await handler.sendMessage(channelId, '', {
                attachments: [{
                    type: 'image',
                    url: imageUrl,
                    alt: `Scene from Room 616`
                }]
            });
        } catch (error) {
            console.error('Error sending scene image:', error);
            // Continue even if image fails
        }
    }

    // Build subtitle with stats and hint
    let subtitleParts: string[] = [];
    if (playerState) {
        subtitleParts.push(formatStatsCompact(playerState));
    }
    if (hint) {
        subtitleParts.push(`💡 Hint: ${hint}`);
    }

    // Create the form with plain objects (matching the example pattern)
    const formId = `scene-${userId}-${Date.now()}`;
    
    // Create button components as plain objects
    const buttonComponents = choices.map((choice, index) => ({
        id: `choice-${index}`,
        component: {
            case: 'button' as const,
            value: {
                label: choice,
            },
        },
    }));

    const form = {
        id: formId,
        title: sceneText,
        subtitle: subtitleParts.length > 0 ? subtitleParts.join('\n\n') : undefined,
        components: buttonComponents,
    };

    // Send interaction request with buttons (form title displays the scene text)
    const { eventId } = await handler.sendInteractionRequest(channelId, {
        content: {
            case: 'form',
            value: form,
        },
    } as any);

    // Store the mapping for handling responses
    // Store by both formId and eventId to handle different response formats
    if (userId) {
        interactionRequestMap.set(formId, { userId, choices });
        interactionRequestMap.set(eventId, { userId, choices }); // Also store by eventId as fallback
        console.log('Stored interaction mapping:', { formId, eventId, userId, choicesCount: choices.length });
    }
}

/**
 * Format scene with choices (fallback text format)
 */
function formatScene(sceneText: string, choices: string[]): string {
    let message = `**${sceneText}**\n\n`;
    message += '**Your choices:**\n';
    choices.forEach((choice, index) => {
        message += `${index + 1}. ${choice}\n`;
    });
    message += `\nUse \`/choose1\`, \`/choose2\`, etc. to make your choice.`;
    return message;
}

/**
 * Format player status
 */
function formatStatus(session: NonNullable<ReturnType<typeof getSession>>): string {
    const { state } = session;
    return `**Game Status** (Turn ${state.turn}/20)\n\n` +
        `⏰ Time Remaining: ${state.time_remaining}\n` +
        `🤝 Trust: ${state.trust}\n` +
        `🧠 Sanity: ${state.sanity}\n` +
        `💡 Insight: ${state.insight}\n` +
        `🔐 System Access: ${state.system_access}/3\n` +
        `⚖️ Morality: ${state.morality}\n`;
}

/**
 * Format player stats compactly for scene display
 */
function formatStatsCompact(state: PlayerState): string {
    return `Turn ${state.turn}/20 | ⏰${state.time_remaining} | 🤝${state.trust} | 🧠${state.sanity} | 💡${state.insight} | 🔐${state.system_access}/3 | ⚖️${state.morality}`;
}

/**
 * Process game turn
 */
async function processTurn(
    handler: Parameters<Parameters<typeof bot.onSlashCommand>[1]>[0],
    session: NonNullable<ReturnType<typeof getSession>>,
    action: string
) {
    const { channelId, userId } = session;
    
    try {
        // Generate next scene with full action history and the previous action (the choice the user just made)
        // Pass the action so GPT knows what decision was just made and can start the scene with its result
        const scene = await generateScene(
            session.state.turn,
            session.state,
            session.actionHistory,
            action // Pass the choice the user just made so GPT can start the scene with its result
        );
        
        // Update state
        session.state = applyStateChanges(session.state, scene.state_changes);
        // Add current action to history after generating scene
        session.actionHistory.push(action);
        if (session.actionHistory.length > 20) {
            // Keep last 20 actions for full context (since game can be up to 20 turns)
            session.actionHistory.shift();
        }
        
        // Store choices for this turn
        lastChoices.set(userId, scene.choices);
        
        // Check if game should end
        if (shouldEndGame(session.state)) {
            // Generate ending
            const ending = await generateEnding(session.state, session.actionHistory);
            const result = createEndingResult(ending, session.state);
            
            // End session
            endSession(userId, ending, result.final_score, result.tier);
            
            // Send ending
            let endingMessage = `**🎭 ${result.ending_title}**\n\n${result.ending_text}\n\n`;
            endingMessage += `**Final Score:** ${result.final_score} (${result.tier} Tier)\n\n`;
            
            // Check if round ended and winner gets prize
            const round = getCurrentRound();
            if (!round.isActive && round.completedPlayers.size > 0) {
                const winner = getRoundWinner(round.roundId);
                if (winner && winner.userId === userId) {
                    endingMessage += `🎉 **You won the round!** Prize pool: ${round.prizePool.toString()} wei\n`;
                    // TODO: Send tip to winner using bot.viem and execute
                } else if (winner) {
                    endingMessage += `🏆 Winner: <@${winner.userId}> with score ${winner.result.final_score}\n`;
                }
            }
            
            endingMessage += `\nUse \`/start\` to play again.`;
            
            await handler.sendMessage(channelId, endingMessage);
            clearSession(userId);
            lastChoices.delete(userId);
        } else {
            // Generate image for the scene (optional, won't break game if it fails)
            let imageUrl: string | undefined = undefined;
            try {
                imageUrl = await generateSceneImage(scene.scene_text, session.state.turn, session.actionHistory) || undefined;
            } catch (error) {
                console.error('Error generating scene image:', error);
                // Continue without image
            }
            
            // Send scene with buttons (include updated state after scene generation)
            await sendSceneWithButtons(handler, channelId, scene.scene_text, scene.choices, scene.hint, userId, session.state, imageUrl);
            
            // Update session
            updateSession(userId, { state: session.state, actionHistory: session.actionHistory });
        }
    } catch (error) {
        console.error('Error processing turn:', error);
        await handler.sendMessage(
            channelId,
            `❌ Error processing your turn. Please try again or use \`/start\` to restart.`
        );
    }
}

// Handle tips - check if user wants to start game
bot.onTip(async (handler, event) => {
    const { channelId, userId, senderAddress, receiverAddress, amount, messageId } = event;
    
    try {
        
        // Log tip event for debugging with user identification
        console.log('Tip received:', {
            userId: userId, // User's identity address
            senderAddress: senderAddress, // Smart contract address
            receiver: receiverAddress,
            botId: bot.botId,
            amount: amount.toString(),
        });
        
        // Only handle tips to the bot (case-insensitive comparison)
        if (receiverAddress.toLowerCase() !== bot.botId.toLowerCase()) {
            console.log('Tip not to bot, ignoring');
            return;
        }
        
        // Check if user already has active session (by userId or smartAccountAddress)
        const existingSession = getSession(userId) || getSession(senderAddress);
        if (existingSession && existingSession.isActive) {
            // User already has a game - just add tip to prize pool
            const round = getCurrentRound();
            round.prizePool += amount;
            await handler.sendMessage(
                channelId,
                `✅ Tip received! Your ${amount.toString()} wei has been added to the prize pool.\n` +
                `Continue playing your current game with \`/choose1\`, \`/choose2\`, etc.`
            );
            return;
        }
        
        // Create new session from tip - link userId and smartAccountAddress
        const session = createSession(userId, senderAddress, channelId, amount);
        
        // Send immediate confirmation that tip was received with account linkage
        await handler.sendMessage(
            channelId,
            `✅ Tip received from <@${userId}>! Smart account: \`${senderAddress}\`\nStarting your game...`
        );
        
        // Generate first scene
        try {
            console.log('Generating first scene for user:', userId, 'smart account:', senderAddress);
            const scene = await generateScene(1, session.state, []);
            session.state = applyStateChanges(session.state, scene.state_changes);
            session.actionHistory.push('game_start');
            // Store choices by userId for consistency
            lastChoices.set(userId, scene.choices);
            
            // Send tip confirmation
            await handler.sendMessage(
                channelId,
                `✅ Tip received: ${amount.toString()} wei. Starting your game...`
            );
            
            // Generate image for the first scene (optional, won't break game if it fails)
            let imageUrl: string | undefined = undefined;
            try {
                imageUrl = await generateSceneImage(scene.scene_text, 1, []) || undefined;
            } catch (error) {
                console.error('Error generating scene image:', error);
                // Continue without image
            }
            
            // Send first scene with buttons (include updated state after scene generation)
            await sendSceneWithButtons(handler, channelId, scene.scene_text, scene.choices, scene.hint, userId, session.state, imageUrl);
            
            updateSession(userId, { state: session.state, actionHistory: session.actionHistory });
            console.log('Game started successfully for user:', userId, 'smart account:', senderAddress);
        } catch (error) {
            console.error('Error generating first scene:', error);
            await handler.sendMessage(
                channelId,
                `❌ Error starting game: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`
            );
            clearSession(userId);
        }
    } catch (error) {
        console.error('Error in onTip handler:', error);
        // Try to send error message if handler is available
        try {
            await handler.sendMessage(
                channelId,
                `❌ Error processing tip. Please contact support.`
            );
        } catch (e) {
            // Ignore if we can't send message
            console.error('Could not send error message:', e);
        }
    }
})

// Handle interaction responses (button clicks)
bot.onInteractionResponse(async (handler, event) => {
    try {
        const { userId, channelId, response } = event;
        
        console.log('Interaction response received:', {
            userId,
            hasResponse: !!response,
            hasPayload: !!response?.payload,
            payloadContentCase: response?.payload?.content?.case,
        });
        
        // Check if it's a form response (using optional chaining like the example)
        if (response.payload.content?.case !== 'form') {
            console.log('Not a form response, ignoring');
            return;
        }
        
        const formResponse = response.payload.content.value;
        const requestId = formResponse.requestId;
        
        console.log('Form response received:', {
            requestId,
            userId,
            componentsCount: formResponse.components?.length || 0,
            availableKeys: Array.from(interactionRequestMap.keys()).slice(0, 10),
        });
        
        // Find the interaction request in our map
        // Try requestId first (form's id), then check if it's an eventId
        let interactionData = interactionRequestMap.get(requestId);
        
        // If not found, try looking up by partial match (in case of format differences)
        if (!interactionData) {
            // Try to find by matching formId pattern or eventId
            for (const [key, value] of interactionRequestMap.entries()) {
                if (key.includes(requestId) || requestId.includes(key)) {
                    interactionData = value;
                    console.log('Found interaction data by partial match:', { key, requestId });
                    break;
                }
            }
        }
        
        if (!interactionData) {
            console.log('Interaction request not found for requestId:', requestId);
            console.log('Full map contents:', Array.from(interactionRequestMap.entries()).map(([k, v]) => ({ key: k, userId: v.userId })));
            await handler.sendMessage(channelId, `❌ Could not find interaction data. Please try using /choose commands instead.`);
            return;
        }
        
        // Verify this is the correct user
        if (interactionData.userId !== userId) {
            await handler.sendMessage(channelId, `❌ This interaction belongs to another user.`);
            return;
        }
        
        // Get the session
        const session = getSession(userId);
        if (!session || !session.isActive) {
            await handler.sendMessage(channelId, `You don't have an active game. Use \`/start\` to begin.`);
            return;
        }
        
        // Check which button was clicked (iterate through all components like the example)
        let selectedChoice: string | null = null;
        for (const component of formResponse.components || []) {
            if (component.component?.case === 'button') {
                const componentId = component.id;
                console.log('Button clicked:', componentId);
                
                // Get the choice index from component ID (e.g., "choice-0" -> 0)
                const choiceIndex = parseInt(componentId.replace('choice-', ''));
                if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < interactionData.choices.length) {
                    selectedChoice = interactionData.choices[choiceIndex];
                    console.log('Selected choice:', selectedChoice);
                    break;
                }
            }
        }
        
        if (!selectedChoice) {
            await handler.sendMessage(channelId, `❌ Invalid button selection.`);
            return;
        }
        
        // Remove from interaction map
        interactionRequestMap.delete(requestId);
        
        console.log('Processing turn with choice:', selectedChoice);
        
        // Process the turn with the selected choice
        await processTurn(handler, session, selectedChoice);
    } catch (error) {
        console.error('Error in onInteractionResponse handler:', error);
        try {
            await handler.sendMessage(
                event.channelId,
                `❌ Error processing button click: ${error instanceof Error ? error.message : 'Unknown error'}. Please try using /choose commands.`
            );
        } catch (e) {
            console.error('Could not send error message:', e);
        }
    }
})

// Start command - start the game directly
bot.onSlashCommand('start', async (handler, { channelId, userId }) => {
    const existingSession = getSession(userId);
    if (existingSession && existingSession.isActive) {
        await handler.sendMessage(
            channelId,
            `You already have an active game! Use \`/status\` to check your progress.\n\n` +
            formatStatus(existingSession)
        );
        return;
    }
    
    // Create new session without tip (tipAmount = 0)
    // Use userId as both userId and smartAccountAddress since we don't have tip info
    const session = createSession(userId, userId, channelId, 0n);
    
    // Send immediate confirmation
    await handler.sendMessage(
        channelId,
        `✅ Starting your game...`
    );
    
    // Generate first scene
    try {
        console.log('Generating first scene for user:', userId);
        const scene = await generateScene(1, session.state, []);
        session.state = applyStateChanges(session.state, scene.state_changes);
        session.actionHistory.push('game_start');
        lastChoices.set(userId, scene.choices);
        
            // Generate image for the first scene (optional, won't break game if it fails)
            let imageUrl: string | undefined = undefined;
            try {
                imageUrl = await generateSceneImage(scene.scene_text, 1, []) || undefined;
            } catch (error) {
                console.error('Error generating scene image:', error);
                // Continue without image
            }
            
            // Send first scene with buttons (include updated state after scene generation)
            await sendSceneWithButtons(handler, channelId, scene.scene_text, scene.choices, scene.hint, userId, session.state, imageUrl);
        
        updateSession(userId, { state: session.state, actionHistory: session.actionHistory });
        console.log('Game started successfully for user:', userId);
    } catch (error) {
        console.error('Error generating first scene:', error);
        await handler.sendMessage(
            channelId,
            `❌ Error starting game: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`
        );
        clearSession(userId);
    }
})

// Choice commands
bot.onSlashCommand('choose1', async (handler, { channelId, userId }) => {
    const session = getSession(userId);
    if (!session || !session.isActive) {
        await handler.sendMessage(channelId, `You don't have an active game. Use \`/start\` to begin.`);
        return;
    }
    
    const choices = lastChoices.get(userId);
    if (!choices || choices.length < 1) {
        await handler.sendMessage(channelId, `No choices available. Please wait for the next scene.`);
        return;
    }
    
    await processTurn(handler, session, choices[0]);
})

bot.onSlashCommand('choose2', async (handler, { channelId, userId }) => {
    const session = getSession(userId);
    if (!session || !session.isActive) {
        await handler.sendMessage(channelId, `You don't have an active game. Use \`/start\` to begin.`);
        return;
    }
    
    const choices = lastChoices.get(userId);
    if (!choices || choices.length < 2) {
        await handler.sendMessage(channelId, `Choice 2 is not available. Please select a valid option.`);
        return;
    }
    
    await processTurn(handler, session, choices[1]);
})

bot.onSlashCommand('choose3', async (handler, { channelId, userId }) => {
    const session = getSession(userId);
    if (!session || !session.isActive) {
        await handler.sendMessage(channelId, `You don't have an active game. Use \`/start\` to begin.`);
        return;
    }
    
    const choices = lastChoices.get(userId);
    if (!choices || choices.length < 3) {
        await handler.sendMessage(channelId, `Choice 3 is not available. Please select a valid option.`);
        return;
    }
    
    await processTurn(handler, session, choices[2]);
})

bot.onSlashCommand('choose4', async (handler, { channelId, userId }) => {
    const session = getSession(userId);
    if (!session || !session.isActive) {
        await handler.sendMessage(channelId, `You don't have an active game. Use \`/start\` to begin.`);
        return;
    }
    
    const choices = lastChoices.get(userId);
    if (!choices || choices.length < 4) {
        await handler.sendMessage(channelId, `Choice 4 is not available. Please select a valid option.`);
        return;
    }
    
    await processTurn(handler, session, choices[3]);
})

// Status command
bot.onSlashCommand('status', async (handler, { channelId, userId }) => {
    const session = getSession(userId);
    if (!session || !session.isActive) {
        await handler.sendMessage(channelId, `You don't have an active game. Use \`/start\` to begin.`);
        return;
    }
    
    await handler.sendMessage(channelId, formatStatus(session));
})

// Leaderboard command
bot.onSlashCommand('leaderboard', async (handler, { channelId }) => {
    const leaderboard = getLeaderboard(10);
    
    if (leaderboard.length === 0) {
        await handler.sendMessage(channelId, `📊 **Leaderboard**\n\nNo players have completed a game yet.`);
        return;
    }
    
    let message = `📊 **Leaderboard** (Top 10)\n\n`;
    leaderboard.forEach((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        message += `${medal} <@${entry.wallet}> - Score: ${entry.score} (${entry.tier} Tier)\n`;
        message += `   Ending: ${entry.ending_id}\n\n`;
    });
    
    const round = getCurrentRound();
    message += `**Current Round Prize Pool:** ${round.prizePool.toString()} wei\n`;
    message += `**Active Players:** ${round.activePlayers.size}\n`;
    message += `**Completed:** ${round.completedPlayers.size}`;
    
    await handler.sendMessage(channelId, message);
})

// Help command
bot.onSlashCommand('help', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**🎮 Room 616 - Commands**\n\n' +
        '**Game Commands:**\n' +
        '• `/start` - Start a new game\n' +
        '• `/status` - Check your current game status\n' +
        '• `/leaderboard` - View the current leaderboard\n\n' +
        '**Choice Commands:**\n' +
        '• `/choose1` - Choose option 1\n' +
        '• `/choose2` - Choose option 2\n' +
        '• `/choose3` - Choose option 3\n' +
        '• `/choose4` - Choose option 4\n\n' +
        '**How to Play:**\n' +
        '1. Use `/start` to begin a game\n' +
        '2. Make choices using `/choose1`, `/choose2`, etc.\n' +
        '3. Navigate through 10-20 decisions\n' +
        '4. Reach an ending and get your score\n' +
        '5. Highest score wins the prize pool!\n\n' +
        '💡 **Tip:** You can tip the bot to add to the prize pool! Tips are optional but help fund the competition.\n'
    )
})

const { jwtMiddleware, handler } = bot.start()

const app = new Hono()
app.use(logger())
app.post('/webhook', jwtMiddleware, handler)

export default app
