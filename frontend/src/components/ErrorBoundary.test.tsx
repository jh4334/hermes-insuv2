import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { LOCAL_SNAPSHOT_KEY } from '../taskStorage';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  },
  configurable: true,
});

function Boom(): never {
  throw new Error('의도적 렌더 실패');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => cleanup());

  it('renders children normally when there is no error', () => {
    render(<ErrorBoundary><p>정상 콘텐츠</p></ErrorBoundary>);
    expect(screen.getByText('정상 콘텐츠')).toBeInTheDocument();
  });

  it('shows a recovery panel with backup + refresh actions when a child throws', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/문제가 생겼어요/);
    expect(alert).toHaveTextContent(/로컬 데이터는 이 기기에 그대로 남아 있습니다/);
    expect(screen.getByRole('button', { name: /로컬 데이터 백업 내려받기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /새로고침/ })).toBeInTheDocument();
  });

  it('downloads the stored snapshot when backup is clicked', () => {
    storage.set(LOCAL_SNAPSHOT_KEY, '{"schemaVersion":1,"tasks":[]}');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(globalThis.URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });

    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /로컬 데이터 백업 내려받기/ }));
    expect(click).toHaveBeenCalled();
  });
});
