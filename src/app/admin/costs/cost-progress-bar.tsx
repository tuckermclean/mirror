"use client";

import { motion } from "framer-motion";

export default function CostProgressBar({ pctUsed }: { pctUsed: number }) {
  const clamped = Math.min(100, Math.max(0, pctUsed));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Monthly LLM spend"
      className="h-2 rounded-full bg-secondary overflow-hidden"
    >
      <motion.div
        className={`h-full rounded-full ${clamped >= 80 ? "bg-destructive" : "bg-primary"}`}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}
