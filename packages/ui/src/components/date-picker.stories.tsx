import type { Meta, StoryObj } from '@storybook/react';
import { DatePicker } from './date-picker';
import * as React from 'react';
import { enUS } from 'date-fns/locale';

const meta = { title: 'Components/Date Picker', component: DatePicker, args: { locale: enUS } } satisfies Meta<typeof DatePicker> as any;
export default meta as Meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>();
    return <DatePicker date={date} onChange={setDate} />;
  }
};

