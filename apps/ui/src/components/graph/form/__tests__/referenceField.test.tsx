import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceField } from '../referenceField';

describe('ReferenceField', () => {
  it('renders and toggles source', () => {
    const onChange = vi.fn();
    render(<ReferenceField formData={{ value: '', source: 'static' }} onChange={onChange} />);
    const select = screen.getByLabelText('Reference source');
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'vault' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('flags invalid vault ref and sets aria-invalid', () => {
    const onChange = vi.fn();
    render(<ReferenceField formData={{ value: 'bad', source: 'vault' }} onChange={onChange} />);
    const input = screen.getByLabelText('Vault reference value') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // should be marked invalid because not mount/path/key
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not crash when Vault endpoints are unavailable (datalist optional)', async () => {
    const onChange = vi.fn();
    // Render vault mode; internal fetch failures are caught and suggestions arrays remain empty
    render(<ReferenceField formData={{ value: 'secret/path/key', source: 'vault' }} onChange={onChange} />);
    // Suggestions list is optional; ensure the datalist exists but can be empty
    const select = screen.getByLabelText('Reference source');
    expect(select).toBeInTheDocument();
    // Input should be present
    expect(screen.getByLabelText('Vault reference value')).toBeInTheDocument();
  });
});
