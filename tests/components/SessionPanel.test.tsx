// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SessionPanel } from '../../src/components/SessionPanel';
import { jsonResponse } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SessionPanel', () => {
  it('lists sessions from the read-only client without hardware', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/sessions')) return jsonResponse([{ session_id: 'ride-1', started_at: 1 }]);
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SessionPanel
        token=""
        onTokenChange={vi.fn()}
        serverUrl="http://localhost:8000"
        onServerUrlChange={vi.fn()}
        onLoad={vi.fn()}
      />
    );

    expect(screen.getByText('recorded sessions')).toBeTruthy();
    expect(screen.getByText('No sessions loaded. Enter the URL and token, then Refresh.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

    expect(await screen.findByText('ride-1')).toBeTruthy();
    expect(screen.getByText('1 session on the server.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
