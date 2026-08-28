import { UrlSubmissionState } from '../enums';

export const SUBMISSION_STATE_TRANSITIONS: Record<UrlSubmissionState, UrlSubmissionState[]> = {
  [UrlSubmissionState.RECEIVED]: [UrlSubmissionState.VALIDATING],
  [UrlSubmissionState.VALIDATING]: [UrlSubmissionState.ACCEPTED, UrlSubmissionState.FAILED],
  [UrlSubmissionState.ACCEPTED]: [UrlSubmissionState.QUEUED],
  [UrlSubmissionState.QUEUED]: [UrlSubmissionState.PROCESSING],
  [UrlSubmissionState.PROCESSING]: [UrlSubmissionState.SUBMITTED, UrlSubmissionState.FAILED],
  [UrlSubmissionState.SUBMITTED]: [UrlSubmissionState.MONITORING],
  [UrlSubmissionState.MONITORING]: [
    UrlSubmissionState.INDEXED,
    UrlSubmissionState.NOT_INDEXED,
    UrlSubmissionState.FAILED,
  ],
  [UrlSubmissionState.INDEXED]: [],
  [UrlSubmissionState.NOT_INDEXED]: [UrlSubmissionState.MONITORING],
  [UrlSubmissionState.FAILED]: [],
};

export function canTransitionSubmissionState(
  from: UrlSubmissionState,
  to: UrlSubmissionState,
): boolean {
  return SUBMISSION_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidSubmissionStateTransitionError extends Error {
  constructor(
    public readonly from: UrlSubmissionState,
    public readonly to: UrlSubmissionState,
  ) {
    super(`Invalid submission state transition: ${from} -> ${to}`);
    this.name = 'InvalidSubmissionStateTransitionError';
  }
}

export function assertSubmissionStateTransition(
  from: UrlSubmissionState,
  to: UrlSubmissionState,
): void {
  if (!canTransitionSubmissionState(from, to)) {
    throw new InvalidSubmissionStateTransitionError(from, to);
  }
}

export function isTerminalSubmissionState(state: UrlSubmissionState): boolean {
  return SUBMISSION_STATE_TRANSITIONS[state].length === 0;
}
