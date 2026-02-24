import { describe, it, expect } from 'vitest';

/**
 * Tests for AskUserQuestion handling in the permission flow.
 *
 * When the mobile app answers an AskUserQuestion, it sends an approved
 * permission response with the answer text in the `reason` field. The
 * PermissionHandler detects this (toolName === 'AskUserQuestion') and
 * returns { behavior: 'deny', message: reason } so the answer becomes
 * the tool_result that Claude reads.
 */

// Replicate the core logic from PermissionHandler.handlePermissionResponse
// for AskUserQuestion specifically
function handleAskUserQuestionResponse(
    toolName: string,
    approved: boolean,
    reason?: string
): { behavior: 'allow' | 'deny'; message?: string; updatedInput?: Record<string, unknown> } {
    // AskUserQuestion special handling
    if (toolName === 'AskUserQuestion' && approved && reason) {
        return { behavior: 'deny', message: reason };
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

describe('AskUserQuestion permission handling', () => {
    it('should return deny with answer text when AskUserQuestion is approved with reason', () => {
        const result = handleAskUserQuestionResponse(
            'AskUserQuestion',
            true,
            'Auth method: OAuth 2.0'
        );
        expect(result.behavior).toBe('deny');
        expect(result.message).toBe('Auth method: OAuth 2.0');
    });

    it('should handle multi-line answers', () => {
        const answer = 'Database: PostgreSQL\nORM: Prisma\nCache: Redis';
        const result = handleAskUserQuestionResponse('AskUserQuestion', true, answer);
        expect(result.behavior).toBe('deny');
        expect(result.message).toBe(answer);
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
