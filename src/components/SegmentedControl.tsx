type SegmentedControlProps = {
  options: { label: string; value: string; checked?: boolean; description?: string }[];
  name: string;
  onChange?: (value: string) => void;
  columns?: 2 | 3;
};

export function SegmentedControl({ options, name, onChange, columns }: SegmentedControlProps) {
  return (
    <div className={`selection-cards selection-cards--${columns ?? Math.min(options.length, 3)}`}>
      {options.map((option) => (
        <label key={option.value} className="selection-card">
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.checked}
            className="selection-card__input"
            onChange={() => onChange?.(option.value)}
          />
          <div className="selection-card__surface">
            <span className="selection-card__indicator" aria-hidden="true" />
            <span className="selection-card__label">{option.label}</span>
            {option.description ? <span className="selection-card__description">{option.description}</span> : null}
          </div>
        </label>
      ))}
    </div>
  );
}
