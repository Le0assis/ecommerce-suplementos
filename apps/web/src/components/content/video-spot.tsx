"use client";

import type { VideoSpot as Spot } from "@pulso/data";
import { useState } from "react";

export function VideoSpot({ spot }: { spot: Spot }) {
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const color = spot.frames[frame] ?? spot.frames[0];

  return (
    <figure className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-black">
      <div className="grid min-h-56 place-items-end p-4" style={{ background: color, color: frame === 1 ? "#f6f6f4" : "#101402" }}>
        <button
          type="button"
          className="rounded-full bg-black px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white"
          aria-pressed={playing}
          onClick={() => {
            const next = !playing;
            setPlaying(next);
            setFrame(next ? (frame + 1) % spot.frames.length : 0);
          }}
        >
          {playing ? "Próximo quadro" : `Assistir ${spot.duration}`}
        </button>
      </div>
      <figcaption className="space-y-2 p-4">
        <p className="font-display text-4xl leading-none">{spot.title}</p>
        <p className="text-sm text-muted-foreground">{spot.caption}</p>
        {playing ? (
          <ol className="space-y-1 text-sm">
            {spot.transcript.map((line) => <li key={line}>{line}</li>)}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">Spot desenhado em quadro. Sem arquivo de vídeo de outra marca.</p>
        )}
      </figcaption>
    </figure>
  );
}
