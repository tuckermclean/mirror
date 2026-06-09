import { z } from "zod";

export const VoiceCardSchema = z.object({
  vocabulary: z.array(z.string()),
  hedgesAvoided: z.array(z.string()),
  sentenceLengthDistribution: z
    .object({
      short: z.number(),
      medium: z.number(),
      long: z.number(),
    })
    .refine((d) => d.short + d.medium + d.long >= 90 && d.short + d.medium + d.long <= 110, {
      message: "short + medium + long must sum to approximately 100 (90–110)",
    }),
  emotionalRegister: z.string(),
  jargonHated: z.array(z.string()),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;
