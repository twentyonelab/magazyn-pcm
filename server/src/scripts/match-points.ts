/**
 * Dopasowanie kontrolek z Loxone do punktow rejestru — po NAZWIE.
 *
 * Konwencja nazw na stanowisku (potwierdzona zrzutem z Loxone Config):
 *   1A_57HC   ->  poziom 1, przekatna A  ->  punkt A1
 *   3B_57HC   ->  poziom 3, przekatna B  ->  punkt B3
 *
 * Sufiks materialu (_57HC) jest odcinany PRZED szukaniem wzorca, bo zawiera
 * cyfry, ktore inaczej zmylilyby dopasowanie. Rozpoznajemy tez zapis
 * odwrotny (A1, B3) i nazwy z dodatkowym opisem ("Zbiornik 2A").
 *
 * DLACZEGO NAZWA SLUZY TYLKO DO DOPASOWANIA, A MAPOWANIE TRZYMA UUID:
 * nazwe w Loxone Config da sie zmienic jednym klikiem — przy zmianie
 * materialu z RT57HC na RT8HC ktos przemianuje kontrolki na 1A_8HC.
 * UUID sie wtedy NIE zmienia, wiec mapowanie przetrwa. Odwrotnie byloby
 * krucho: aplikacja przestalaby widziec sondy po zwyklej zmianie nazwy.
 */

import type { PointDef } from '@magazyn-pcm/shared';

export interface MatchCandidate {
  /** Nazwa kontrolki w Loxone Config. */
  name: string;
  /** UUID stanu `value` albo kontrolki. */
  uuid: string | null;
}

export interface Match {
  pointId: string;
  candidate: MatchCandidate;
}

export interface MatchResult {
  matches: Match[];
  /** Punkty rejestru, dla ktorych nie znalazlo sie nic. */
  unmatchedPoints: string[];
  /** Kontrolki, ktorych nie przypisano do zadnego punktu. */
  unusedCandidates: MatchCandidate[];
  /** Punkty, do ktorych pasowala wiecej niz jedna kontrolka. */
  ambiguous: Array<{ pointId: string; names: string[] }>;
}

/**
 * Wyciaga identyfikator punktu z nazwy kontrolki.
 * Zwraca np. "A1" albo null, gdy nazwa nic nie mowi o pozycji.
 */
export function pointIdFromName(rawName: string): string | null {
  // 1. Odetnij oznaczenie materialu: _57HC, 57HC, RT57HC, RT8HC, 8 HC...
  const withoutMaterial = rawName.replace(/_?\s*(RT)?\s*\d+\s*HC\b/gi, ' ');

  const name = withoutMaterial.toUpperCase();

  // 2. Zapis "poziom + przekatna": 1A, 2 B, ...
  const levelFirst = name.match(/(?<![A-Z0-9])([123])\s*([AB])(?![A-Z0-9])/);
  if (levelFirst) return `${levelFirst[2]}${levelFirst[1]}`;

  // 3. Zapis "przekatna + poziom": A1, B 3, ...
  const diagonalFirst = name.match(/(?<![A-Z0-9])([AB])\s*([123])(?![A-Z0-9])/);
  if (diagonalFirst) return `${diagonalFirst[1]}${diagonalFirst[2]}`;

  return null;
}

/**
 * Dopasowuje kontrolki do punktow magazynu PCM.
 * Punkty innych grup pomijamy — one nie maja konwencji nazw.
 */
export function matchCandidates(
  points: readonly PointDef[],
  candidates: readonly MatchCandidate[],
): MatchResult {
  const pcmIds = points.filter((p) => p.group === 'pcm').map((p) => p.id);

  // Zbierz wszystkie trafienia per punkt, zeby wykryc niejednoznacznosc.
  const byPoint = new Map<string, MatchCandidate[]>();
  const unused: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const pointId = pointIdFromName(candidate.name);
    if (!pointId || !pcmIds.includes(pointId)) {
      unused.push(candidate);
      continue;
    }
    const bucket = byPoint.get(pointId);
    if (bucket) bucket.push(candidate);
    else byPoint.set(pointId, [candidate]);
  }

  const matches: Match[] = [];
  const ambiguous: Array<{ pointId: string; names: string[] }> = [];

  for (const pointId of pcmIds) {
    const found = byPoint.get(pointId) ?? [];
    if (found.length === 1) {
      matches.push({ pointId, candidate: found[0]! });
    } else if (found.length > 1) {
      // Dwie kontrolki na jedna pozycje to zawsze blad konfiguracji
      // albo pozostalosc po starym czujniku — czlowiek musi wybrac.
      ambiguous.push({ pointId, names: found.map((c) => c.name) });
    }
  }

  return {
    matches,
    unmatchedPoints: pcmIds.filter(
      (id) => !matches.some((m) => m.pointId === id) && !ambiguous.some((a) => a.pointId === id),
    ),
    unusedCandidates: unused,
    ambiguous,
  };
}

/**
 * Wstawia UUID-y do tekstu points.config.ts.
 *
 * Podmieniamy WYLACZNIE `uuid: null` nalezace do wskazanego `id`. Regex jest
 * przywiazany do pary linii (id, uuid), a nie do samego `null` — inaczej
 * mogloby trafic w cokolwiek innego w pliku.
 *
 * Zwraca nowy tekst i liste punktow, ktorych nie udalo sie podmienic.
 */
export function applyUuids(
  source: string,
  assignments: ReadonlyArray<{ pointId: string; uuid: string }>,
  overwrite: boolean,
): { text: string; failed: string[]; skipped: string[] } {
  let text = source;
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const { pointId, uuid } of assignments) {
    // Sanity: UUID Loxone to znaki szesnastkowe i myslniki. Nic innego nie
    // moze wejsc do pliku zrodlowego.
    if (!/^[A-Za-z0-9-]+$/.test(uuid)) {
      failed.push(pointId);
      continue;
    }

    const pattern = new RegExp(
      `(id:\\s*'${pointId}',\\s*\\r?\\n\\s*uuid:\\s*)(null|'[^']*')`,
    );
    const found = text.match(pattern);

    if (!found) {
      failed.push(pointId);
      continue;
    }

    if (found[2] !== 'null' && !overwrite) {
      skipped.push(pointId);
      continue;
    }

    text = text.replace(pattern, `$1'${uuid}'`);
  }

  return { text, failed, skipped };
}
