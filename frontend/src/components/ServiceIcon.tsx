import { findService, iconColor } from '../data/services';

// The service's logo on a white tile, or the subscription's first letter when there's no logo
export default function ServiceIcon({
  service,
  name,
  size = 'md',
}: {
  service: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const icon = findService(service)?.icon;
  if (!icon) {
    return (
      <span className={`avatar ${size}`} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className={`avatar logo ${size}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" role="presentation">
        <path d={icon.path} fill={iconColor(icon)} />
      </svg>
    </span>
  );
}
