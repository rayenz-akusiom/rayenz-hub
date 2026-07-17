import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CardImageFace } from '@rayenz-hub/shared';

type FaceMap = Record<string, CardImageFace>;

export type CardFaceSessionValue = {
  getFace: (key: string) => CardImageFace;
  setFace: (key: string, face: CardImageFace) => void;
};

const CardFaceSessionContext = createContext<CardFaceSessionValue | null>(null);

export function CardFaceSessionProvider({ children }: { children: ReactNode }) {
  const [faces, setFaces] = useState<FaceMap>({});

  const getFace = useCallback(
    (key: string): CardImageFace => faces[key] || 'front',
    [faces],
  );

  const setFace = useCallback((key: string, face: CardImageFace) => {
    setFaces((prev) => {
      if (prev[key] === face) return prev;
      return { ...prev, [key]: face };
    });
  }, []);

  const value = useMemo(() => ({ getFace, setFace }), [getFace, setFace]);

  return (
    <CardFaceSessionContext.Provider value={value}>
      {children}
    </CardFaceSessionContext.Provider>
  );
}

export function useCardFaceSession(): CardFaceSessionValue | null {
  return useContext(CardFaceSessionContext);
}
