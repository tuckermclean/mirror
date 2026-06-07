import { z } from "zod";

export const VoiceCardSchema = z.object({
  vocabulary: z.array(z.string()),
  hedgesAvoided: z.array(z.string()),
  sentenceLengthDistribution: z.object({
    short: z.number(),
    medium: z.number(),
    long: z.number(),
  }),
  emotionalRegister: z.string(),
  jargonHated: z.array(z.string()),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;
