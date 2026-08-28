import { describe, expect, it } from 'vitest';
import { UrlSubmissionState } from '../enums';
import {
  assertSubmissionStateTransition,
  canTransitionSubmissionState,
  InvalidSubmissionStateTransitionError,
  isTerminalSubmissionState,
} from './submission-state-machine';

describe('submission state machine', () => {
  it('allows the full valid RECEIVED -> SUBMITTED path', () => {
    const path = [
      UrlSubmissionState.RECEIVED,
      UrlSubmissionState.VALIDATING,
      UrlSubmissionState.ACCEPTED,
      UrlSubmissionState.QUEUED,
      UrlSubmissionState.PROCESSING,
      UrlSubmissionState.SUBMITTED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionSubmissionState(path[i], path[i + 1])).toBe(true);
    }
  });

  it('allows PROCESSING -> FAILED', () => {
    expect(
      canTransitionSubmissionState(UrlSubmissionState.PROCESSING, UrlSubmissionState.FAILED),
    ).toBe(true);
  });

  it('rejects skipping states, e.g. RECEIVED -> SUBMITTED directly', () => {
    expect(
      canTransitionSubmissionState(UrlSubmissionState.RECEIVED, UrlSubmissionState.SUBMITTED),
    ).toBe(false);
  });

  it('rejects transitions out of terminal states', () => {
    expect(
      canTransitionSubmissionState(UrlSubmissionState.FAILED, UrlSubmissionState.QUEUED),
    ).toBe(false);
    expect(
      canTransitionSubmissionState(UrlSubmissionState.INDEXED, UrlSubmissionState.MONITORING),
    ).toBe(false);
  });

  it('assertSubmissionStateTransition throws a typed error on an invalid transition', () => {
    expect(() =>
      assertSubmissionStateTransition(UrlSubmissionState.RECEIVED, UrlSubmissionState.FAILED),
    ).toThrow(InvalidSubmissionStateTransitionError);
  });

  it('assertSubmissionStateTransition is a no-op on a valid transition', () => {
    expect(() =>
      assertSubmissionStateTransition(UrlSubmissionState.RECEIVED, UrlSubmissionState.VALIDATING),
    ).not.toThrow();
  });

  it('treats INDEXED and FAILED as terminal, but NOT_INDEXED as re-checkable', () => {
    expect(isTerminalSubmissionState(UrlSubmissionState.INDEXED)).toBe(true);
    expect(isTerminalSubmissionState(UrlSubmissionState.FAILED)).toBe(true);
    expect(isTerminalSubmissionState(UrlSubmissionState.NOT_INDEXED)).toBe(false);
  });
});
