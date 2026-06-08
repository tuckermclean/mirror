import { z } from "zod";

export const VoiceCardSchema = z.object({
  vocabulary: z.array(z.string().min(1)),
  hedgesAvoided: z.array(z.string().min(1)),
  sentenceLengthDistribution: z
    .object({
      short: z.number().min(0).max(1),
      medium: z.number().min(0).max(1),
      long: z.number().min(0).max(1),
    })
    .refine((d) => Math.abs(d.short + d.medium + d.long - 1) <= 0.01, {
      message: "short + medium + long must sum to 1 (±0.01)",
    }),
  emotionalRegister: z.string().min(1),
  jargonHated: z.array(z.string().min(1)),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;
