import { useRef } from 'react';

export type MenuAction =
  | { label: string; onSelect: () => void; danger?: boolean; href?: never }
  | { label: string; href: string; danger?: boolean; onSelect?: never };

// A small dropdown menu built on <details>, so it opens with a click, Enter or Space.
// Items are buttons, or links (e.g. file downloads).
export default function ActionsMenu({
  label,
  actions,
  trigger = '⋯',
}: {
  label: string;
  actions: MenuAction[];
  trigger?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  return (
    <details className={`actions-menu${trigger === '⋯' ? '' : ' text-trigger'}`} ref={ref}>
      <summary aria-label={label} title={label}>
        {trigger}
      </summary>
      <div className="actions-menu-list" role="menu">
        {actions.map((action) =>
          action.href ? (
            <a key={action.label} role="menuitem" href={action.href} download onClick={close}>
              {action.label}
            </a>
          ) : (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'danger' : undefined}
              onClick={() => {
                close();
                action.onSelect?.();
              }}
            >
              {action.label}
            </button>
          ),
        )}
      </div>
    </details>
  );
}
