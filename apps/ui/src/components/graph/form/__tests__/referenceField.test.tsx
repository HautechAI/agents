import React from 'react';
<<<<<<< HEAD
import { describe, it, expect, vi } from 'vitest';
=======
import { describe, it, expect } from 'vitest';
>>>>>>> 42b54f2 (feat(config,#113): unify env and token references with source-aware fields)
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
});
<<<<<<< HEAD
=======

>>>>>>> 42b54f2 (feat(config,#113): unify env and token references with source-aware fields)
