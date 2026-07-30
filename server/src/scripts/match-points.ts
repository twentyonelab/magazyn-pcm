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

import type { BankId, PointDef } from '@magazyn-pcm/shared';

export interface MatchCandidate {
  /** Nazwa kontrolki w Loxone Config. */
  name: string;
  /** UUID stanu `value` albo kontrolki. */
  uuid: string | null;
}

export interface Match {
  pointId: string;
  /** Zestaw (wymienny zbiornik) albo null, gdy sonda nie nalezy do zbiornika. */
  bank: BankId | null;
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
 * Wyciaga zestaw (wymienny zbiornik) z nazwy kontrolki.
 *
 * Zestaw jest tozsamy z parafina, a ta siedzi w nazwie jako oznaczenie
 * materialu: 1A_57HC -> zbiornik z parafina 57HC, 1A_8HC -> z 8HC.
 * Zwraca null, gdy nazwa nie mowi o materiale — wtedy sonda nie nalezy
 * do zadnego z wymiennych zbiornikow albo nazwa wymaga poprawy.
 */
export function bankFromName(rawName: string): BankId | null {
  const match = rawName.match(/(?:RT)?\s*(\d+)\s*HC\b/i);
  if (!match) return null;

  const number = match[1];
  if (number === '57') return 'RT57HC';
  if (number === '8') return 'RT8HC';
  return null;
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
  const pcmPoints = points.filter((p) => p.group === 'pcm');
  const pcmIds = pcmPoints.map((p) => p.id);
  /** Ktore punkty maja wymienne zbiorniki. */
  const banked = new Set(pcmPoints.filter((p) => p.uuidByBank).map((p) => p.id));

  // Grupujemy po PARZE (pozycja, zestaw) — dwie sondy o tej samej pozycji
  // w roznych zbiornikach to NIE konflikt, tylko dwa osobne przypisania.
  const byKey = new Map<string, MatchCandidate[]>();
  const unused: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const pointId = pointIdFromName(candidate.name);
    if (!pointId || !pcmIds.includes(pointId)) {
      unused.push(candidate);
      continue;
    }

    // Punkt z wymiennymi zbiornikami wymaga rozpoznania zestawu z nazwy.
    // Bez tego nie wiedzielibysmy, do ktorego zbiornika wpisac UUID.
    const bank = banked.has(pointId) ? bankFromName(candidate.name) : null;
    if (banked.has(pointId) && bank === null) {
      unused.push(candidate);
      continue;
    }

    const key = `${pointId}|${bank ?? ''}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(candidate);
    else byKey.set(key, [candidate]);
  }

  const matches: Match[] = [];
  const ambiguous: Array<{ pointId: string; names: string[] }> = [];
  const covered = new Set<string>();

  for (const [key, found] of byKey) {
    const [pointId, bankKey] = key.split('|');
    const bank = (bankKey || null) as BankId | null;

    if (found.length === 1) {
      matches.push({ pointId: pointId!, bank, candidate: found[0]! });
      covered.add(pointId!);
    } else {
      // Dwie kontrolki na te sama pozycje w TYM SAMYM zbiorniku to blad
      // konfiguracji albo pozostalosc po starym czujniku — czlowiek wybiera.
      ambiguous.push({
        pointId: bank ? `${pointId} (${bank})` : pointId!,
        names: found.map((c) => c.name),
      });
      covered.add(pointId!);
    }
  }

  return {
    matches,
    unmatchedPoints: pcmIds.filter((id) => !covered.has(id)),
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
  assignments: ReadonlyArray<{ pointId: string; bank: BankId | null; uuid: string }>,
  overwrite: boolean,
): { text: string; failed: string[]; skipped: string[] } {
  let text = source;
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const { pointId, bank, uuid } of assignments) {
    const label = bank ? `${pointId}/${bank}` : pointId;

    // Sanity: UUID Loxone to znaki szesnastkowe i myslniki. Nic innego nie
    // moze wejsc do pliku zrodlowego.
    if (!/^[A-Za-z0-9-]+$/.test(uuid)) {
      failed.push(label);
      continue;
    }

    // Blok punktu wyznaczamy od jego `id` do nastepnego `id:` albo konca
    // tablicy — podmiana musi zostac WEWNATRZ wlasciwego punktu.
    const blockPattern = new RegExp(`(id:\\s*'${pointId}',)([\\s\\S]*?)(?=\\n\\s*(?:id:\\s*'|\\];))`);
    const block = text.match(blockPattern);

    if (!block) {
      failed.push(label);
      continue;
    }

    const body = block[2]!;
    let newBody: string;

    if (bank) {
      // Podmieniamy wartosc przy wlasciwym kluczu wewnatrz uuidByBank.
      const slotPattern = new RegExp(`(${bank}:\\s*)(null|'[^']*')`);
      const slot = body.match(slotPattern);

      if (!slot) {
        failed.push(label);
        continue;
      }
      if (slot[2] !== 'null' && !overwrite) {
        skipped.push(label);
        continue;
      }
      newBody = body.replace(slotPattern, `$1'${uuid}'`);
    } else {
      const slotPattern = /(uuid:\s*)(null|'[^']*')/;
      const slot = body.match(slotPattern);

      if (!slot) {
        failed.push(label);
        continue;
      }
      if (slot[2] !== 'null' && !overwrite) {
        skipped.push(label);
        continue;
      }
      newBody = body.replace(slotPattern, `$1'${uuid}'`);
    }

    text = text.replace(blockPattern, `$1${newBody}`);
  }

  return { text, failed, skipped };
}
