"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FileText, Link2, Bell } from "lucide-react";
import { type LocalItem } from "@/lib/db/indexed-db";
import { getItems } from "@/lib/sync/sync-engine";

interface SearchBarProps {
  onSelect: (item: LocalItem) => void;
}

const typeIcons = {
  note: FileText,
  url: Link2,
  reminder: Bell,
};

export function SearchCommand({ onSelect }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocalItem[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const items = await getItems(undefined, q);
    setResults(items.slice(0, 10));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 150);
    return () => clearTimeout(timeout);
  }, [query, search]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search everything..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading="Results">
            {results.map((item) => {
              const Icon = typeIcons[item.type];
              return (
                <CommandItem
                  key={item.clientId}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.content && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.content.slice(0, 60)}
                      </p>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
