import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { LoadingSpinner } from '../LoadingSpinner';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LoadingSpinner', () => {
  it('shows the message, then the slow message once the threshold passes', () => {
    const { getByText, queryByText } = render(
      <LoadingSpinner message="Reading ingredients…" slowMessage="Still working…" slowThresholdMs={30000} />
    );
    expect(getByText('Reading ingredients…')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(29999);
    });
    expect(queryByText('Still working…')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(getByText('Still working…')).toBeTruthy();
  });

  it('does not restart the slow timer when the slow message changes mid-wait', () => {
    // The scan screen swaps the slow copy when the upload finishes and the
    // server takes over. A phase change at 25 s must not push the 30 s slow
    // message out to 55 s (plans/weak-signal-upload-2026-08-28.md, C2).
    const { getByText, rerender } = render(
      <LoadingSpinner message="Uploading photo… 12%" slowMessage="Slow connection — still uploading." slowThresholdMs={30000} />
    );

    act(() => {
      jest.advanceTimersByTime(25000);
    });
    rerender(
      <LoadingSpinner message="Reading ingredients…" slowMessage="This is taking longer than usual." slowThresholdMs={30000} />
    );
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(getByText('This is taking longer than usual.')).toBeTruthy();
  });

  it('shows whichever slow message is current once slow', () => {
    const { getByText, rerender } = render(
      <LoadingSpinner message="Uploading photo…" slowMessage="Slow connection — still uploading." slowThresholdMs={30000} />
    );
    act(() => {
      jest.advanceTimersByTime(30000);
    });
    expect(getByText('Slow connection — still uploading.')).toBeTruthy();

    rerender(
      <LoadingSpinner message="Reading ingredients…" slowMessage="This is taking longer than usual." slowThresholdMs={30000} />
    );
    expect(getByText('This is taking longer than usual.')).toBeTruthy();
  });

  it('offers Cancel and calls back', () => {
    const onCancel = jest.fn();
    const { getByLabelText } = render(<LoadingSpinner onCancel={onCancel} />);
    fireEvent.press(getByLabelText('Cancel scan'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
