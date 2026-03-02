/**
 * Tests to diagnose the message rendering bug where agent responses
 * don't appear until the user sends another message.
 *
 * These tests verify:
 * 1. Zustand's shallow comparison detects message array changes
 * 2. Store subscriptions fire correctly on rapid set() calls
 * 3. AsyncLock.tryRunSync works correctly
 * 4. The interaction between applySessions and applyMessages
 */

import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import { shallow } from 'zustand/vanilla/shallow';
import { AsyncLock } from '@/utils/lock';

// ============================================================
// 1. shallow() comparison tests
// ============================================================

describe('shallow comparison for message selectors', () => {
    it('detects when messages array reference changes (same content)', () => {
        const arr1 = [{ id: '1', text: 'hello' }];
        const arr2 = [{ id: '1', text: 'hello' }]; // same content, different reference

        const prev = { messages: arr1, isLoaded: true };
        const next = { messages: arr2, isLoaded: true };

        // shallow should return false because arr1 !== arr2
        expect(shallow(prev, next)).toBe(false);
    });

    it('detects when messages array has new elements', () => {
        const arr1 = [{ id: '1', text: 'hello' }];
        const arr2 = [{ id: '2', text: 'response' }, { id: '1', text: 'hello' }];

        const prev = { messages: arr1, isLoaded: true };
        const next = { messages: arr2, isLoaded: true };

        expect(shallow(prev, next)).toBe(false);
    });

    it('returns true when same array reference and same isLoaded', () => {
        const arr = [{ id: '1', text: 'hello' }];

        const prev = { messages: arr, isLoaded: true };
        const next = { messages: arr, isLoaded: true };

        expect(shallow(prev, next)).toBe(true);
    });

    it('detects isLoaded change even with same messages', () => {
        const arr = [{ id: '1', text: 'hello' }];

        const prev = { messages: arr, isLoaded: false };
        const next = { messages: arr, isLoaded: true };

        expect(shallow(prev, next)).toBe(false);
    });
});

// ============================================================
// 2. Store subscription notification tests
// ============================================================

