import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronsDown, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Label } from '../ui/label';

type Option = {
    value: string;
    label: string;
};

interface VirtualizedCommandProps {
    height: string;
    options: Option[];
    placeholder: string;
    selectedOption: string;
    onSelectOption?: (option: string) => void;
    width?: string;
}

const VirtualizedCommand = ({
    height,
    options,
    placeholder,
    selectedOption,
    onSelectOption,
    width = 'auto',
}: VirtualizedCommandProps) => {
    const [filteredOptions, setFilteredOptions] = React.useState<Option[]>(options);
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const [isKeyboardNavActive, setIsKeyboardNavActive] = React.useState(false);

    const parentRef = React.useRef(null);

    const virtualizer = useVirtualizer({
        count: filteredOptions.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 35,
    });

    const virtualOptions = virtualizer.getVirtualItems();

    const scrollToIndex = (index: number) => {
        virtualizer.scrollToIndex(index, {
            align: 'center',
        });
    };

    const handleSearch = (search: string) => {
        setIsKeyboardNavActive(false);
        setFilteredOptions(
            options.filter((option) => option.label.trim().toLowerCase().includes((search ?? '').toLowerCase())),
        );
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        switch (event.key) {
            case 'ArrowDown': {
                event.preventDefault();
                setIsKeyboardNavActive(true);
                setFocusedIndex((prev) => {
                    const newIndex = prev === -1 ? 0 : Math.min(prev + 1, filteredOptions.length - 1);
                    scrollToIndex(newIndex);
                    return newIndex;
                });
                break;
            }
            case 'ArrowUp': {
                event.preventDefault();
                setIsKeyboardNavActive(true);
                setFocusedIndex((prev) => {
                    const newIndex = prev === -1 ? filteredOptions.length - 1 : Math.max(prev - 1, 0);
                    scrollToIndex(newIndex);
                    return newIndex;
                });
                break;
            }
            case 'Enter': {
                event.preventDefault();
                if (filteredOptions[focusedIndex]) {
                    onSelectOption?.(filteredOptions[focusedIndex].value);
                }
                break;
            }
            default:
                break;
        }
    };

    React.useEffect(() => {
        if (selectedOption) {
            const option = filteredOptions.find((option) => option.value === selectedOption);
            if (option) {
                const index = filteredOptions.indexOf(option);
                setFocusedIndex(index);
                virtualizer.scrollToIndex(index, {
                    align: 'center',
                });
            }
        }
    }, [selectedOption, filteredOptions, virtualizer]);

    return (
        <Command shouldFilter={false} onKeyDown={handleKeyDown}>
            <CommandInput onValueChange={handleSearch} placeholder={placeholder} />
            <CommandList
                ref={parentRef}
                style={{
                    height: height,
                    width: '100%',
                    overflow: 'auto',
                }}
                onMouseDown={() => setIsKeyboardNavActive(false)}
                onMouseMove={() => setIsKeyboardNavActive(false)}
            >
                <CommandEmpty>No item found.</CommandEmpty>
                <CommandGroup>
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {virtualOptions.map((virtualOption:any) => (
                            <CommandItem
                                key={filteredOptions[virtualOption.index].value}
                                disabled={isKeyboardNavActive}
                                className={cn(
                                    'absolute left-0 top-0 w-full bg-transparent',
                                    focusedIndex === virtualOption.index && 'bg-accent text-accent-foreground',
                                    isKeyboardNavActive &&
                                    focusedIndex !== virtualOption.index &&
                                    'aria-selected:bg-transparent aria-selected:text-primary',
                                )}
                                style={{
                                    height: `${virtualOption.size}px`,
                                    transform: `translateY(${virtualOption.start}px)`,
                                }}
                                value={filteredOptions[virtualOption.index].value}
                                onMouseEnter={() => !isKeyboardNavActive && setFocusedIndex(virtualOption.index)}
                                onMouseLeave={() => !isKeyboardNavActive && setFocusedIndex(-1)}
                                onSelect={onSelectOption}
                            >
                                <Check
                                    className={cn(
                                        'mr-2 h-4 w-4',
                                        selectedOption === filteredOptions[virtualOption.index].value
                                            ? 'opacity-100'
                                            : 'opacity-0',
                                    )}
                                />
                                {filteredOptions[virtualOption.index].label}
                            </CommandItem>
                        ))}
                    </div>
                </CommandGroup>
            </CommandList>
        </Command>
    );
};

interface VirtualizedComboboxProps {
    id: string;
    label: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    width?: string;
    height?: string;
    disabled?: boolean;
}

export function VirtualizedCombobox({
    id,
    label,
    disabled = false,
    value = "",
    options,
    onChange,
    placeholder = 'Search items...',
    width = '400px',
    height = '400px',
}: VirtualizedComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const [selectedOption, setSelectedOption] = React.useState(value);
    const [divWidth, setDivWidth] = React.useState(width);

    React.useEffect(() => {
        setSelectedOption(value);
        if (value) {
            const option = options.find((option) => option.value === value);
            if (option) {
                setSelectedOption(option.value);
            }
        }
    }, [value]);

    React.useEffect(() => {
        const handleResize = () => {
            const element = document.getElementById(id);
            if (element) {
                setDivWidth(`${element.offsetWidth}px`);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [id]);

    return (
        <div className='space-y-2 flex w-full flex-col' id={id}>
            <Label htmlFor={id}>{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className="justify-between"
                        style={{
                            width: divWidth,
                            color: selectedOption ? 'black' : 'gray',
                        }}
                    >
                        {selectedOption ? options.find((option) => option?.value === selectedOption)?.label : placeholder}
                        <ChevronsDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" style={{ width: divWidth }}>
                    <VirtualizedCommand
                        height={height}
                        options={options}
                        placeholder={placeholder}
                        selectedOption={selectedOption}
                        onSelectOption={(currentValue) => {
                            setSelectedOption(currentValue === selectedOption ? '' : currentValue);
                            onChange(currentValue);
                            setOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
