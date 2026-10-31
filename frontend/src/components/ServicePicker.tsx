import { useMemo, useState } from 'react';
import { SERVICES, type ServicePreset } from '../data/services';
import ServiceIcon from './ServiceIcon';

// First step of "Add subscription": pick a known service, or start from a blank form
export default function ServicePicker({
  onPick,
}: {
  // A preset, or null plus the typed name for a custom subscription
  onPick: (preset: ServicePreset | null, customName: string) => void;
}) {
  const [search, setSearch] = useState('');
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? SERVICES.filter((s) => s.name.toLowerCase().includes(term)) : SERVICES;
  }, [search]);

  return (
    <div className="service-picker">
      <label>
        <span className="visually-hidden">Search services</span>
        <input
          type="search"
          placeholder="Search services, e.g. Netflix"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </label>

      <div className="service-grid" role="list">
        <button
          type="button"
          className="service-tile custom"
          role="listitem"
          onClick={() => onPick(null, search.trim())}
        >
          <span className="avatar md plus" aria-hidden="true">
            +
          </span>
          <span>{search.trim() ? `Add “${search.trim()}”` : 'Custom'}</span>
        </button>
        {matches.map((service) => (
          <button
            key={service.slug}
            type="button"
            className="service-tile"
            role="listitem"
            onClick={() => onPick(service, '')}
          >
            <ServiceIcon service={service.slug} name={service.name} />
            <span>{service.name}</span>
          </button>
        ))}
      </div>
      {matches.length === 0 && (
        <p className="muted small">
          No preset for that one. Use the custom option to add it yourself.
        </p>
      )}
    </div>
  );
}
