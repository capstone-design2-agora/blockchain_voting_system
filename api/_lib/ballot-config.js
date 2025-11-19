import { z } from "zod";

export const BallotProposal = z.object({
  name: z.string().min(1),
  pledges: z.array(z.string().min(1)).min(1)
});

export const BallotSchedule = z.object({
  opensAt: z.string().min(1),
  closesAt: z.string().min(1),
  announcesAt: z.string().min(1)
});

export const BallotConfigSchema = z.object({
  ballotId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  expectedVoters: z.number().int().positive(),
  schedule: BallotSchedule,
  proposals: z.array(BallotProposal).min(1),
  mascotCid: z.string().optional(),
  verifierAddress: z.string().optional()
});

export class BallotConfigError extends Error {
  constructor(message, issues) {
    super(message);
    this.issues = issues;
    this.name = "BallotConfigError";
  }
}
