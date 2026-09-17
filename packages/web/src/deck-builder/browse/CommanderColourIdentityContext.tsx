import {
  resolveCommanderColourIdentity,
  type CommanderColourIdentity,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

const CommanderColourIdentityContext = createContext<CommanderColourIdentity | null>(null);

/** Provide live-deck commander identity so CardTiles can flag off-identity cards. */
export function CommanderColourIdentityProvider({
  deck,
  children,
}: {
  deck: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>;
  children: ReactNode;
}) {
  const identity = useMemo(
    () => resolveCommanderColourIdentity(deck),
    [deck.format, deck.cards, deck.oracle],
  );
  return (
    <CommanderColourIdentityContext.Provider value={identity}>
      {children}
    </CommanderColourIdentityContext.Provider>
  );
}

export function useCommanderColourIdentity(): CommanderColourIdentity | null {
  return useContext(CommanderColourIdentityContext);
}
