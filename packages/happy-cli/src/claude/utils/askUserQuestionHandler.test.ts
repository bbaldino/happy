import { describe, it, expect } from 'vitest';

/**
 * Tests for AskUserQuestion handling in the permission flow.
 *
 * When the mobile app answers an AskUserQuestion, it sends an approved
 * permission response with a JSON answers object in the `reason` field.
 * The PermissionHandler detects this (toolName === 'AskUserQuestion') and
 * returns { behavior: 'allow', updatedInput: { questions, answers } }
 * matching the SDK's expected format.
 */

// Replicate the core logic from PermissionHandler.handlePermissionResponse
// for AskUserQuestion specifically
function handleAskUserQuestionResponse(
    toolName: string,
    approved: boolean,
    reason?: string,
    input?: { questions?: unknown[] }
): { behavior: 'allow' | 'deny'; message?: string; updatedInput?: Record<string, unknown> } {
    // AskUserQuestion special handling
    if (toolName === 'AskUserQuestion' && approved && reason) {
        let answers: Record<string, string> = {};
        try {
            answers = JSON.parse(reason);
        } catch {
            answers = { answer: reason };
        }
        return {
            behavior: 'allow',
            updatedInput: {
                questions: input?.questions ?? [],
                answers,
            }
        };
    }

    // Default handling
    if (approved) {
        return { behavior: 'allow', updatedInput: {} };
    } else {
        return {
            behavior: 'deny',
            message: reason || `The user doesn't want to proceed with this tool use.`
        };
    }
}

const sampleQuestions = [
    {
        question: 'Which auth method?',
        header: 'Auth',
        options: [
            { label: 'OAuth 2.0', description: 'Standard OAuth flow' },
            { label: 'JWT', description: 'JSON Web Tokens' },
        ],
        multiSelect: false,
    },
    {
        question: 'Which databases?',
        header: 'DB',
        options: [
            { label: 'PostgreSQL', description: 'Relational DB' },
            { label: 'Redis', description: 'In-memory cache' },
        ],
        multiSelect: true,
    },
];

describe('AskUserQuestion permission handling', () => {
    it('should return allow with structured answers when AskUserQuestion is approved', () => {
        const answersJson = JSON.stringify({ 'Which auth method?': 'OAuth 2.0' });
        const result = handleAskUserQuestionResponse(
            'AskUserQuestion',
            true,
            answersJson,
            { questions: sampleQuestions }
        );
        expect(result.behavior).toBe('allow');
        expect(result.updatedInput).toEqual({
            questions: sampleQuestions,
            answers: { 'Which auth method?': 'OAuth 2.0' },
        });
    });

    it('should handle multi-select answers', () => {
        const answersJson = JSON.stringify({
            'Which auth method?': 'OAuth 2.0',
            'Which databases?': 'PostgreSQL, Redis',
        });
        const result = handleAskUserQuestionResponse(
            'AskUserQuestion',
            true,
            answersJson,
            { questions: sampleQuestions }
        );
        expect(result.behavior).toBe('allow');
        expect(result.updatedInput).toEqual({
            questions: sampleQuestions,
            answers: {
                'Which auth method?': 'OAuth 2.0',
                'Which databases?': 'PostgreSQL, Redis',
            },
        });
    });

    it('should fall back to raw text when reason is not valid JSON', () => {
        const result = handleAskUserQuestionResponse(
            'AskUserQuestion',
            true,
            'Auth method: OAuth 2.0',
            { questions: sampleQuestions }
        );
        expect(result.behavior).toBe('allow');
        expect(result.updatedInput).toEqual({
            questions: sampleQuestions,
            answers: { answer: 'Auth method: OAuth 2.0' },
        });
    });

    it('should fall through to normal allow when AskUserQuestion has no reason', () => {
        const result = handleAskUserQuestionResponse('AskUserQuestion', true, undefined);
        expect(result.behavior).toBe('allow');
        expect(result.updatedInput).toEqual({});
    });

    it('should fall through to normal deny when AskUserQuestion is denied', () => {
        const result = handleAskUserQuestionResponse('AskUserQuestion', false, 'User canceled');
        expect(result.behavior).toBe('deny');
        expect(result.message).toBe('User canceled');
    });

    it('should not apply AskUserQuestion logic to other tools', () => {
        const result = handleAskUserQuestionResponse('Bash', true, 'some reason');
        expect(result.behavior).toBe('allow');
        expect(result.updatedInput).toEqual({});
    });

    it('should handle empty answer string by falling through', () => {
        const result = handleAskUserQuestionResponse('AskUserQuestion', true, '');
        expect(result.behavior).toBe('allow');
        expect(result.updatedInput).toEqual({});
    });
});
