import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/lib/utils';

export function Modal({
  title,
  subtitle,
  icon,
  wide,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cx('modal', wide && 'wide')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          {icon && (
            <span
              className="empty-glyph"
              style={{ width: 34, height: 34, borderRadius: 10, boxShadow: 'none' }}
            >
              {icon}
            </span>
          )}
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={13} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
