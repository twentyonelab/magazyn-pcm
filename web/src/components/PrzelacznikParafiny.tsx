/**
 * Przelacznik parafiny — 8HC albo 57HC.
 *
 * Od materialu zalezy CALA skala barwna i pasmo przemiany, wiec od niego
 * zalezy tez, czy z ekranu da sie cokolwiek wyczytac: plateau 8HC ma 2 K
 * szerokosci przy skali 0-20 stopni, a 57HC lezy przy 55-58 stopniach.
 * Pomylka nie daje bledu, tylko obraz w jednym kolorze.
 *
 * ZASADA: material jest atrybutem SESJI BADAWCZEJ, nie preferencja
 * przegladarki. Dlatego przelacznik dziala tylko wtedy, gdy zadna sesja nie
 * trwa — sluzy do ustawienia skali podgladu. Gdy sesja trwa, pokazuje jej
 * material i mowi wprost, ze zmiana idzie przez sesje. Inaczej dwie osoby
 * patrzylyby na te same dane w dwoch skalach i obie bylyby przekonane,
 * ze widza prawde.
 */

import type { MaterialProfile, MaterialsResponse, PcmMaterial } from '@magazyn-pcm/shared';

interface Props {
  materials: MaterialsResponse | null;
  /** Material narzucony przez trwajaca sesje albo null. */
  fromSession: PcmMaterial | null;
  /**
   * Zbiornik rozpoznany po sondach albo null. Wymienne zbiorniki maja rozne
   * parafiny, wiec rozpoznanie zestawu jest mocniejsza przeslanka niz
   * preferencja przegladarki — ale slabsza niz deklaracja badacza w sesji.
   */
  detected: PcmMaterial | null;
  /** Material wybrany do podgladu (gdy nie ma ani sesji, ani rozpoznania). */
  preview: PcmMaterial;
  onPreviewChange: (material: PcmMaterial) => void;
}

export function PrzelacznikParafiny({
  materials,
  fromSession,
  detected,
  preview,
  onPreviewChange,
}: Props) {
  if (!materials) return null;

  const profiles = Object.values(materials.profiles) as MaterialProfile[];
  const active = fromSession ?? detected ?? preview;
  const locked = fromSession !== null || detected !== null;
  const source = fromSession ? 'z sesji' : detected ? 'z sond' : null;

  return (
    <div className="parafina">
      <div className="parafina__head">
        <span className="parafina__title">parafina</span>
        {source ? <span className="parafina__lock">{source}</span> : null}
      </div>

      <div className="parafina__switch" role="group" aria-label="Wybór parafiny">
        {profiles.map((profile) => {
          const isActive = profile.id === active;
          return (
            <button
              key={profile.id}
              type="button"
              className={`parafina__option${isActive ? ' is-active' : ''}`}
              disabled={locked && !isActive}
              aria-pressed={isActive}
              title={
                fromSession
                  ? 'Parafina pochodzi z trwającej sesji — zmień ją, kończąc sesję i zakładając nową'
                  : detected
                    ? 'Parafina wynika z rozpoznanego zbiornika — wymień zbiornik, żeby ją zmienić'
                    : `Przemiana ${profile.phaseBandMin}–${profile.phaseBandMax} °C, skala ${profile.scaleMin}–${profile.scaleMax} °C`
              }
              onClick={() => !locked && onPreviewChange(profile.id)}
            >
              {profile.label}
            </button>
          );
        })}
      </div>

      <p className="parafina__note">
        {fromSession
          ? 'Parafina pochodzi z trwającej sesji. Żeby ją zmienić, zakończ sesję i zacznij nową.'
          : detected
            ? 'Rozpoznana po sondach podłączonego zbiornika. Po wymianie zbiornika przełączy się sama.'
            : 'Podgląd bez sesji i bez rozpoznanego zbiornika. Przy prawdziwym teście parafinę wybierasz, zakładając sesję.'}
      </p>
    </div>
  );
}
