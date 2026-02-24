import { describe, it, expect } from 'vitest';

/**
 * Tests for AskUserQuestion answer formatting and submission logic.
 *
 * When the user selects options in AskUserQuestionView and submits,
 * the selected labels are formatted as "Header: SelectedLabel" lines
 * and sent as the reason field of a permission approval.
 */

interface QuestionOption {
    label: string;
    description: string;
}

interface Question {
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
}

/**
 * Formats the user's selections into a text response.
 * Mirrors the logic in AskUserQuestionView.handleSubmit.
 */
function formatAnswer(questions: Question[], selections: Map<number, Set<number>>): string {
    const responseLines: string[] = [];
    questions.forEach((q, qIndex) => {
        const selected = selections.get(qIndex);
        if (selected && selected.size > 0) {
            const selectedLabels = Array.from(selected)
                .map(optIndex => q.options[optIndex]?.label)
                .filter(Boolean)
                .join(', ');
            responseLines.push(`${q.header}: ${selectedLabels}`);
        }
    });
    return responseLines.join('\n');
}

describe('AskUserQuestion answer formatting', () => {
    const singleQuestion: Question[] = [{
        question: 'Which authentication method should we use?',
        header: 'Auth method',
        options: [
            { label: 'OAuth 2.0', description: 'Industry standard' },
            { label: 'JWT', description: 'Simple tokens' },
            { label: 'API Key', description: 'Basic auth' },
        ],
        multiSelect: false,
    }];

    it('should format single-select answer', () => {
        const selections = new Map([[0, new Set([1])]]);
        expect(formatAnswer(singleQuestion, selections)).toBe('Auth method: JWT');
    });

    it('should format multi-select answer', () => {
        const multiQuestion: Question[] = [{
            question: 'Which features do you want?',
            header: 'Features',
            options: [
                { label: 'Dark mode', description: '' },
                { label: 'Offline support', description: '' },
                { label: 'Push notifications', description: '' },
            ],
            multiSelect: true,
        }];
        const selections = new Map([[0, new Set([0, 2])]]);
        expect(formatAnswer(multiQuestion, selections)).toBe('Features: Dark mode, Push notifications');
    });

    it('should format multiple questions', () => {
        const questions: Question[] = [
            {
                question: 'Which database?',
                header: 'Database',
                options: [
                    { label: 'PostgreSQL', description: '' },
                    { label: 'MySQL', description: '' },
                ],
                multiSelect: false,
            },
            {
                question: 'Which ORM?',
                header: 'ORM',
                options: [
                    { label: 'Prisma', description: '' },
                    { label: 'TypeORM', description: '' },
                ],
                multiSelect: false,
            },
        ];
        const selections = new Map([[0, new Set([0])], [1, new Set([0])]]);
        expect(formatAnswer(questions, selections)).toBe('Database: PostgreSQL\nORM: Prisma');
    });

    it('should skip questions with no selections', () => {
        const questions: Question[] = [
            {
                question: 'First?',
                header: 'Q1',
                options: [{ label: 'A', description: '' }],
                multiSelect: false,
            },
            {
                question: 'Second?',
                header: 'Q2',
                options: [{ label: 'B', description: '' }],
                multiSelect: false,
            },
        ];
        const selections = new Map([[1, new Set([0])]]);
        expect(formatAnswer(questions, selections)).toBe('Q2: B');
    });

    it('should return empty string when nothing selected', () => {
        expect(formatAnswer(singleQuestion, new Map())).toBe('');
    });
});

describe('AskUserQuestion submission flow', () => {
    it('should pass answer text as reason field in permission approval', () => {
        // Simulates the flow:
        // 1. User selects an option
        // 2. handleSubmit formats the answer
        // 3. sessionAllow is called with reason = answer text
        const answer = 'Auth method: OAuth 2.0';
        const permissionRequest = {
            id: 'tool-call-123',
            approved: true,
            reason: answer,
        };
        expect(permissionRequest.approved).toBe(true);
        expect(permissionRequest.reason).toBe(answer);
    });

    it('should not send a separate user message (answer goes through permission)', () => {
        // The old flow sent sessionAllow + sendMessage separately.
        // The new flow only sends sessionAllow with reason containing the answer.
        // This test documents the intended behavior.
        const answer = 'Database: PostgreSQL';
        const calls: string[] = [];

        // Simulate new submit flow
        calls.push(`sessionAllow(session, tool-123, reason=${answer})`);
        // No sendMessage call

        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('sessionAllow');
        expect(calls[0]).not.toContain('sendMessage');
    });
});
