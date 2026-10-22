"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Hover só no cliente. `initial={false}` mantém o primeiro HTML igual ao do servidor.
 * Quem prefere menos movimento já zera a duração em globals.css.
 */
export function Lift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={false} whileHover={{ y: -6 }} transition={{ duration: 0.2 }}>
      {children}
    </motion.div>
  );
}
