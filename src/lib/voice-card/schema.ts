import { z } from "zod";

export const VoiceCardSchema = z.object({
  vocabulary: z.array(z.string().min(1)),
  hedgesAvoided: z.array(z.string().min(1)),
  sentenceLengthDistribution: z
    .object({
      short: z.number().min(0),
      medium: z.number().min(0),
      long: z.number().min(0),
    })
    .refine((d) => d.short + d.medium + d.long >= 90 && d.short + d.medium + d.long <= 110, {
      message: "short + medium + long must sum to approximately 100 (90–110)",
    }),
  emotionalRegister: z.string().min(1),
  jargonHated: z.array(z.string().min(1)),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;
