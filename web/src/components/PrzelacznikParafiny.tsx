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
  /** Material wybrany do podgladu (gdy sesji nie ma). */
  preview: PcmMaterial;
  onPreviewChange: (material: PcmMaterial) => void;
}

export function PrzelacznikParafiny({ materials, fromSession, preview, onPreviewChange }: Props) {
  if (!materials) return null;

  const profiles = Object.values(materials.profiles) as MaterialProfile[];
  const active = fromSession ?? preview;
  const locked = fromSession !== null;

  return (
    <div className="parafina">
      <div className="parafina__head">
        <span className="parafina__title">parafina</span>
        {locked ? <span className="parafina__lock">z sesji</span> : null}
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
                locked
                  ? 'Materiał pochodzi z trwającej sesji — zmień go, kończąc sesję i zakładając nową'
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
        {locked
          ? 'Materiał pochodzi z trwającej sesji. Żeby go zmienić, zakończ sesję i zacznij nową.'
          : 'Podgląd bez sesji. Przy prawdziwym teście materiał wybierasz, zakładając sesję — wtedy zapisze się razem z danymi.'}
      </p>
    </div>
  );
}
