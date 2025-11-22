import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider, SecretsScreen } from '@agyn/ui-new';

describe('SecretsScreen masking', () => {
  it('unmasks only the targeted secret row', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <TooltipProvider delayDuration={0}>
        <SecretsScreen
          secrets={[
            { id: 'a', key: 'secret/a', value: 'value-a', status: 'used' },
            { id: 'b', key: 'secret/b', value: 'value-b', status: 'used' },
          ]}
          renderSidebar={false}
        />
      </TooltipProvider>,
    );

    const firstRow = screen.getByText('secret/a').closest('tr');
    const secondRow = screen.getByText('secret/b').closest('tr');
    if (!firstRow || !secondRow) throw new Error('Expected rows to be present');

    await user.click(within(firstRow).getByRole('button', { name: /Unmask secret value/ }));
    await waitFor(() => expect(within(firstRow).getByText('value-a')).toBeInTheDocument());
    expect(within(secondRow).queryByText('value-b')).toBeNull();

    await user.click(within(secondRow).getByRole('button', { name: /Unmask secret value/ }));
    await waitFor(() => expect(within(secondRow).getByText('value-b')).toBeInTheDocument());
  });
});
