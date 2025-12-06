import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReferenceEnvField from '../ReferenceEnvField';
import { readEnvList } from '@/components/nodeProperties/utils';

const pointerProto = Element.prototype as unknown as {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

if (!pointerProto.hasPointerCapture) {
  pointerProto.hasPointerCapture = () => false;
}
if (!pointerProto.setPointerCapture) {
  pointerProto.setPointerCapture = () => {};
}
if (!pointerProto.releasePointerCapture) {
  pointerProto.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('ReferenceEnvField', () => {
  it('adds rows and emits array', () => {
    const initial = readEnvList([{ name: 'FOO', value: '1' }]);
    const latest: { current: ReturnType<typeof readEnvList> } = { current: initial };

    function Harness() {
      const [items, setItems] = useState(initial);
      return (
        <ReferenceEnvField
          value={items}
          onChange={(next) => {
            latest.current = next;
            setItems(next);
          }}
          addLabel="Add env"
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId('env-add'));
    fireEvent.change(screen.getByTestId('env-name-1'), { target: { value: 'BAR' } });
    fireEvent.change(screen.getByTestId('env-value-1'), { target: { value: '2' } });
    expect(Array.isArray(latest.current)).toBe(true);
    expect(latest.current[1]).toMatchObject({ name: 'BAR', value: '2', source: 'static' });
  });

  it('renders controls in order and uses icon-only remove', () => {
    const initial = readEnvList([{ name: 'FOO', value: '1' }]);
    function Harness() {
      const [items, setItems] = useState(initial);
      return <ReferenceEnvField value={items} onChange={setItems} />;
    }

    render(<Harness />);
    const row = screen.getByTestId('env-name-0').closest('div');
    expect(row).toBeTruthy();
    const inputsAndButtons = row!.querySelectorAll('input, button');
    expect(inputsAndButtons.length).toBeGreaterThanOrEqual(3);
    expect(inputsAndButtons[0]).toBe(screen.getByTestId('env-name-0'));
    expect(inputsAndButtons[1]).toBe(screen.getByTestId('env-value-0'));
    const removeBtn = screen.getByLabelText('Remove variable');
    expect(removeBtn).toBeTruthy();
  });

  it('changes source type to secret and resets value', async () => {
    const initial = readEnvList([{ name: 'FOO', value: '', source: 'static' }]);
    const latest: { current: ReturnType<typeof readEnvList> } = { current: initial };
    function Harness() {
      const [items, setItems] = useState(initial);
      return (
        <ReferenceEnvField
          value={items}
          onChange={(next) => {
            latest.current = next;
            setItems(next);
          }}
        />
      );
    }

    render(<Harness />);
    const row = screen.getByTestId('env-name-0').closest('div') as HTMLElement;
    const trigger = within(row).getByRole('combobox');
    const user = userEvent.setup();
    await user.click(trigger);
    const secretOption = await screen.findByText(/secret/i);
    await user.click(secretOption);

    expect(latest.current[0].source).toBe('vault');
    expect(latest.current[0].value).toBe('');
  });
});
