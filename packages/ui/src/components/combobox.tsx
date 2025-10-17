"use client";

import * as React from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from './button';
import { cn } from '../utils/cn';

type Option = { label: string; value: string };

interface ComboboxProps {
  options: Option[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function Combobox({ options, value, onChange, placeholder = 'Select option...' }: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-[200px] justify-between">
          {selected ? selected.label : placeholder}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>No results.</CommandEmpty>
          <CommandList>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange?.(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 size-4', opt.value === value ? 'opacity-100' : 'opacity-0')} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

