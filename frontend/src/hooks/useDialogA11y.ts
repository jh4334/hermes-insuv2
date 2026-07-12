import { useEffect, useRef } from 'react';

/**
 * 모달 다이얼로그 접근성 보조 훅.
 * - Esc 키를 누르면 onClose를 호출한다(키보드 사용자가 모달을 벗어날 수 있게).
 * - 모달이 열릴 때 컨테이너로 포커스를 옮겨 스크린리더/키보드 흐름을 이어준다.
 *
 * 반환한 ref를 다이얼로그 컨테이너(role="dialog")에 연결한다.
 */
export function useDialogA11y<T extends HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (node && typeof node.focus === 'function') {
      // tabIndex=-1 컨테이너로 포커스 이동(초점 잃음 방지).
      node.focus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return containerRef;
}