describe('Zustand store subscription notifications', () => {
    interface TestState {
        sessions: Record<string, { id: string; seq: number }>;
        sessionMessages: Record<string, { messages: string[]; isLoaded: boolean }>;
    }

    function createTestStore() {
        return create<TestState>()((set) => ({
            sessions: {},
            sessionMessages: {},
        }));
    }

    it('fires subscriber on every set() call', () => {
        const store = createTestStore();
        const listener = vi.fn();

        store.subscribe(listener);

        // First set - update sessions
        store.setState((state) => ({
            ...state,
            sessions: { s1: { id: 's1', seq: 1 } },
        }));

        // Second set - update sessionMessages
        store.setState((state) => ({
            ...state,
            sessionMessages: { s1: { messages: ['msg1'], isLoaded: true } },
        }));

        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('fires subscriber for rapid successive set() calls', () => {
        const store = createTestStore();
        const listener = vi.fn();

        store.subscribe(listener);

        // Simulate applySessions followed by applyMessages (same sync block)
        store.setState((state) => ({
            ...state,
            sessions: { s1: { id: 's1', seq: 1 } },
            sessionMessages: {
                ...state.sessionMessages,
                s1: {
                    messages: ['existing'],
                    isLoaded: true,
                },
            },
        }));

        store.setState((state) => ({
            ...state,
            sessionMessages: {
                ...state.sessionMessages,
                s1: {
                    messages: ['new-msg', 'existing'],
                    isLoaded: true,
                },
            },
        }));

        expect(listener).toHaveBeenCalledTimes(2);

        // Verify final state has the new message
        const finalState = store.getState();
        expect(finalState.sessionMessages.s1.messages).toEqual(['new-msg', 'existing']);
    });

    it('selector returns different references when messages change', () => {
        const store = createTestStore();

        // Initialize
        store.setState({
            sessions: {},
            sessionMessages: {
                s1: { messages: ['msg1'], isLoaded: true },
            },
        });

        const emptyArray: unknown[] = [];
        const selector = (state: TestState) =>
            state.sessionMessages['s1']?.messages ?? emptyArray;

        const snap1 = selector(store.getState());

        // Update messages
        store.setState((state) => ({
            ...state,
            sessionMessages: {
                ...state.sessionMessages,
                s1: { messages: ['msg2', 'msg1'], isLoaded: true },
            },
        }));

        const snap2 = selector(store.getState());

        // Object.is should detect the change (this is what useSyncExternalStore uses)
        expect(Object.is(snap1, snap2)).toBe(false);
    });

    it('selector returns same reference when only sessions change (not sessionMessages)', () => {
        const store = createTestStore();
        const msgs = ['msg1'];

        store.setState({
            sessions: { s1: { id: 's1', seq: 1 } },
            sessionMessages: { s1: { messages: msgs, isLoaded: true } },
        });

        const selector = (state: TestState) =>
            state.sessionMessages['s1']?.messages ?? [];

        const snap1 = selector(store.getState());

        // Update only sessions, not sessionMessages
        store.setState((state) => ({
            ...state,
            sessions: { s1: { id: 's1', seq: 2 } },
        }));

        const snap2 = selector(store.getState());

        // Should be the SAME reference — no unnecessary re-render
        expect(Object.is(snap1, snap2)).toBe(true);
    });

    it('simulates useShallow behavior across two rapid set() calls', () => {
        const store = createTestStore();
        const msgs = ['msg1'];

        store.setState({
            sessions: { s1: { id: 's1', seq: 1 } },
            sessionMessages: { s1: { messages: msgs, isLoaded: true } },
        });

        // Simulate useShallow's prev.current
        let prevCurrent: { messages: string[]; isLoaded: boolean } | undefined;

        const wrappedSelector = (state: TestState) => {
            const session = state.sessionMessages['s1'];
            const next = {
                messages: session?.messages ?? [],
                isLoaded: session?.isLoaded ?? false,
            };
            if (prevCurrent && shallow(prevCurrent, next)) {
                return prevCurrent;
            }
            prevCurrent = next;
            return next;
        };

        // Initial call (during render)
        const render1 = wrappedSelector(store.getState());
        const lastRenderedSnapshot = render1;

        // --- applySessions: updates sessions AND creates new sessionMessages entry ---
        store.setState((state) => ({
            ...state,
            sessions: { s1: { id: 's1', seq: 2 } },
            sessionMessages: {
                ...state.sessionMessages,
                s1: {
                    // New array (same content) from Object.values().sort()
                    messages: [...msgs],
                    isLoaded: true,
                },
            },
        }));

        // Simulate useSyncExternalStore calling getSnapshot after first set()
        const afterApplySessions = wrappedSelector(store.getState());
        const shouldRerender1 = !Object.is(afterApplySessions, lastRenderedSnapshot);

        // --- applyMessages: adds new message ---
        store.setState((state) => ({
            ...state,
            sessionMessages: {
                ...state.sessionMessages,
                s1: {
                    messages: ['new-agent-response', ...msgs],
                    isLoaded: true,
                },
            },
        }));

        // Simulate useSyncExternalStore calling getSnapshot after second set()
        const afterApplyMessages = wrappedSelector(store.getState());
        const shouldRerender2 = !Object.is(afterApplyMessages, lastRenderedSnapshot);

        // At least ONE of these must be true for the component to re-render
        expect(shouldRerender1 || shouldRerender2).toBe(true);

        // Verify the final snapshot has the new message
        expect(afterApplyMessages.messages).toContain('new-agent-response');
    });

    it('simulates useShallow when applySessions does NOT touch sessionMessages', () => {
        const store = createTestStore();
        const msgs = ['msg1'];

        store.setState({
            sessions: { s1: { id: 's1', seq: 1 } },
            sessionMessages: { s1: { messages: msgs, isLoaded: true } },
        });

        let prevCurrent: { messages: string[]; isLoaded: boolean } | undefined;

        const wrappedSelector = (state: TestState) => {
            const session = state.sessionMessages['s1'];
            const next = {
                messages: session?.messages ?? [],
                isLoaded: session?.isLoaded ?? false,
            };
            if (prevCurrent && shallow(prevCurrent, next)) {
                return prevCurrent;
            }
            prevCurrent = next;
            return next;
        };

        const render1 = wrappedSelector(store.getState());
        const lastRenderedSnapshot = render1;

        // applySessions: updates sessions only, sessionMessages unchanged
        store.setState((state) => ({
            ...state,
            sessions: { s1: { id: 's1', seq: 2 } },
        }));

        const afterApplySessions = wrappedSelector(store.getState());
        // Same messages array ref, same isLoaded → shallow returns true → same prevCurrent
        expect(Object.is(afterApplySessions, lastRenderedSnapshot)).toBe(true);

        // applyMessages: new message added
        store.setState((state) => ({
            ...state,
            sessionMessages: {
                ...state.sessionMessages,
                s1: {
                    messages: ['new-agent-response', ...msgs],
                    isLoaded: true,
                },
            },
        }));

        const afterApplyMessages = wrappedSelector(store.getState());
        // Different messages array → shallow returns false → new prevCurrent
        expect(Object.is(afterApplyMessages, lastRenderedSnapshot)).toBe(false);
        expect(afterApplyMessages.messages).toContain('new-agent-response');
    });
});

// ============================================================
// 3. AsyncLock.tryRunSync tests
// ============================================================

describe('AsyncLock.tryRunSync', () => {
    it('runs func synchronously when lock is available', () => {
        const lock = new AsyncLock();
        let ran = false;

        const result = lock.tryRunSync(() => {
            ran = true;
        });

        expect(result).toBe(true);
        expect(ran).toBe(true);
    });

    it('returns false when lock is held', async () => {
        const lock = new AsyncLock();
        let resolve: () => void;
        const blockingPromise = new Promise<void>((r) => { resolve = r; });

        // Hold the lock with an async operation
        const lockPromise = lock.inLock(async () => {
            await blockingPromise;
        });

        // tryRunSync should fail
        let ran = false;
        const result = lock.tryRunSync(() => {
            ran = true;
        });

        expect(result).toBe(false);
        expect(ran).toBe(false);

        // Clean up
        resolve!();
        await lockPromise;
    });

    it('releases lock even if func throws', () => {
        const lock = new AsyncLock();

        expect(() => {
            lock.tryRunSync(() => {
                throw new Error('test error');
            });
        }).toThrow('test error');

        // Lock should be available again
        let ran = false;
        lock.tryRunSync(() => {
            ran = true;
        });
        expect(ran).toBe(true);
    });

    it('serializes with inLock correctly', async () => {
        const lock = new AsyncLock();
        const order: string[] = [];

        // First: acquire lock synchronously
        lock.tryRunSync(() => {
            order.push('sync');
        });

        // Second: acquire lock asynchronously
        await lock.inLock(() => {
            order.push('async');
        });

        expect(order).toEqual(['sync', 'async']);
    });
});

// ============================================================
// 4. Direct selector comparison test (the fix approach)
// ============================================================

describe('Direct selector vs useShallow selector', () => {
    interface TestState {
        sessionMessages: Record<string, { messages: string[]; isLoaded: boolean }>;
    }

    it('direct selector always returns different ref when messages array changes', () => {
        const store = create<TestState>()(() => ({
            sessionMessages: {
                s1: { messages: ['msg1'], isLoaded: true },
            },
        }));

        // Direct selector (our fix)
        const directSelector = (state: TestState) =>
            state.sessionMessages['s1']?.messages ?? [];

        const snap1 = directSelector(store.getState());

        store.setState((state) => ({
            sessionMessages: {
                ...state.sessionMessages,
                s1: { messages: ['msg2', 'msg1'], isLoaded: true },
            },
        }));

        const snap2 = directSelector(store.getState());

        expect(Object.is(snap1, snap2)).toBe(false);
    });

    it('direct selector returns SAME ref when messages array is untouched', () => {
        const msgs = ['msg1'];
        const store = create<TestState>()(() => ({
            sessionMessages: {
                s1: { messages: msgs, isLoaded: true },
            },
        }));

        const directSelector = (state: TestState) =>
            state.sessionMessages['s1']?.messages ?? [];

        const snap1 = directSelector(store.getState());

        // Update something else that doesn't create a new sessionMessages entry
        // (This simulates a set() that doesn't touch this session's messages)
        // In reality, if set() creates a new top-level state but sessionMessages['s1']
        // keeps the same reference, the selector returns the same array.

        const snap2 = directSelector(store.getState());

        expect(Object.is(snap1, snap2)).toBe(true);
    });
});
