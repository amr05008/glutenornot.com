import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Toast } from '../Toast';

// Use fake timers for auto-dismiss testing
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Toast', () => {
  it('displays the message when visible', () => {
    const { getByText } = render(
      <Toast message="Something went wrong" visible={true} onHide={jest.fn()} />
    );
    expect(getByText('Something went wrong')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    const { queryByText } = render(
      <Toast message="Something went wrong" visible={false} onHide={jest.fn()} />
    );
    expect(queryByText('Something went wrong')).toBeNull();
  });

  it('auto-dismisses after the default duration', () => {
    const onHide = jest.fn();
    render(<Toast message="Error" visible={true} onHide={onHide} />);

    // Not dismissed yet before duration
    act(() => {
      jest.advanceTimersByTime(3900);
    });
    expect(onHide).not.toHaveBeenCalled();

    // Dismissed after duration + fade out
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('dismisses immediately when tapped', () => {
    const onHide = jest.fn();
    const { getByRole } = render(
      <Toast message="Tap to dismiss me" visible={true} onHide={onHide} />
    );

    // Tap the toast — should dismiss without waiting for auto-dismiss
    fireEvent.press(getByRole('alert'));

    // Allow the fade-out animation to complete
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('shows a "Tap to dismiss" hint', () => {
    const { getByText } = render(
      <Toast message="Error occurred" visible={true} onHide={jest.fn()} />
    );
    expect(getByText('Tap to dismiss')).toBeTruthy();
  });

  it('has accessible dismiss hint', () => {
    const { getByRole } = render(
      <Toast message="Error occurred" visible={true} onHide={jest.fn()} />
    );
    const alert = getByRole('alert');
    expect(alert.props.accessibilityHint).toBe('Tap to dismiss');
  });

  it('does not call onHide twice if tapped then auto-dismiss fires', () => {
    const onHide = jest.fn();
    const { getByRole } = render(
      <Toast message="Error" visible={true} duration={4000} onHide={onHide} />
    );

    // Tap to dismiss early
    fireEvent.press(getByRole('alert'));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onHide).toHaveBeenCalledTimes(1);

    // Let auto-dismiss timer pass — should NOT call onHide again
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
