"use client";

import { motion } from "framer-motion";

export default function CostProgressBar({ pctUsed }: { pctUsed: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pctUsed)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Monthly LLM spend"
      className="h-2 rounded-full bg-secondary overflow-hidden"
    >
      <motion.div
        className={`h-full rounded-full ${pctUsed >= 80 ? "bg-destructive" : "bg-primary"}`}
        initial={{ width: 0 }}
        animate={{ width: `${pctUsed}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}
