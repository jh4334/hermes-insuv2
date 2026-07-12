import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { LOCAL_SNAPSHOT_KEY } from '../taskStorage';

/**
 * 최상위 에러 경계.
 * 로컬-first 앱이라 사용자 데이터가 브라우저에만 있으므로, 렌더 예외로 화면이
 * 백지가 되면 데이터에 접근할 수도, 백업할 수도 없게 된다. 예외를 잡아
 * 친절한 안내와 함께 (1) 로컬 데이터 백업 내려받기 (2) 새로고침을 제공해
 * 사용자가 데이터를 지키고 복구할 수 있게 한다.
 */

type Props = { readonly children: ReactNode };
type State = { readonly hasError: boolean; readonly message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : '알 수 없는 오류' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 프로덕션에서는 에러 모니터링(예: Sentry)으로 보내는 자리.
    // 개인정보가 담길 수 있는 사용자 데이터는 보내지 않고 메시지/스택만 남긴다.
    console.error('앱 렌더 오류:', error, info.componentStack);
  }

  private downloadBackup = (): void => {
    try {
      const raw = localStorage.getItem(LOCAL_SNAPSHOT_KEY);
      if (!raw) {
        alert('저장된 로컬 데이터가 없어 백업할 내용이 없습니다.');
        return;
      }
      const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'modoo-insu-emergency-backup.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('백업을 내려받지 못했습니다. 브라우저 저장소 접근이 차단되었을 수 있습니다.');
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <div className="max-w-md space-y-3 border border-border bg-surface p-8 shadow-sm">
          <h1 className="font-display text-xl font-extrabold">화면을 표시하는 중 문제가 생겼어요</h1>
          <p className="text-sm text-muted-foreground">
            작업하던 로컬 데이터는 이 기기에 그대로 남아 있습니다. 아래에서 먼저 백업을 내려받은 뒤 새로고침해 주세요.
            문제가 계속되면 백업 파일을 보관하고 관리자에게 알려 주세요.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button type="button" onClick={this.downloadBackup} className="bg-ember px-4 py-2 text-sm font-semibold text-ember-foreground hover:brightness-110">
              로컬 데이터 백업 내려받기
            </button>
            <button type="button" onClick={() => window.location.reload()} className="border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-ember">
              새로고침
            </button>
          </div>
          <p className="pt-1 font-mono text-[11px] text-muted-foreground">{this.state.message}</p>
        </div>
      </div>
    );
  }
}
