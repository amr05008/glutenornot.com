import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ResultFooter } from '../ResultFooter';
import { REVIEW_SCAN_THRESHOLD } from '../../services/review';

jest.mock('../../services/review', () => ({
  REVIEW_SCAN_THRESHOLD: 3,
}));

describe('ResultFooter (plans/review-prompt-visibility-2026-09-15.md D4)', () => {
  it('shows the scan counter, singular and plural', () => {
    expect(render(<ResultFooter scanCount={1} onRate={jest.fn()} />).getByText('1 scan')).toBeTruthy();
    expect(render(<ResultFooter scanCount={7} onRate={jest.fn()} />).getByText('7 scans')).toBeTruthy();
  });

  it('hides the write-review line below the scan threshold', () => {
    const { queryByText, queryByLabelText } = render(
      <ResultFooter scanCount={REVIEW_SCAN_THRESHOLD - 1} onRate={jest.fn()} />
    );
    expect(queryByText(/Write us a review/)).toBeNull();
    expect(queryByLabelText('Write us a review on the App Store')).toBeNull();
  });

  it('shows the write-review line at the threshold and calls onRate when tapped', () => {
    const onRate = jest.fn();
    const { getByText, getByLabelText } = render(
      <ResultFooter scanCount={REVIEW_SCAN_THRESHOLD} onRate={onRate} />
    );
    expect(getByText(/Your feedback matters!/)).toBeTruthy();
    fireEvent.press(getByLabelText('Write us a review on the App Store'));
    expect(onRate).toHaveBeenCalledTimes(1);
  });

  it('no longer offers the retired feedback-form link', () => {
    const { queryByText } = render(<ResultFooter scanCount={10} onRate={jest.fn()} />);
    expect(queryByText(/Run into an issue/)).toBeNull();
    expect(queryByText(/Share your feedback/)).toBeNull();
  });
});
