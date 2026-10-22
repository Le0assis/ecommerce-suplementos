"use client";

import {
  applyCatalogPatches,
  coupons,
  influencers,
  posts,
  products as seedProducts,
  reviews,
  ugc,
  upcomingDrop,
  type CatalogProduct,
} from "@pulso/data";
import type { Coupon, Influencer, Post, Review, UgcPost } from "@pulso/domain";
import { createContext, useContext, useEffect, useMemo } from "react";
import { usePulso } from "@/lib/store";

interface StoreData {
  products: CatalogProduct[];
  allProducts: CatalogProduct[];
  reviews: Review[];
  influencers: Influencer[];
  posts: Post[];
  ugc: UgcPost[];
  coupons: Coupon[];
  upcomingDrop: typeof upcomingDrop;
}

const StoreDataContext = createContext<StoreData | null>(null);

export function StoreDataProvider({ children }: { children: React.ReactNode }) {
  const patches = usePulso((state) => state.patches);
  const hydrated = usePulso((state) => state.hydrated);

  useEffect(() => {
    void usePulso.persist.rehydrate();
  }, []);

  const value = useMemo<StoreData>(() => {
    const allProducts = hydrated ? applyCatalogPatches(seedProducts, patches) : seedProducts;
    return {
      allProducts,
      products: allProducts.filter((product) => !product.hidden),
      reviews,
      influencers,
      posts,
      ugc,
      coupons,
      upcomingDrop,
    };
  }, [patches, hydrated]);

  return <StoreDataContext.Provider value={value}>{children}</StoreDataContext.Provider>;
}

export function useStoreData(): StoreData {
  const value = useContext(StoreDataContext);
  if (!value) throw new Error("useStoreData precisa ficar dentro do provider.");
  return value;
}
