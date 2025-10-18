"use client";

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '../utils/cn';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('bg-background p-3 [--cell-size:--spacing(8)]', className)}
      classNames={{
        root: 'w-fit',
        months: 'flex gap-4 flex-col md:flex-row',
        month: 'flex flex-col w-full gap-4',
        nav: 'flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between',
        button_previous:
          'h-(--cell-size) w-(--cell-size) p-0 select-none rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
        button_next:
          'h-(--cell-size) w-(--cell-size) p-0 select-none rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
        month_caption: 'flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)',
        caption_label: 'select-none font-medium text-sm',
        dropdowns:
          'w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5',
        dropdown_root:
          'relative rounded-md border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] has-focus:border-ring',
        dropdown: 'absolute inset-0 opacity-0',
        table: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none',
        week: 'flex w-full mt-2',
        week_number_header: 'w-(--cell-size) select-none',
        week_number: 'text-[0.8rem] select-none text-muted-foreground',
        day:
          'relative w-full h-full p-0 text-center text-sm font-normal aspect-square aria-selected:opacity-100',
        selected: 'bg-primary text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside: 'text-muted-foreground opacity-50 aria-selected:text-muted-foreground',
        disabled: 'opacity-50',
        range_start: 'rounded-l-md bg-accent',
        range_middle: 'rounded-none',
        range_end: 'rounded-r-md bg-accent',
        hidden: 'invisible',
        ...classNames
      } as any}
      {...props}
    />
  );
}

export { Calendar };
