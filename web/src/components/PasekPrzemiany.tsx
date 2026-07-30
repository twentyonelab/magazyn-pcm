/**
 * Pasek skali barwnej z pasmem przemiany — nagłówek widoku Magazyn.
 *
 * Zwinięty pokazuje to, co trzeba wiedzieć od pierwszego spojrzenia: jaka
 * parafina jest w zbiorniku i gdzie leży jej pasmo przemiany. Rozwinięty
 * dodaje wybór parafiny i dane materiału.
 *
 * Dlaczego pasmo przemiany jest tutaj, a nie w panelu bocznym: to jedyna
 * informacja, bez której kolory na schemacie nic nie znaczą. Punkt wewnątrz
 * plateau to zupełnie inny stan niż punkt poza nim — i to musi być widoczne
 * zanim spojrzy się na zbiornik, nie po.
 */

import { useState } from 'react';
import type { MaterialProfile, MaterialsResponse, PcmMaterial } from '@magazyn-pcm/shared';
import { phaseBandBounds, rampColor } from '../scale.js';

interface Props {
  profile: MaterialProfile | null;
  materials: MaterialsResponse | null;
  /** Parafina narzucona przez trwającą sesję albo null. */
  fromSession: PcmMaterial | null;
  /** Parafina wynikająca z rozpoznanego zbiornika albo null. */
  detected: PcmMaterial | null;
  preview: PcmMaterial;
  onPreviewChange: (material: PcmMaterial) => void;
  /** Objętości zbiorników — pokazywane po rozwinięciu. */
  volumesL?: { storage: number; buffer: number };
}

export function PasekPrzemiany({
  profile,
  materials,
  fromSession,
  detected,
  preview,
  onPreviewChange,
  volumesL,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!profile || !materials) return null;

  const band = phaseBandBounds(profile);
  const gradient = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
    .map((stop) => `${rampColor(stop)} ${stop * 100}%`)
    .join(', ')})`;

  const locked = fromSession !== null || detected !== null;
  const source = fromSession ? 'z sesji' : detected ? 'z sond' : 'podgląd';
  const profiles = Object.values(materials.profiles) as MaterialProfile[];

  return (
    <section className={`bandbar${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="bandbar__head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={open ? 'Zwiń szczegóły' : 'Rozwiń szczegóły parafiny'}
      >
        <span className="bandbar__material">
          <span className="bandbar__name">{profile.label}</span>
          <span className="bandbar__source">{source}</span>
        </span>

        <span className="bandbar__scale">
          <span className="bandbar__min mono">{profile.scaleMin} °C</span>
          <span className="bandbar__track" style={{ background: gradient }}>
            {/* Pasmo przemiany — osobne oznaczenie, nie odcień. */}
            <span
              className="bandbar__band"
              style={{ left: `${band.left}%`, width: `${band.width}%` }}
            />
          </span>
          <span className="bandbar__max mono">{profile.scaleMax} °C</span>
        </span>

        <span className="bandbar__phase mono">
          przemiana {profile.phaseBandMin}–{profile.phaseBandMax} °C
        </span>

        <span className="bandbar__chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open ? (
        <div className="bandbar__body">
          <div className="bandbar__switch" role="group" aria-label="Wybór parafiny">
            {profiles.map((item) => {
              const active = item.id === profile.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`parafina__option${active ? ' is-active' : ''}`}
                  disabled={locked && !active}
                  aria-pressed={active}
                  onClick={() => !locked && onPreviewChange(item.id)}
                  title={
                    fromSession
                      ? 'Parafina pochodzi z trwającej sesji — zmień ją, kończąc sesję'
                      : detected
                        ? 'Parafina wynika z rozpoznanego zbiornika'
                        : `Przemiana ${item.phaseBandMin}–${item.phaseBandMax} °C`
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <dl className="bandbar__facts">
            <div>
              <dt>ciepło utajone</dt>
              <dd className="mono">{profile.latentHeat} kJ/kg</dd>
            </div>
            <div>
              <dt>temperatura maks.</dt>
              <dd className="mono">{profile.tMax} °C</dd>
            </div>
            <div>
              <dt>szczyt topnienia</dt>
              <dd className="mono">{profile.peak} °C</dd>
            </div>
            {volumesL ? (
              <div>
                <dt>magazyn / bufor</dt>
                <dd className="mono">
                  {volumesL.storage} / {volumesL.buffer} l
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="bandbar__note">
            {fromSession
              ? 'Parafina pochodzi z trwającej sesji. Żeby ją zmienić, zakończ sesję i zacznij nową.'
              : detected
                ? 'Rozpoznana po sondach podłączonego zbiornika. Po wymianie zbiornika przełączy się sama.'
                : 'Podgląd bez sesji i bez rozpoznanego zbiornika. Przy prawdziwym teście parafinę wybierasz, zakładając sesję.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
