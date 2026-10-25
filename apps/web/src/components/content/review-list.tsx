"use client";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Stars } from "@/components/product/product-card";
import type { Review } from "@pulso/domain";

export function ReviewList({ reviews, rating, reviewCount }: { reviews: Review[]; rating: number; reviewCount: number }) {
  return (
    <>
      {reviewCount ? <Stars rating={rating} /> : null}
      <ul className="mt-4 space-y-4">
        {reviews.map((review) => (
          <li key={review.id} className="border-t border-white/10 pt-3">
            <p className="text-lime">{"★".repeat(review.rating)} <span className="text-foreground">{review.title}</span></p>
            <p className="text-xs text-muted-foreground">{review.author} {review.handle} {review.verified ? "· compra verificada" : ""}</p>
            <p className="mt-1 text-sm">{review.body}</p>
            <div className="mt-2 flex gap-2">
              {review.photos.map((photo) => (
                <Dialog key={photo.alt}>
                  <DialogTrigger
                    className="grid h-16 w-16 place-items-center rounded-xl p-1 text-center text-[10px] leading-tight text-primary-foreground"
                    style={{ background: photo.hex }}
                    aria-label={`Abrir foto: ${photo.alt}`}
                  >
                    foto
                  </DialogTrigger>
                  <DialogContent>
                    <DialogTitle className="font-display text-3xl">Foto da avaliação</DialogTitle>
                    <div className="grid min-h-48 place-items-center rounded-2xl p-6 text-center text-primary-foreground" style={{ background: photo.hex }}>
                      {photo.alt}
                    </div>
                    <p className="text-sm text-muted-foreground">Ilustração de cor. Esta loja não usa foto de pessoa real.</p>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </li>
        ))}
        {reviews.length === 0 ? <li>Ainda sem review. O rótulo já está aberto pra leitura.</li> : null}
      </ul>
    </>
  );
}
